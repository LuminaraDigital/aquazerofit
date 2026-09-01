// Load .env from the monorepo root BEFORE any other import so that
// config.ts (which reads process.env at import time via getters) and every
// downstream module see the real values. dotenv never overrides vars that
// are already set in the shell, so real deployment env wins over .env.
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// apps/api/src -> apps/api -> repo root
dotenv.config({ path: path.resolve(here, '..', '..', '..', '.env') });

import { createApp } from './app';
import { config, assertProductionSecrets, assertSingleInstance } from './platform/config';
import { warnIfBotProtectionUnconfigured } from './platform/botProtection';
import { describeStoreInitFailure, getStore, initStore } from './platform/store';
import { sweepExpiredDeletions } from './modules/me/service';
import { sweepIdempotencyRecords } from './modules/logs/service';
import { sweepVisionArtifacts } from './modules/vision/router';
import { sweepGrowthEvents } from './modules/analytics/router';

// Fail fast: never boot a production process on dev fallback secrets.
assertProductionSecrets();
// Fail fast: this store is not multi-instance safe and a second instance loses
// data silently. See assertSingleInstance() for the full reasoning and for why
// the count is declared (AZF_INSTANCE_COUNT) rather than detected. Placed here
// rather than at config import time on purpose: the hazard is N concurrently
// SERVING API processes, and the one-shot CLI entrypoints (seed, importers)
// import config too and must stay runnable alongside a running server.
assertSingleInstance();
// Advisory rather than fatal: an unprotected signup form is a real weakness,
// but killing a deploy over incomplete Cloudflare onboarding is a worse one.
warnIfBotProtectionUnconfigured();

// Build the store before anything reads it. Under the Postgres backing
// (DATABASE_URL set by a managed host) hydration is async while getStore() stays
// synchronous, so the singleton has to exist before the boot sweeps below and
// before the first request is accepted — getStore() throws otherwise rather
// than hand out an empty store that would look like a fresh database.
//
// A store that cannot initialise is fatal, and the raw pg driver error names a
// syscall, not a cause. Say what actually went wrong (connection refused, bad
// credentials, missing database) and exit non-zero so the platform restarts
// and alerts on a legible failure instead of a silent crash.
try {
  await initStore();
} catch (err) {
  console.error(`[fatal] store initialisation failed — ${describeStoreInitFailure(err)}`);
  console.error(err);
  process.exit(1);
}

const app = createApp();

// ----- background sweeps (boot + interval; timers unref'ed so they never
// keep a shutting-down process alive) -----

function runDeletionSweep(): void {
  try {
    const purged = sweepExpiredDeletions();
    if (purged > 0) console.log(`[sweep] purged ${purged} account(s) past deletion grace`);
  } catch (err) {
    console.error('[sweep] deletion sweep failed', err);
  }
}

function runGrowthEventSweep(): void {
  try {
    const removed = sweepGrowthEvents();
    if (removed > 0) console.log(`[sweep] removed ${removed} growth event(s) past retention`);
  } catch (err) {
    console.error('[sweep] growth event sweep failed', err);
  }
}

function runIdempotencySweep(): void {
  try {
    const pruned = sweepIdempotencyRecords();
    if (pruned > 0) console.log(`[sweep] pruned ${pruned} expired idempotency record(s)`);
  } catch (err) {
    console.error('[sweep] idempotency sweep failed', err);
  }
}

function runVisionSweep(): void {
  sweepVisionArtifacts()
    .then((n) => {
      if (n > 0) console.log(`[sweep] removed ${n} expired meal photo job(s)`);
    })
    .catch((err) => console.error('[sweep] vision sweep failed', err));
}

runDeletionSweep();
runGrowthEventSweep();
// Prune on boot as well as on the interval: a process that restarts more often
// than the interval would otherwise never sweep at all, which is exactly how
// the idempotency backlog grew unbounded in the first place.
runIdempotencySweep();
runVisionSweep();
setInterval(runDeletionSweep, 6 * 3600 * 1000).unref();
setInterval(runGrowthEventSweep, 6 * 3600 * 1000).unref();
setInterval(runVisionSweep, 3600 * 1000).unref();
// unref'ed like its neighbours so a pending sweep can never hold a shutting
// down process open, and not scheduled at all under test — nothing in the
// suite loads this module today, but a timer that outlives a test worker is a
// hang nobody enjoys diagnosing, so the guard is stated rather than assumed.
if (!config.isTest) {
  setInterval(runIdempotencySweep, config.idempotencySweepIntervalMs).unref();
}

const server = app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`AquaZeroFit API listening on http://localhost:${config.port}${config.basePath}`);
});

// ----- graceful shutdown -----
//
// Writes are acknowledged from memory and flushed to disk on a coalescing
// macrotask, so exiting on SIGTERM without draining loses every write made in
// the final tick. Container platforms send SIGTERM and then wait (Azure
// Container Apps allows 30s) before SIGKILL, so drain within that budget:
// stop accepting connections, let in-flight requests finish, then flush.

const SHUTDOWN_GRACE_MS = 25_000;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received; draining`);

  // Hard stop if a hung socket keeps the drain from completing.
  const failsafe = setTimeout(() => {
    console.error('[shutdown] grace period expired; forcing exit');
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  failsafe.unref();

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await getStore().flush();
    console.log('[shutdown] drained cleanly');
    process.exit(0);
  } catch (err) {
    console.error('[shutdown] failed to drain', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Node terminates the process on an unhandled rejection. Several lanes fire
// background work with `void`, so log the cause before the process dies —
// otherwise the crash is silent and unattributable in the platform logs.
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandled promise rejection', reason);
  void shutdown('unhandledRejection');
});

process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaught exception', err);
  void shutdown('uncaughtException');
});
