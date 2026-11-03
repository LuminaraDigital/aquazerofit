/**
 * Tamper-evident hash chain for security and data-access audit events (EN-4.2).
 *
 * Design:
 * - Every `AuditEvent` (`authEvent` | `dataAccessEvent` | `guardrailTrigger`)
 *   written to the `audit` container is stamped with a monotonic 1-based `seq`,
 *   `prevHash` (`'GENESIS'` for `seq === 1`), and `hash` (SHA-256 hex).
 * - The digest commits to `(seq, prevHash, id, type, action, createdAt)` — the
 *   immutable structural envelope that survives GDPR / AQF-06 §6 account erasure
 *   (`purgeUser`), which replaces `userId` with `'anonymised'` and scrubs raw
 *   identifiers in `detail` without invalidating historical hashes.
 * - Analytics `GrowthEvent`s (`type === 'growthEvent'`) share the `audit`
 *   container but are subject to retention pruning (`sweepExpiredGrowthEvents`),
 *   so they are intentionally excluded from the hash chain.
 */
import crypto from 'node:crypto';
import type { AuditEvent } from '@aquazerofit/shared';
import { getStore, type MemoryBackedStore, type StoredDoc } from './store';

export const AUDIT_CHAIN_GENESIS = 'GENESIS';

const CHAINED_AUDIT_TYPES = new Set<string>([
  'authEvent',
  'dataAccessEvent',
  'guardrailTrigger',
]);

export interface ChainedAuditFields {
  seq: number;
  prevHash: string;
  id: string;
  type: string;
  action: string;
  createdAt: string;
}

export interface AuditChainVerificationResult {
  valid: boolean;
  count: number;
  headHash: string;
  brokenAtId?: string;
  brokenAtSeq?: number;
  reason?: string;
}

/** True when `doc` is a security/compliance `AuditEvent` (not a prunable `growthEvent`). */
export function isChainedAuditDoc(doc: StoredDoc): doc is StoredDoc & AuditEvent {
  const raw = doc as unknown as Record<string, unknown>;
  return (
    typeof raw.id === 'string' &&
    typeof raw.type === 'string' &&
    CHAINED_AUDIT_TYPES.has(raw.type) &&
    typeof raw.action === 'string' &&
    typeof raw.createdAt === 'string'
  );
}

/** Deterministic SHA-256 hex digest over the immutable audit envelope fields. */
export function computeAuditEventHash(fields: ChainedAuditFields): string {
  const canonical = JSON.stringify([
    fields.seq,
    fields.prevHash,
    fields.id,
    fields.type,
    fields.action,
    fields.createdAt,
  ]);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Verify the integrity of the audit hash chain in `targetStore`.
 *
 * Detects:
 * - Modified `id`, `type`, `action`, `createdAt`, `seq`, `prevHash`, or `hash`
 * - Deleted events (gaps in `seq` or broken `prevHash` links)
 * - Inserted or reordered events
 */
export function verifyAuditChain(
  targetStore: Pick<MemoryBackedStore, 'all'> = getStore(),
): AuditChainVerificationResult {
  const allChained = targetStore.all<StoredDoc>('audit').filter(isChainedAuditDoc);

  for (const doc of allChained) {
    if (
      typeof doc.seq !== 'number' ||
      typeof doc.prevHash !== 'string' ||
      typeof doc.hash !== 'string'
    ) {
      return {
        valid: false,
        count: allChained.length,
        headHash: AUDIT_CHAIN_GENESIS,
        brokenAtId: doc.id,
        brokenAtSeq: typeof doc.seq === 'number' ? doc.seq : undefined,
        reason: 'Missing hash chain fields on audit event',
      };
    }
  }

  const chained = [...allChained].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

  let expectedSeq = 1;
  let expectedPrevHash = AUDIT_CHAIN_GENESIS;

  for (const event of chained) {
    if (event.seq !== expectedSeq) {
      return {
        valid: false,
        count: chained.length,
        headHash: expectedPrevHash,
        brokenAtId: event.id,
        brokenAtSeq: event.seq,
        reason: `Sequence gap or duplicate: expected seq ${expectedSeq}, found ${String(event.seq)}`,
      };
    }
    if (event.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        count: chained.length,
        headHash: expectedPrevHash,
        brokenAtId: event.id,
        brokenAtSeq: event.seq,
        reason: `Broken prevHash link at seq ${expectedSeq}`,
      };
    }
    const recomputed = computeAuditEventHash({
      seq: event.seq,
      prevHash: event.prevHash,
      id: event.id,
      type: event.type,
      action: event.action,
      createdAt: event.createdAt,
    });
    if (event.hash !== recomputed) {
      return {
        valid: false,
        count: chained.length,
        headHash: expectedPrevHash,
        brokenAtId: event.id,
        brokenAtSeq: event.seq,
        reason: `Digest mismatch at seq ${expectedSeq}`,
      };
    }
    expectedSeq += 1;
    expectedPrevHash = event.hash;
  }

  return {
    valid: true,
    count: chained.length,
    headHash: expectedPrevHash,
  };
}
