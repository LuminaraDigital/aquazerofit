/**
 * S5 Squad Corner and Telegram invites over HTTP (AZF-P1 US-C3, US-C4, §8.4).
 *
 * Launch data is signed with the dev bot token exactly as Telegram would
 * sign it, so these cases exercise the real HMAC check rather than a stub.
 */
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fightCampHarness, type FightCampHarness, type Person } from './helpers/fightCampHarness';

const { signTelegramInitData } = await import('../modules/auth/telegram');
const { getStore } = await import('../platform/store');
const { engageRepo } = await import('../modules/fightCamp/repo');
const { cornerHash } = await import('../modules/fightCamp/corner');

let h: FightCampHarness;
const SECRET = 'corner-test-secret-0123456789abcdef';
let tgSeq = 7_000_000;

beforeAll(async () => {
  h = await fightCampHarness('fc-corner');
});

afterEach(() => {
  h.disableAll();
  delete process.env.ENGAGE_HMAC_SECRET;
  delete process.env.TELEGRAM_BOT_TOKEN;
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await h.cleanup();
});

function enable(): void {
  h.enable('squads');
  process.env.ENGAGE_HMAC_SECRET = SECRET;
}

/** A person with a linked Telegram account. */
async function tgPerson(name: string, age: number | null = 30): Promise<Person & { tgId: number }> {
  const person = await h.register(name, { age });
  const tgId = (tgSeq += 1);
  const user = getStore().byId<{ id: string }>('users', person.userId)!;
  getStore().upsert('users', { ...user, tgId });
  return { ...person, tgId };
}

function launch(tgId: number, chat: { type?: string; instance?: string } = {}, authDate = Math.floor(Date.now() / 1000)): string {
  const fields: Record<string, string> = {
    auth_date: String(authDate),
    user: JSON.stringify({ id: tgId, first_name: 'Tester' }),
  };
  if (chat.type !== undefined) fields.chat_type = chat.type;
  if (chat.instance !== undefined) fields.chat_instance = chat.instance;
  return signTelegramInitData(fields);
}

const GROUP = { type: 'supergroup', instance: '-8877665544332211' };
const corner = (who: Person, body: object) => request(h.app).post(`${h.base}/squads/corner`).set(who.auth()).send(body);

describe('Squad Corner (US-C3)', () => {
  it('is unavailable without the HMAC secret, even with squads on', async () => {
    h.enable('squads');
    const rizal = await tgPerson('Rizal');
    expect((await corner(rizal, { action: 'peek', tgInitData: launch(rizal.tgId, GROUP) })).status).toBe(404);
  });

  it('offers to start, binds the group by HMAC only, then shows members their corner', async () => {
    enable();
    const rizal = await tgPerson('Rizal');
    const peek = await corner(rizal, { action: 'peek', tgInitData: launch(rizal.tgId, GROUP) });
    expect(peek.status).toBe(200);
    expect(peek.body).toEqual({ corner: { state: 'none', squad: null } });

    const made = await corner(rizal, {
      action: 'create',
      tgInitData: launch(rizal.tgId, GROUP),
      name: 'Gym Crew',
      consent: true,
    });
    expect(made.status).toBe(200);
    expect(made.body.corner).toMatchObject({ state: 'member', squad: { name: 'Gym Crew', memberCount: 1 } });

    const squad = await engageRepo().squadByCorner(1, cornerHash(GROUP.instance, SECRET));
    expect(squad?.name).toBe('Gym Crew');
    // Stored as an HMAC: the raw chat_instance appears nowhere.
    expect(JSON.stringify(squad)).not.toContain(GROUP.instance);
    expect(JSON.stringify(await engageRepo().exportUser(rizal.userId))).not.toContain(GROUP.instance);

    const current = await request(h.app).get(`${h.base}/squads/current`).set(rizal.auth());
    expect(current.body.squad.isCorner).toBe(true);
  });

  it('lets another group member join, and a different group start its own', async () => {
    enable();
    const owner = await tgPerson('Owner');
    await corner(owner, { action: 'create', tgInitData: launch(owner.tgId, GROUP), name: 'Gym Crew', consent: true });
    const mate = await tgPerson('Mate');
    const seen = await corner(mate, { action: 'peek', tgInitData: launch(mate.tgId, GROUP) });
    expect(seen.body.corner).toMatchObject({ state: 'joinable', squad: { name: 'Gym Crew', memberCount: 1 } });
    const joined = await corner(mate, { action: 'join', tgInitData: launch(mate.tgId, GROUP), consent: true });
    expect(joined.body.corner.state).toBe('member');

    const other = await tgPerson('Other');
    const elsewhere = await corner(other, {
      action: 'peek',
      tgInitData: launch(other.tgId, { type: 'group', instance: '-1112223334445556' }),
    });
    expect(elsewhere.body.corner.state).toBe('none');
  });

  it('refuses a second corner for the same group this season', async () => {
    enable();
    const a = await tgPerson('A');
    await corner(a, { action: 'create', tgInitData: launch(a.tgId, GROUP), name: 'First Crew', consent: true });
    const b = await tgPerson('B');
    const res = await corner(b, { action: 'create', tgInitData: launch(b.tgId, GROUP), name: 'Second Crew', consent: true });
    expect(res.status).toBe(409);
    expect(res.body.details.reason).toBe('squad_corner_taken');
  });

  it('rejects forged, stale, private-chat and someone-else’s launch data', async () => {
    enable();
    const rizal = await tgPerson('Rizal');
    const forged = launch(rizal.tgId, GROUP).replace(/hash=[0-9a-f]+/, `hash=${'0'.repeat(64)}`);
    expect((await corner(rizal, { action: 'peek', tgInitData: forged })).status).toBe(401);

    const stale = launch(rizal.tgId, GROUP, Math.floor(Date.now() / 1000) - 3 * 24 * 3600);
    expect((await corner(rizal, { action: 'peek', tgInitData: stale })).status).toBe(401);

    const privateChat = await corner(rizal, { action: 'peek', tgInitData: launch(rizal.tgId, { type: 'private', instance: '1' }) });
    expect(privateChat.status).toBe(400);
    expect(privateChat.body.details.reason).toBe('not_a_group');

    const noChat = await corner(rizal, { action: 'peek', tgInitData: launch(rizal.tgId) });
    expect(noChat.status).toBe(400);

    const someoneElse = await corner(rizal, { action: 'peek', tgInitData: launch(rizal.tgId + 999, GROUP) });
    expect(someoneElse.status).toBe(403);
    expect(someoneElse.body.details.reason).toBe('tg_account_mismatch');
  });

  it('requires consent to create or join, and keeps minors out', async () => {
    enable();
    const rizal = await tgPerson('Rizal');
    expect(
      (await corner(rizal, { action: 'create', tgInitData: launch(rizal.tgId, GROUP), name: 'Gym Crew' })).status,
    ).toBe(400);
    const teen = await tgPerson('Teen', 16);
    const res = await corner(teen, { action: 'peek', tgInitData: launch(teen.tgId, GROUP) });
    expect(res.status).toBe(403);
    expect(res.body.details.reason).toBe('squad_adult_only');
  });
});

describe('prepared invite messages (US-C4)', () => {
  it('answers null so the client falls back when Telegram cannot prepare one', async () => {
    h.enable('squads');
    const mia = await h.register('Mia');
    const made = await request(h.app).post(`${h.base}/squads`).set(mia.auth()).send({ name: 'Corner Crew', consent: true });
    const res = await request(h.app).post(`${h.base}/squads/${made.body.squad.id}/invite-message`).set(mia.auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ preparedMessageId: null });
  });

  it('prepares fixed copy with a Mini App link and names no recipient', async () => {
    h.enable('squads');
    process.env.TELEGRAM_BOT_TOKEN = '123456:corner-integration';
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: { body: string }) => {
        calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
        return { json: async () => ({ ok: true, result: { id: 'prep-1', expiration_date: 0 } }) };
      }),
    );
    const rizal = await tgPerson('Rizal');
    const made = await request(h.app).post(`${h.base}/squads`).set(rizal.auth()).send({ name: 'Gym Crew', consent: true });
    const res = await request(h.app).post(`${h.base}/squads/${made.body.squad.id}/invite-message`).set(rizal.auth());
    expect(res.body).toEqual({ preparedMessageId: 'prep-1' });
    const call = calls.find((c) => c.url.endsWith('/savePreparedInlineMessage'))!;
    expect(call.body).toMatchObject({ user_id: rizal.tgId, allow_group_chats: true, allow_user_chats: true });
    const result = call.body.result as { reply_markup: { inline_keyboard: Array<Array<{ url: string }>> } };
    expect(result.reply_markup.inline_keyboard[0]![0]!.url).toBe(
      `https://t.me/AquaZeroFitBot/app?startapp=sq_${made.body.squad.inviteCode}`,
    );
    expect(JSON.stringify(call.body)).not.toMatch(/chat_id/);
  });

  it('refuses an outsider', async () => {
    h.enable('squads');
    const mia = await h.register('Mia');
    const made = await request(h.app).post(`${h.base}/squads`).set(mia.auth()).send({ name: 'Corner Crew', consent: true });
    const outsider = await h.register('Outsider');
    const res = await request(h.app).post(`${h.base}/squads/${made.body.squad.id}/invite-message`).set(outsider.auth());
    expect(res.status).toBe(404);
  });
});
