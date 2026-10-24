/**
 * Linking Telegram used to write the raw numeric id into the audit log.
 * The log keeps a short hash instead, so an export of that container is not
 * a list of Telegram accounts.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-tg-audit-'));
process.env.AZF_DATA_DIR = dataDir;

const { getStore } = await import('../platform/store');
const { linkTelegram } = await import('../modules/me/service');
const { sha256Hex } = await import('../platform/auth');

afterAll(async () => {
  await getStore().flush();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('telegram link audit', () => {
  it('stores a hash of tgId and not the number', () => {
    const tgId = 920001;
    getStore().upsert('users', {
      id: 'usr-link',
      email: 'link@example.com',
      emailVerified: true,
      tier: 'free',
      role: 'user',
      displayName: 'Link',
      createdAt: new Date().toISOString(),
    });

    linkTelegram('usr-link', tgId, 'linker');

    const events = getStore().where<{ id: string; action?: string; detail?: Record<string, unknown> }>(
      'audit',
      (d) => (d as { action?: string }).action === 'telegram.linked',
    );
    expect(events).toHaveLength(1);
    const detail = events[0]!.detail ?? {};
    expect(detail.tgId).toBeUndefined();
    expect(detail.tgIdHash).toBe(sha256Hex(String(tgId)).slice(0, 16));
    expect(JSON.stringify(events[0])).not.toContain(String(tgId));
  });
});
