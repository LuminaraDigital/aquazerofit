/**
 * One contract, every adapter (AZF-P1 §4.1, §10.1 "Contract").
 *
 * The same cases run against MemoryEngageRepo, PgEngageRepo on PGlite (real
 * Postgres in-process, always) and PgEngageRepo on a real server when
 * ENGAGE_TEST_DATABASE_URL is set. A rule the memory adapter enforces and
 * the SQL does not, or the reverse, fails here rather than in production.
 *
 * Ids are unique per test so the cases can share one database per adapter.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryEngageRepo } from '../modules/fightCamp/repo/memory';
import { PgEngageRepo } from '../modules/fightCamp/repo/pg';
import type { CheerRow, EngageRepo, GraceRow, MemberRow, SquadRow } from '../modules/fightCamp/repo/types';
import { pgliteDatabase, serverDatabase, type TestDatabase } from './helpers/engageDatabases';

const T0 = Date.parse('2026-10-20T08:00:00.000Z');
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();

let seq = 0;
const uid = (label: string) => `${label}-${(seq += 1)}`;
// The repository stores codes and refs as given; their shape is the service's
// concern (and its own tests'), so any unique strings do here.
const nextCode = () => `SQD-T${String((seq += 1)).padStart(5, '0')}`;
const nextRef = () => `m_${String(++seq).padStart(12, 'x')}`;

function squadRow(over: Partial<SquadRow> = {}): SquadRow {
  return {
    id: uid('sq'),
    seasonNumber: 1,
    name: 'Corner Crew',
    inviteCode: nextCode(),
    cornerHash: null,
    maxMembers: 5,
    createdBy: null,
    createdAt: at(0),
    archivedAt: null,
    ...over,
  };
}

function memberRow(squad: SquadRow, userId: string, over: Partial<MemberRow> = {}): MemberRow {
  return {
    squadId: squad.id,
    userId,
    memberRef: nextRef(),
    seasonNumber: squad.seasonNumber,
    role: 'member',
    showStats: false,
    joinedAt: at(1),
    leftAt: null,
    ...over,
  };
}

function cheerRow(over: Partial<CheerRow> = {}): CheerRow {
  return {
    id: uid('ch'),
    fromKind: 'member',
    fromUserId: uid('from'),
    coachId: null,
    toUserId: uid('to'),
    squadId: null,
    cheer: 'fire',
    localDate: '2026-10-20',
    createdAt: at(0),
    seenAt: null,
    ...over,
  };
}

function graceRow(userId: string, over: Partial<GraceRow> = {}): GraceRow {
  return {
    id: uid('g'),
    userId,
    entry: 'earned',
    seasonNumber: 1,
    localDate: '2026-10-25',
    milestone: 7,
    createdAt: at(0),
    ...over,
  };
}

/** A squad with an owner; returns both. */
async function seedSquad(repo: EngageRepo, over: Partial<SquadRow> = {}) {
  const owner = uid('owner');
  const squad = squadRow({ createdBy: owner, ...over });
  const ownerRow = memberRow(squad, owner, { role: 'owner', joinedAt: at(0) });
  expect(await repo.createSquad(squad, ownerRow)).toEqual({ ok: true });
  return { squad, owner, ownerRow };
}

const adapters: Array<{ name: string; open: () => Promise<{ repo: EngageRepo; close: () => Promise<void> }> }> = [
  { name: 'memory', open: async () => ({ repo: new MemoryEngageRepo(), close: async () => undefined }) },
  {
    name: 'pglite',
    open: async () => {
      const handle = await pgliteDatabase();
      return { repo: new PgEngageRepo(handle.db), close: handle.close };
    },
  },
];
const serverUrl = process.env.ENGAGE_TEST_DATABASE_URL?.trim();
if (serverUrl) {
  adapters.push({
    name: 'postgres',
    open: async () => {
      const handle: TestDatabase = await serverDatabase(serverUrl);
      return { repo: new PgEngageRepo(handle.db), close: handle.close };
    },
  });
}

describe.each(adapters)('EngageRepo contract: $name', ({ open }) => {
  let repo: EngageRepo;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ repo, close } = await open());
  }, 30_000);
  afterAll(async () => {
    await close();
  });

  describe('enrolment', () => {
    it('is idempotent per user and season', async () => {
      const userId = uid('u');
      const first = await repo.enrol({ userId, seasonNumber: 1, source: 'dashboard', enrolledAt: at(0) });
      const again = await repo.enrol({ userId, seasonNumber: 1, source: 'recap', enrolledAt: at(5) });
      expect(first.created).toBe(true);
      expect(again).toEqual({ row: first.row, created: false });
      expect(again.row.source).toBe('dashboard');
      expect(await repo.enrolment(userId, 2)).toBeNull();
      const next = await repo.enrol({ userId, seasonNumber: 2, source: 'deeplink', enrolledAt: at(9) });
      expect(next.created).toBe(true);
    });
  });

  describe('squads', () => {
    it('creates a squad with its owner and finds it by id and code', async () => {
      const { squad, owner } = await seedSquad(repo);
      expect(await repo.squad(squad.id)).toEqual(squad);
      expect(await repo.squadByCode(squad.inviteCode)).toEqual(squad);
      expect(await repo.squad('missing')).toBeNull();
      const membership = await repo.activeMembership(owner, 1);
      expect(membership).toMatchObject({ squadId: squad.id, role: 'owner', showStats: false, leftAt: null });
    });

    it('allows one active squad per user per season', async () => {
      const { owner } = await seedSquad(repo);
      const second = squadRow({ createdBy: owner });
      expect(await repo.createSquad(second, memberRow(second, owner, { role: 'owner' }))).toEqual({
        ok: false,
        reason: 'already_member',
      });
      // A different season is a different rule.
      const nextSeason = squadRow({ createdBy: owner, seasonNumber: 2 });
      expect(await repo.createSquad(nextSeason, memberRow(nextSeason, owner, { role: 'owner' }))).toEqual({
        ok: true,
      });
    });

    it('refuses a duplicate invite code', async () => {
      const { squad } = await seedSquad(repo);
      const clash = squadRow({ inviteCode: squad.inviteCode });
      expect(await repo.createSquad(clash, memberRow(clash, uid('o'), { role: 'owner' }))).toEqual({
        ok: false,
        reason: 'code_taken',
      });
    });

    it('binds one live corner per group per season, freed by archiving', async () => {
      const cornerHash = uid('hash');
      const { squad, owner } = await seedSquad(repo, { cornerHash });
      expect(await repo.squadByCorner(1, cornerHash)).toMatchObject({ id: squad.id });
      const rival = squadRow({ cornerHash });
      expect(await repo.createSquad(rival, memberRow(rival, uid('o'), { role: 'owner' }))).toEqual({
        ok: false,
        reason: 'corner_taken',
      });
      expect(await repo.leaveSquad(squad.id, owner, at(10))).toBe(true);
      expect((await repo.squad(squad.id))?.archivedAt).toBe(at(10));
      expect(await repo.squadByCorner(1, cornerHash)).toBeNull();
      const fresh = squadRow({ cornerHash });
      expect(await repo.createSquad(fresh, memberRow(fresh, uid('o'), { role: 'owner' }))).toEqual({ ok: true });
    });

    it('fills to max members and then refuses with full', async () => {
      const { squad } = await seedSquad(repo);
      for (let i = 0; i < 4; i += 1) {
        const outcome = await repo.joinSquad(squad.id, memberRow(squad, uid('m'), { joinedAt: at(2 + i) }));
        expect(outcome.ok).toBe(true);
      }
      expect(await repo.joinSquad(squad.id, memberRow(squad, uid('m')))).toEqual({ ok: false, reason: 'full' });
      expect(await repo.activeMembers(squad.id)).toHaveLength(5);
    });

    it('refuses unknown, archived and already-in-a-squad joins', async () => {
      const { squad: mine } = await seedSquad(repo);
      const { squad: other, owner: otherOwner } = await seedSquad(repo);
      expect(await repo.joinSquad('missing', memberRow(mine, uid('m')))).toEqual({
        ok: false,
        reason: 'not_found',
      });
      expect(await repo.joinSquad(mine.id, memberRow(mine, otherOwner))).toEqual({
        ok: false,
        reason: 'already_member',
      });
      await repo.leaveSquad(other.id, otherOwner, at(20));
      expect(await repo.joinSquad(other.id, memberRow(other, uid('m')))).toEqual({
        ok: false,
        reason: 'archived',
      });
    });

    it('passes ownership to the earliest joined member and keeps the row on rejoin', async () => {
      const { squad, owner } = await seedSquad(repo);
      const early = uid('early');
      const late = uid('late');
      const earlyRow = memberRow(squad, early, { joinedAt: at(2) });
      await repo.joinSquad(squad.id, memberRow(squad, late, { joinedAt: at(3) }));
      await repo.joinSquad(squad.id, earlyRow);
      expect(await repo.setShowStats(squad.id, early, true)).toMatchObject({ showStats: true });

      expect(await repo.leaveSquad(squad.id, owner, at(30))).toBe(true);
      const members = await repo.activeMembers(squad.id);
      expect(members.map((m) => [m.userId, m.role])).toEqual([
        [early, 'owner'],
        [late, 'member'],
      ]);
      expect(await repo.leaveSquad(squad.id, owner, at(31))).toBe(false);

      // Leaving and coming back: same row, same ref, numbers hidden again.
      await repo.leaveSquad(squad.id, early, at(32));
      const back = await repo.joinSquad(squad.id, memberRow(squad, early, { joinedAt: at(40) }));
      expect(back).toEqual({
        ok: true,
        member: expect.objectContaining({
          memberRef: earlyRow.memberRef,
          role: 'member',
          showStats: false,
          joinedAt: at(40),
          leftAt: null,
        }),
      });
      expect((await repo.activeMemberByRef(squad.id, earlyRow.memberRef))?.userId).toBe(early);
      // Scoped: the same ref in another squad, or a ref that left, resolves to nobody.
      expect(await repo.activeMemberByRef('another-squad', earlyRow.memberRef)).toBeNull();
      await repo.leaveSquad(squad.id, early, at(41));
      expect(await repo.activeMemberByRef(squad.id, earlyRow.memberRef)).toBeNull();
      expect((await repo.activeMembers(squad.id)).find((m) => m.userId === late)?.role).toBe('owner');
    });

    it('breaks a join-time tie by code point, the same in every adapter', async () => {
      const { squad, owner } = await seedSquad(repo);
      const upper = uid('upper');
      const lower = uid('lower');
      await repo.joinSquad(squad.id, memberRow(squad, lower, { joinedAt: at(5), memberRef: 'm_aaaaaaaaaaaa' }));
      await repo.joinSquad(squad.id, memberRow(squad, upper, { joinedAt: at(5), memberRef: 'm_Abaaaaaaaaaa' }));
      await repo.leaveSquad(squad.id, owner, at(6));
      const heir = (await repo.activeMembers(squad.id)).find((m) => m.role === 'owner');
      expect(heir?.userId).toBe(upper);
    });

    it('replaces a live squad\u2019s invite code, refusing a taken one and an archived squad', async () => {
      const { squad, owner } = await seedSquad(repo);
      const { squad: other } = await seedSquad(repo);
      expect(await repo.setInviteCode(squad.id, other.inviteCode)).toBe('code_taken');
      const fresh = nextCode();
      expect(await repo.setInviteCode(squad.id, fresh)).toBe('ok');
      expect(await repo.squadByCode(fresh)).toMatchObject({ id: squad.id });
      expect(await repo.squadByCode(squad.inviteCode)).toBeNull();
      await repo.leaveSquad(squad.id, owner, at(50));
      expect(await repo.setInviteCode(squad.id, nextCode())).toBe('not_found');
    });

    it('updates show_stats for active members only and counts recent creates', async () => {
      const { squad, owner } = await seedSquad(repo);
      expect(await repo.setShowStats(squad.id, uid('stranger'), true)).toBeNull();
      expect(await repo.squadsCreatedSince(owner, at(-1))).toBe(1);
      expect(await repo.squadsCreatedSince(owner, at(1))).toBe(0);
    });
  });

  describe('cheers', () => {
    it('allows one member cheer per sender, recipient and local day', async () => {
      const first = cheerRow();
      expect(await repo.insertCheer(first)).toBe(true);
      expect(await repo.insertCheer({ ...first, id: uid('ch'), cheer: 'clap' })).toBe(false);
      expect(await repo.insertCheer({ ...first, id: uid('ch'), localDate: '2026-10-21' })).toBe(true);
      expect(await repo.insertCheer({ ...first, id: uid('ch'), toUserId: uid('to') })).toBe(true);
      expect(await repo.cheersSentOn(first.fromUserId!, '2026-10-20')).toHaveLength(2);
    });

    it('allows one coach cheer per recipient per day, separate from members', async () => {
      const to = uid('to');
      const coach = cheerRow({ fromKind: 'coach', fromUserId: null, coachId: 'akin', toUserId: to });
      expect(await repo.insertCheer(coach)).toBe(true);
      expect(await repo.insertCheer({ ...coach, id: uid('ch'), coachId: 'mei' })).toBe(false);
      expect(await repo.insertCheer(cheerRow({ toUserId: to }))).toBe(true);
      expect((await repo.coachCheersTo(to)).map((c) => c.coachId)).toEqual(['akin']);
    });

    it('pages the inbox newest first and marks only the recipient’s cheers seen', async () => {
      const to = uid('to');
      const rows = [0, 1, 2].map((i) => cheerRow({ toUserId: to, createdAt: at(i), localDate: `2026-10-2${i}` }));
      for (const row of rows) await repo.insertCheer(row);
      const page = await repo.cheersTo(to, { since: at(-60), limit: 2 });
      expect(page.map((c) => c.id)).toEqual([rows[2]!.id, rows[1]!.id]);
      const rest = await repo.cheersTo(to, { since: at(-60), limit: 2, before: page[1]! });
      expect(rest.map((c) => c.id)).toEqual([rows[0]!.id]);
      expect(await repo.cheersTo(to, { since: at(1), limit: 10 })).toHaveLength(2);

      expect(await repo.unseenCheerCount(to, at(-60))).toBe(3);
      await repo.markCheersSeen(uid('someone-else'), [rows[0]!.id], at(50));
      expect(await repo.unseenCheerCount(to, at(-60))).toBe(3);
      await repo.markCheersSeen(to, [rows[0]!.id, rows[1]!.id], at(50));
      expect(await repo.unseenCheerCount(to, at(-60))).toBe(1);
      const seen = await repo.cheersTo(to, { since: at(-60), limit: 10 });
      expect(seen.find((c) => c.id === rows[0]!.id)?.seenAt).toBe(at(50));
    });

    it('pages through cheers that share one instant without skipping any', async () => {
      const to = uid('to');
      const ids = ['c-b', 'c-A', 'c-a'].map((suffix) => `${uid('same')}-${suffix}`);
      for (const id of ids) {
        await repo.insertCheer(cheerRow({ id, toUserId: to, fromUserId: uid('from'), createdAt: at(7) }));
      }
      const seen: string[] = [];
      let before: CheerRow | undefined;
      for (;;) {
        const page = await repo.cheersTo(to, { since: at(-60), limit: 2, ...(before ? { before } : {}) });
        if (page.length === 0) break;
        seen.push(...page.map((c) => c.id));
        before = page.at(-1);
      }
      // Code-point order, newest first: lower-case sorts after upper-case.
      expect(seen).toEqual([...ids].sort().reverse());
    });

    it('raises on a duplicate cheer id rather than calling it a second cheer', async () => {
      const row = cheerRow();
      await repo.insertCheer(row);
      await expect(repo.insertCheer({ ...row, toUserId: uid('to') })).rejects.toThrow();
    });

    it('tallies given and received inside a date range', async () => {
      const me = uid('me');
      await repo.insertCheer(cheerRow({ fromUserId: me, localDate: '2026-10-20' }));
      await repo.insertCheer(cheerRow({ fromUserId: me, localDate: '2026-12-30' }));
      await repo.insertCheer(cheerRow({ toUserId: me, localDate: '2026-10-21' }));
      await repo.insertCheer(cheerRow({ fromKind: 'coach', fromUserId: null, coachId: 'akin', toUserId: me, localDate: '2026-10-22' }));
      expect(await repo.cheerTally(me, '2026-10-19', '2026-12-13')).toEqual({ given: 1, received: 2 });
    });
  });

  describe('Cut Man grace ledger', () => {
    const append = (userId: string, rows: GraceRow[]) =>
      repo.withGraceLedger(userId, (ledger) => ledger.append(rows));

    it('records each earned milestone and each bridged date once, in write order', async () => {
      const userId = uid('u');
      const added = await append(userId, [
        graceRow(userId, { milestone: 14, localDate: '2026-11-03', createdAt: at(9) }),
        graceRow(userId, { milestone: 7, createdAt: at(1) }),
        graceRow(userId, { milestone: 7, createdAt: at(2) }),
        graceRow(userId, { entry: 'applied', milestone: null, localDate: '2026-11-05', createdAt: at(0) }),
        graceRow(userId, { entry: 'applied', milestone: null, localDate: '2026-11-05', createdAt: at(5) }),
      ]);
      expect(added).toBe(3);
      // Write order, not timestamp order: the fold must not depend on clocks.
      expect((await repo.graceEntries(userId)).map((g) => [g.entry, g.milestone, g.localDate])).toEqual([
        ['earned', 14, '2026-11-03'],
        ['earned', 7, '2026-10-25'],
        ['applied', null, '2026-11-05'],
      ]);
      expect(await repo.graceEntries(uid('nobody'))).toEqual([]);
    });

    it('lets one holder at a time read and write a user\u2019s ledger', async () => {
      const userId = uid('u');
      const order: string[] = [];
      const holder = (name: string, rows: GraceRow[]) =>
        repo.withGraceLedger(userId, async (ledger) => {
          order.push(`${name}:read:${(await ledger.entries()).length}`);
          await new Promise((resolve) => setTimeout(resolve, 5));
          await ledger.append(rows);
          order.push(`${name}:wrote`);
        });
      await Promise.all([
        holder('a', [graceRow(userId, { milestone: 7 })]),
        holder('b', [graceRow(userId, { milestone: 14 })]),
      ]);
      // b saw a's row: the second cycle started after the first one ended.
      expect(order).toEqual(['a:read:0', 'a:wrote', 'b:read:1', 'b:wrote']);
    });

    it('releases the lock when a holder throws', async () => {
      const userId = uid('u');
      await expect(repo.withGraceLedger(userId, async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
      await expect(repo.withGraceLedger(userId, async (ledger) => ledger.append([graceRow(userId)]))).resolves.toBe(1);
    });
  });

  describe('nudges', () => {
    it('claims at most one nudge per user per local day', async () => {
      const userId = uid('u');
      expect(await repo.claimNudge(userId, '2026-10-20', 'cheer', at(0))).toBe(true);
      expect(await repo.claimNudge(userId, '2026-10-20', 'squad_prompt', at(1))).toBe(false);
      expect(await repo.claimNudge(userId, '2026-10-21', 'cheer', at(2))).toBe(true);
    });

    it('stores a switched-off kind, and on again, per user', async () => {
      const userId = uid('u');
      expect(await repo.nudgeSettings(userId)).toEqual({});
      await repo.setNudgeSetting(userId, 'cheer', false, at(0));
      expect(await repo.nudgeSettings(userId)).toEqual({ cheer: false });
      await repo.setNudgeSetting(userId, 'cheer', true, at(1));
      expect(await repo.nudgeSettings(userId)).toEqual({ cheer: true });
      expect(await repo.nudgeSettings(uid('other'))).toEqual({});
    });
  });

  describe('share links and attribution', () => {
    it('reports a taken code before a reused link when both clash', async () => {
      const userId = uid('u');
      const code = `Gh${String((seq += 1)).padStart(6, '0')}`;
      const row = { code, userId, kind: 'recap' as const, seasonNumber: 1, createdAt: at(0) };
      await repo.insertShareLink(row);
      expect(await repo.insertShareLink(row)).toBe('code_taken');
    });

    it('reuses one link per user, kind and season and refuses a taken code', async () => {
      const userId = uid('u');
      const code = `Ab${String(++seq).padStart(6, '0')}`;
      const row = { code, userId, kind: 'belt' as const, seasonNumber: 1, createdAt: at(0) };
      expect(await repo.insertShareLink(row)).toBe('inserted');
      expect(await repo.insertShareLink({ ...row, code: `Zz${String(++seq).padStart(6, '0')}` })).toBe('exists');
      expect(await repo.insertShareLink({ ...row, userId: uid('u'), kind: 'week' })).toBe('code_taken');
      expect(await repo.shareLink(userId, 'belt', 1)).toEqual(row);
      expect(await repo.shareLinkByCode(code)).toEqual(row);
      expect(await repo.shareLink(userId, 'belt', 2)).toBeNull();
    });

    it('keeps the first attribution and counts invitees per inviter', async () => {
      const inviter = uid('inviter');
      const code = `Cd${String(++seq).padStart(6, '0')}`;
      await repo.insertShareLink({ code, userId: inviter, kind: 'season', seasonNumber: 1, createdAt: at(0) });
      const invitee = uid('new');
      const first = { inviteeUserId: invitee, shareCode: code, squadId: null, surface: 'web' as const, createdAt: at(1) };
      expect(await repo.attribute(first)).toBe(true);
      expect(await repo.attribute({ ...first, shareCode: null, surface: 'tma' })).toBe(false);
      expect(await repo.inviteesOf(inviter)).toEqual([invitee]);
    });
  });

  describe('privacy', () => {
    it('exports what the user holds without naming anyone else', async () => {
      const { squad, owner } = await seedSquad(repo, { name: 'Export Crew' });
      const mate = uid('mate');
      await repo.joinSquad(squad.id, memberRow(squad, mate));
      await repo.enrol({ userId: owner, seasonNumber: 1, source: 'squad', enrolledAt: at(0) });
      await repo.insertCheer(cheerRow({ fromUserId: owner, toUserId: mate, squadId: squad.id }));
      await repo.insertCheer(cheerRow({ fromUserId: mate, toUserId: owner, squadId: squad.id }));
      await repo.withGraceLedger(owner, (ledger) => ledger.append([graceRow(owner)]));
      await repo.claimNudge(owner, '2026-10-20', 'cheer', at(0));

      const bundle = await repo.exportUser(owner);
      expect(bundle.enrolments).toHaveLength(1);
      expect(bundle.memberships).toEqual([expect.objectContaining({ squadName: 'Export Crew', role: 'owner' })]);
      expect(bundle.squadsCreated).toEqual([expect.objectContaining({ id: squad.id, name: 'Export Crew' })]);
      expect(bundle.cheersSent).toHaveLength(1);
      expect(bundle.cheersReceived).toEqual([expect.objectContaining({ fromKind: 'member' })]);
      expect(bundle.grace).toHaveLength(1);
      expect(bundle.nudges).toEqual([{ localDate: '2026-10-20', kind: 'cheer', sentAt: at(0) }]);
      expect(bundle.attribution).toBeNull();
      expect(JSON.stringify(bundle)).not.toContain(mate);
    });

    it('erases the user, hands their squad on and unlinks their invites', async () => {
      const { squad, owner } = await seedSquad(repo);
      const mate = uid('mate');
      await repo.joinSquad(squad.id, memberRow(squad, mate));
      await repo.enrol({ userId: owner, seasonNumber: 1, source: 'dashboard', enrolledAt: at(0) });
      const sent = cheerRow({ fromUserId: owner, toUserId: mate });
      await repo.insertCheer(sent);
      await repo.insertCheer(cheerRow({ fromUserId: mate, toUserId: owner }));
      await repo.withGraceLedger(owner, (ledger) => ledger.append([graceRow(owner)]));
      await repo.claimNudge(owner, '2026-10-20', 'cheer', at(0));
      await repo.setNudgeSetting(owner, 'cheer', false, at(0));
      const code = `Ef${String(++seq).padStart(6, '0')}`;
      await repo.insertShareLink({ code, userId: owner, kind: 'belt', seasonNumber: 1, createdAt: at(0) });
      const invitee = uid('invitee');
      await repo.attribute({ inviteeUserId: invitee, shareCode: code, squadId: null, surface: 'web', createdAt: at(1) });
      await repo.attribute({ inviteeUserId: owner, shareCode: null, squadId: squad.id, surface: 'tma', createdAt: at(1) });

      await repo.eraseUser(owner, at(99));

      const emptied = await repo.exportUser(owner);
      expect(emptied).toEqual({
        enrolments: [],
        memberships: [],
        squadsCreated: [],
        cheersSent: [],
        cheersReceived: [],
        grace: [],
        nudges: [],
        nudgeSettings: [],
        shareLinks: [],
        attribution: null,
      });
      expect((await repo.squad(squad.id))?.createdBy).toBeNull();
      expect((await repo.activeMembers(squad.id)).map((m) => [m.userId, m.role])).toEqual([[mate, 'owner']]);
      // The cheer they sent stays with its recipient, sender unknown.
      const inbox = await repo.cheersTo(mate, { since: at(-60), limit: 10 });
      expect(inbox).toEqual([expect.objectContaining({ id: sent.id, fromUserId: null })]);
      // The person they invited keeps their own row; the link back is gone.
      expect(await repo.attribute({ inviteeUserId: invitee, shareCode: null, squadId: null, surface: 'web', createdAt: at(2) })).toBe(false);
      expect(await repo.inviteesOf(owner)).toEqual([]);
      expect(await repo.claimNudge(owner, '2026-10-20', 'cheer', at(100))).toBe(true);
    });

    it('drops the name and group binding of a squad they created and nobody is left in', async () => {
      const cornerHash = uid('hash');
      const { squad, owner } = await seedSquad(repo, { name: 'Bob Smith fans', cornerHash });
      const { squad: shared, owner: sharedOwner } = await seedSquad(repo, { name: 'Shared crew' });
      await repo.joinSquad(shared.id, memberRow(shared, uid('mate')));
      await repo.eraseUser(owner, at(99));
      await repo.eraseUser(sharedOwner, at(99));
      expect(await repo.squad(squad.id)).toMatchObject({
        name: 'Archived squad',
        cornerHash: null,
        createdBy: null,
        archivedAt: at(99),
      });
      // A squad that lives on keeps the name its members know it by.
      expect(await repo.squad(shared.id)).toMatchObject({ name: 'Shared crew', createdBy: null, archivedAt: null });
    });
  });
});
