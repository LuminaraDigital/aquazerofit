import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuditEvent } from '@aquazerofit/shared';
import {
  AUDIT_CHAIN_GENESIS,
  computeAuditEventHash,
  verifyAuditChain,
} from '../platform/auditChain';
import { getStore, newId, resetStoreSingletonForTests } from '../platform/store';
import { auditDataAccess, purgeUser } from '../modules/me/service';

describe('tamper-evident audit hash chain (EN-4.2)', () => {
  const originalDataDir = process.env.AZF_DATA_DIR;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-audit-chain-'));
    process.env.AZF_DATA_DIR = tempDir;
    resetStoreSingletonForTests();
  });

  afterEach(async () => {
    await getStore().flush();
    if (originalDataDir === undefined) delete process.env.AZF_DATA_DIR;
    else process.env.AZF_DATA_DIR = originalDataDir;
    resetStoreSingletonForTests();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('stamps seq, prevHash, and SHA-256 hash on each AuditEvent from GENESIS', () => {
    auditDataAccess('usr-1', 'consents.update', { aiPersonalization: true });
    auditDataAccess('usr-1', 'export', {});
    getStore().upsert('audit', {
      id: newId('aud'),
      userId: 'usr-1',
      type: 'authEvent',
      action: 'login.succeeded',
      createdAt: '2026-11-03T10:00:00.000Z',
    });

    const events = getStore()
      .all<AuditEvent>('audit')
      .filter((d) => d.type === 'dataAccessEvent' || d.type === 'authEvent')
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

    expect(events).toHaveLength(3);
    expect(events[0].seq).toBe(1);
    expect(events[0].prevHash).toBe(AUDIT_CHAIN_GENESIS);
    expect(events[0].hash).toBe(
      computeAuditEventHash({
        seq: 1,
        prevHash: AUDIT_CHAIN_GENESIS,
        id: events[0].id,
        type: events[0].type,
        action: events[0].action,
        createdAt: events[0].createdAt,
      }),
    );
    expect(events[1].seq).toBe(2);
    expect(events[1].prevHash).toBe(events[0].hash);
    expect(events[2].seq).toBe(3);
    expect(events[2].prevHash).toBe(events[1].hash);

    const verification = verifyAuditChain();
    expect(verification.valid).toBe(true);
    expect(verification.count).toBe(3);
    expect(verification.headHash).toBe(events[2].hash);
  });

  it('detects tampering when an event action or timestamp is altered in place', () => {
    auditDataAccess('usr-1', 'consents.update', {});
    auditDataAccess('usr-1', 'export', {});

    const second = getStore()
      .all<AuditEvent>('audit')
      .find((d) => d.seq === 2)!;

    getStore().upsert('audit', {
      ...second,
      action: 'consents.update',
    });

    const verification = verifyAuditChain();
    expect(verification.valid).toBe(false);
    expect(verification.brokenAtId).toBe(second.id);
    expect(verification.brokenAtSeq).toBe(2);
    expect(verification.reason).toContain('Digest mismatch');
  });

  it('detects deletion of an event from the middle of the chain', () => {
    auditDataAccess('usr-1', 'consents.update', {});
    auditDataAccess('usr-1', 'export', {});
    auditDataAccess('usr-1', 'deletion.requested', {});

    const middle = getStore()
      .all<AuditEvent>('audit')
      .find((d) => d.seq === 2)!;
    getStore().delete('audit', middle.id);

    const verification = verifyAuditChain();
    expect(verification.valid).toBe(false);
    expect(verification.brokenAtSeq).toBe(3);
    expect(verification.reason).toContain('Sequence gap');
  });

  it('preserves hash chain validity across GDPR account erasure (purgeUser)', async () => {
    const store = getStore();
    store.upsert('users', {
      id: 'usr-purge-chain',
      email: 'purge@example.com',
      displayName: 'Purge Test',
      role: 'user',
      createdAt: new Date().toISOString(),
    });
    auditDataAccess('usr-purge-chain', 'consents.update', { email: 'purge@example.com' });
    auditDataAccess('usr-other', 'export', {});

    await purgeUser('usr-purge-chain');

    const verification = verifyAuditChain();
    expect(verification.valid).toBe(true);
    expect(verification.count).toBe(2);

    const purgedAudit = store
      .all<AuditEvent>('audit')
      .find((d) => d.seq === 1)!;
    expect(purgedAudit.userId).toBe('anonymised');
    expect((purgedAudit.detail as { email?: string }).email).not.toBe('purge@example.com');
  });

  it('preserves existing seq on in-place upsert without seq and detects stripped hash fields', () => {
    auditDataAccess('usr-1', 'consents.update', {});
    auditDataAccess('usr-1', 'export', {});

    const first = getStore()
      .all<AuditEvent>('audit')
      .find((d) => d.seq === 1)!;

    // In-place update omitting seq/prevHash/hash must NOT re-sequence the event to seq 3.
    getStore().upsert('audit', {
      id: first.id,
      userId: 'anonymised',
      type: first.type,
      action: first.action,
      createdAt: first.createdAt,
    });

    expect(verifyAuditChain().valid).toBe(true);
    expect(getStore().byId<AuditEvent>('audit', first.id)?.seq).toBe(1);

    // Stripping hash directly from an in-memory record must fail verification.
    const brokenStore = {
      all: () => [
        {
          id: first.id,
          type: first.type,
          action: first.action,
          createdAt: first.createdAt,
        },
      ],
    };
    const strippedResult = verifyAuditChain(brokenStore as never);
    expect(strippedResult.valid).toBe(false);
    expect(strippedResult.brokenAtId).toBe(first.id);
    expect(strippedResult.reason).toContain('Missing hash chain fields');
  });

  it('stamps legacy rows deterministically after the persisted head, and persists the stamp', async () => {
    auditDataAccess('usr-1', 'consents.update', {});
    await getStore().flush();
    const stamped = getStore().all<AuditEvent>('audit').find((d) => d.seq === 1)!;

    // Simulate a store written before the chain existed: legacy rows, listed
    // in an order that differs from their creation order.
    const legacy = (id: string, createdAt: string) => ({
      id,
      userId: 'usr-1',
      type: 'authEvent',
      action: 'login.succeeded',
      createdAt,
    });
    fs.writeFileSync(
      path.join(tempDir, 'audit.json'),
      JSON.stringify([
        legacy('aud-late', '2026-01-02T00:00:00.000Z'),
        stamped,
        legacy('aud-early', '2026-01-01T00:00:00.000Z'),
      ]),
    );

    const boot = () => {
      resetStoreSingletonForTests();
      return getStore()
        .all<AuditEvent>('audit')
        .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
        .map((d) => [d.id, d.seq, d.hash]);
    };
    const first = boot();
    const second = boot();

    expect(first).toEqual(second);
    expect(first.map((r) => r[1])).toEqual([1, 2, 3]);
    expect(first[0][0]).toBe(stamped.id);
    expect(first[1][0]).toBe('aud-early');
    expect(first[2][0]).toBe('aud-late');
    expect(verifyAuditChain().valid).toBe(true);

    // The stamp was marked dirty, so it reaches disk.
    await getStore().flush();
    const onDisk = JSON.parse(fs.readFileSync(path.join(tempDir, 'audit.json'), 'utf8')) as AuditEvent[];
    expect(onDisk.every((d) => typeof d.seq === 'number')).toBe(true);
  });
});
