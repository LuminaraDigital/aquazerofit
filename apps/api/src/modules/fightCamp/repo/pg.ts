/**
 * Postgres EngageRepo (see ./types). Parameterised statements only: every
 * value reaches the database as a bind parameter, never inside the SQL text.
 *
 * Mapping notes, each of which is a real bug when forgotten:
 *  - DATE columns are selected as `::text`. node-postgres parses DATE into a
 *    JavaScript Date at *local* midnight, which shifts the calendar day for
 *    any process not running in UTC.
 *  - TIMESTAMPTZ comes back as a Date and is turned into an ISO string, the
 *    shape every other timestamp in this API has.
 *  - Unique violations are mapped by constraint name to the outcomes the
 *    service understands. A violation this file does not recognise is
 *    rethrown, because swallowing an unknown constraint would hide a bug.
 */
import type { NudgeKind, ShareKindP1 } from '@aquazerofit/shared';
import { isUniqueViolation, type SqlDatabase, type SqlRunner } from '../../../platform/sql';
import { ARCHIVED_SQUAD_NAME } from './types';
import type {
  AttributionRow,
  CheerPage,
  CheerRow,
  CreateSquadOutcome,
  EngageExport,
  EngageRepo,
  EnrolmentRow,
  ExperimentArm,
  GraceLedger,
  GraceRow,
  InsertShareLinkOutcome,
  JoinSquadOutcome,
  MemberRow,
  ShareLinkRow,
  SquadRow,
  Surface,
} from './types';

type Row = Record<string, unknown>;

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function isoOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : iso(value);
}

function constraintOf(err: unknown): string {
  const name = (err as { constraint?: unknown } | null)?.constraint;
  return typeof name === 'string' ? name : '';
}

const ENROLMENT_COLUMNS = 'user_id, season_number, source, enrolled_at';
const toEnrolment = (r: Row): EnrolmentRow => ({
  userId: String(r.user_id),
  seasonNumber: Number(r.season_number),
  source: r.source as EnrolmentRow['source'],
  enrolledAt: iso(r.enrolled_at),
});

const SQUAD_COLUMNS =
  'id, season_number, name, invite_code, tg_chat_instance_hash, max_members, created_by, created_at, archived_at';
const toSquad = (r: Row): SquadRow => ({
  id: String(r.id),
  seasonNumber: Number(r.season_number),
  name: String(r.name),
  inviteCode: String(r.invite_code),
  cornerHash: (r.tg_chat_instance_hash as string | null) ?? null,
  maxMembers: Number(r.max_members),
  createdBy: (r.created_by as string | null) ?? null,
  createdAt: iso(r.created_at),
  archivedAt: isoOrNull(r.archived_at),
});

const MEMBER_COLUMNS =
  'squad_id, user_id, member_ref, season_number, role, show_stats, joined_at, left_at';
const toMember = (r: Row): MemberRow => ({
  squadId: String(r.squad_id),
  userId: String(r.user_id),
  memberRef: String(r.member_ref),
  seasonNumber: Number(r.season_number),
  role: r.role as MemberRow['role'],
  showStats: Boolean(r.show_stats),
  joinedAt: iso(r.joined_at),
  leftAt: isoOrNull(r.left_at),
});

const CHEER_COLUMNS =
  'id, from_kind, from_user_id, coach_id, to_user_id, squad_id, cheer, local_date::text AS local_date, created_at, seen_at';
const toCheer = (r: Row): CheerRow => ({
  id: String(r.id),
  fromKind: r.from_kind as CheerRow['fromKind'],
  fromUserId: (r.from_user_id as string | null) ?? null,
  coachId: (r.coach_id as string | null) ?? null,
  toUserId: String(r.to_user_id),
  squadId: (r.squad_id as string | null) ?? null,
  cheer: r.cheer as CheerRow['cheer'],
  localDate: String(r.local_date),
  createdAt: iso(r.created_at),
  seenAt: isoOrNull(r.seen_at),
});

const GRACE_COLUMNS =
  'id, user_id, entry, season_number, local_date::text AS local_date, milestone, created_at';
const toGrace = (r: Row): GraceRow => ({
  id: String(r.id),
  userId: String(r.user_id),
  entry: r.entry as GraceRow['entry'],
  seasonNumber: Number(r.season_number),
  localDate: String(r.local_date),
  milestone: r.milestone === null || r.milestone === undefined ? null : Number(r.milestone),
  createdAt: iso(r.created_at),
});

const LINK_COLUMNS = 'code, user_id, kind, season_number, created_at';
const toLink = (r: Row): ShareLinkRow => ({
  code: String(r.code),
  userId: String(r.user_id),
  kind: r.kind as ShareKindP1,
  seasonNumber: Number(r.season_number),
  createdAt: iso(r.created_at),
});

async function lockSquad(tx: SqlRunner, squadId: string): Promise<SquadRow | null> {
  const { rows } = await tx.query(
    `SELECT ${SQUAD_COLUMNS} FROM engage.squads WHERE id = $1 FOR UPDATE`,
    [squadId],
  );
  return rows[0] ? toSquad(rows[0]) : null;
}

async function activeIn(tx: SqlRunner, squadId: string): Promise<MemberRow[]> {
  const { rows } = await tx.query(
    `SELECT ${MEMBER_COLUMNS} FROM engage.squad_members
     WHERE squad_id = $1 AND left_at IS NULL
     ORDER BY joined_at, member_ref COLLATE "C"`,
    [squadId],
  );
  return rows.map(toMember);
}

/** Leave inside an open transaction; shared by leaveSquad and eraseUser. */
async function leaveWithin(
  tx: SqlRunner,
  squadId: string,
  userId: string,
  at: string,
  removed = false,
): Promise<boolean> {
  // Locked first so a join or a second leave cannot interleave with the
  // ownership hand-over below.
  await lockSquad(tx, squadId);
  const { rows } = await tx.query<{ role: string }>(
    `SELECT role FROM engage.squad_members WHERE squad_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [squadId, userId],
  );
  if (rows.length === 0) return false;
  await tx.query(
    `UPDATE engage.squad_members
     SET left_at = $3, role = 'member', removed_at = CASE WHEN $4 THEN $3::timestamptz ELSE removed_at END
     WHERE squad_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [squadId, userId, at, removed],
  );
  const remaining = await activeIn(tx, squadId);
  if (rows[0]!.role === 'owner' && remaining[0]) {
    await tx.query(
      `UPDATE engage.squad_members SET role = 'owner' WHERE squad_id = $1 AND user_id = $2`,
      [squadId, remaining[0].userId],
    );
  }
  if (remaining.length === 0) {
    await tx.query(
      'UPDATE engage.squads SET archived_at = $2 WHERE id = $1 AND archived_at IS NULL',
      [squadId, at],
    );
  }
  return true;
}

export class PgEngageRepo implements EngageRepo {
  constructor(private readonly db: SqlDatabase) {}

  // ----- enrolment -----

  async enrol(row: EnrolmentRow): Promise<{ row: EnrolmentRow; created: boolean }> {
    const inserted = await this.db.query(
      `INSERT INTO engage.season_enrolments (user_id, season_number, source, enrolled_at)
       VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, season_number) DO NOTHING
       RETURNING ${ENROLMENT_COLUMNS}`,
      [row.userId, row.seasonNumber, row.source, row.enrolledAt],
    );
    if (inserted.rows[0]) return { row: toEnrolment(inserted.rows[0]), created: true };
    const held = await this.enrolment(row.userId, row.seasonNumber);
    return { row: held!, created: false };
  }

  async enrolment(userId: string, seasonNumber: number): Promise<EnrolmentRow | null> {
    const { rows } = await this.db.query(
      `SELECT ${ENROLMENT_COLUMNS} FROM engage.season_enrolments
       WHERE user_id = $1 AND season_number = $2`,
      [userId, seasonNumber],
    );
    return rows[0] ? toEnrolment(rows[0]) : null;
  }

  // ----- squads -----

  async createSquad(squad: SquadRow, owner: MemberRow): Promise<CreateSquadOutcome> {
    if (await this.activeMembership(owner.userId, owner.seasonNumber)) {
      return { ok: false, reason: 'already_member' };
    }
    try {
      await this.db.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO engage.squads (${SQUAD_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            squad.id,
            squad.seasonNumber,
            squad.name,
            squad.inviteCode,
            squad.cornerHash,
            squad.maxMembers,
            squad.createdBy,
            squad.createdAt,
            squad.archivedAt,
          ],
        );
        await insertMember(tx, owner);
      });
      return { ok: true };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      switch (constraintOf(err)) {
        case 'squads_invite_code_key':
          return { ok: false, reason: 'code_taken' };
        case 'squads_corner_per_season':
          return { ok: false, reason: 'corner_taken' };
        case 'one_active_squad_per_season':
          return { ok: false, reason: 'already_member' };
        default:
          throw err;
      }
    }
  }

  async squad(id: string): Promise<SquadRow | null> {
    const { rows } = await this.db.query(`SELECT ${SQUAD_COLUMNS} FROM engage.squads WHERE id = $1`, [id]);
    return rows[0] ? toSquad(rows[0]) : null;
  }

  async squadByCode(code: string): Promise<SquadRow | null> {
    const { rows } = await this.db.query(
      `SELECT ${SQUAD_COLUMNS} FROM engage.squads WHERE invite_code = $1`,
      [code],
    );
    return rows[0] ? toSquad(rows[0]) : null;
  }

  async squadByCorner(seasonNumber: number, cornerHash: string): Promise<SquadRow | null> {
    const { rows } = await this.db.query(
      `SELECT ${SQUAD_COLUMNS} FROM engage.squads
       WHERE season_number = $1 AND tg_chat_instance_hash = $2 AND archived_at IS NULL`,
      [seasonNumber, cornerHash],
    );
    return rows[0] ? toSquad(rows[0]) : null;
  }

  async activeMembership(userId: string, seasonNumber: number): Promise<MemberRow | null> {
    const { rows } = await this.db.query(
      `SELECT ${MEMBER_COLUMNS} FROM engage.squad_members
       WHERE user_id = $1 AND season_number = $2 AND left_at IS NULL`,
      [userId, seasonNumber],
    );
    return rows[0] ? toMember(rows[0]) : null;
  }

  async activeMembers(squadId: string): Promise<MemberRow[]> {
    return activeIn(this.db, squadId);
  }

  async activeMemberByRef(squadId: string, memberRef: string): Promise<MemberRow | null> {
    const { rows } = await this.db.query(
      `SELECT ${MEMBER_COLUMNS} FROM engage.squad_members
       WHERE squad_id = $1 AND member_ref = $2 AND left_at IS NULL`,
      [squadId, memberRef],
    );
    return rows[0] ? toMember(rows[0]) : null;
  }

  async joinSquad(squadId: string, member: MemberRow): Promise<JoinSquadOutcome> {
    try {
      return await this.db.transaction(async (tx): Promise<JoinSquadOutcome> => {
        // The row lock serialises joins to one squad, so two people taking
        // the last place cannot both see room for themselves.
        const squad = await lockSquad(tx, squadId);
        if (!squad) return { ok: false, reason: 'not_found' };
        if (squad.archivedAt !== null) return { ok: false, reason: 'archived' };
        const held = await tx.query(
          `SELECT 1 FROM engage.squad_members
           WHERE user_id = $1 AND season_number = $2 AND left_at IS NULL`,
          [member.userId, member.seasonNumber],
        );
        if (held.rows.length > 0) return { ok: false, reason: 'already_member' };
        const removed = await tx.query(
          'SELECT 1 FROM engage.squad_members WHERE squad_id = $1 AND user_id = $2 AND removed_at IS NOT NULL',
          [squadId, member.userId],
        );
        if (removed.rows.length > 0) return { ok: false, reason: 'removed' };
        if ((await activeIn(tx, squadId)).length >= squad.maxMembers) return { ok: false, reason: 'full' };
        const { rows } = await tx.query(
          `INSERT INTO engage.squad_members (${MEMBER_COLUMNS})
           VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
           ON CONFLICT (squad_id, user_id) DO UPDATE
             SET role = 'member', show_stats = false, joined_at = EXCLUDED.joined_at, left_at = NULL
           RETURNING ${MEMBER_COLUMNS}`,
          [
            member.squadId,
            member.userId,
            member.memberRef,
            member.seasonNumber,
            member.role,
            member.showStats,
            member.joinedAt,
          ],
        );
        return { ok: true, member: toMember(rows[0]!) };
      });
    } catch (err) {
      // A concurrent join to a different squad won the one-squad rule.
      if (isUniqueViolation(err) && constraintOf(err) === 'one_active_squad_per_season') {
        return { ok: false, reason: 'already_member' };
      }
      throw err;
    }
  }

  async leaveSquad(squadId: string, userId: string, at: string, opts: { removed?: boolean } = {}): Promise<boolean> {
    return this.db.transaction((tx) => leaveWithin(tx, squadId, userId, at, opts.removed === true));
  }

  async wasRemoved(squadId: string, userId: string): Promise<boolean> {
    const { rows } = await this.db.query(
      'SELECT 1 FROM engage.squad_members WHERE squad_id = $1 AND user_id = $2 AND removed_at IS NOT NULL',
      [squadId, userId],
    );
    return rows.length > 0;
  }

  async setShowStats(squadId: string, userId: string, showStats: boolean): Promise<MemberRow | null> {
    const { rows } = await this.db.query(
      `UPDATE engage.squad_members SET show_stats = $3
       WHERE squad_id = $1 AND user_id = $2 AND left_at IS NULL
       RETURNING ${MEMBER_COLUMNS}`,
      [squadId, userId, showStats],
    );
    return rows[0] ? toMember(rows[0]) : null;
  }

  async setInviteCode(squadId: string, inviteCode: string): Promise<'ok' | 'code_taken' | 'not_found'> {
    try {
      const { rows } = await this.db.query(
        `UPDATE engage.squads SET invite_code = $2 WHERE id = $1 AND archived_at IS NULL RETURNING id`,
        [squadId, inviteCode],
      );
      return rows.length > 0 ? 'ok' : 'not_found';
    } catch (err) {
      if (isUniqueViolation(err) && constraintOf(err) === 'squads_invite_code_key') return 'code_taken';
      throw err;
    }
  }

  async squadsCreatedSince(userId: string, since: string): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM engage.squads WHERE created_by = $1 AND created_at >= $2',
      [userId, since],
    );
    return Number(rows[0]?.n ?? 0);
  }

  // ----- cheers -----

  async insertCheer(row: CheerRow): Promise<boolean> {
    // Targeted at the one-a-day index for this kind of sender, so any other
    // conflict (an id collision) raises instead of reading as "sent today".
    const oneADay =
      row.fromKind === 'member'
        ? `(from_user_id, to_user_id, local_date) WHERE from_kind = 'member'`
        : `(to_user_id, local_date) WHERE from_kind = 'coach'`;
    const { rows } = await this.db.query(
      `INSERT INTO engage.cheers
         (id, from_kind, from_user_id, coach_id, to_user_id, squad_id, cheer, local_date, created_at, seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT ${oneADay} DO NOTHING RETURNING id`,
      [
        row.id,
        row.fromKind,
        row.fromUserId,
        row.coachId,
        row.toUserId,
        row.squadId,
        row.cheer,
        row.localDate,
        row.createdAt,
        row.seenAt,
      ],
    );
    return rows.length > 0;
  }

  async cheersTo(userId: string, page: CheerPage): Promise<CheerRow[]> {
    const { rows } = await this.db.query(
      `SELECT ${CHEER_COLUMNS} FROM engage.cheers
       WHERE to_user_id = $1 AND created_at >= $2
         AND ($3::timestamptz IS NULL
              OR created_at < $3
              OR (created_at = $3 AND id COLLATE "C" < $4 COLLATE "C"))
       ORDER BY created_at DESC, id COLLATE "C" DESC LIMIT $5`,
      [userId, page.since, page.before?.createdAt ?? null, page.before?.id ?? '', page.limit],
    );
    return rows.map(toCheer);
  }

  async markCheersSeen(userId: string, ids: readonly string[], at: string): Promise<void> {
    if (ids.length === 0) return;
    await this.db.query(
      `UPDATE engage.cheers SET seen_at = $3
       WHERE to_user_id = $1 AND id = ANY($2::text[]) AND seen_at IS NULL`,
      [userId, [...ids], at],
    );
  }

  async unseenCheerCount(userId: string, since: string): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM engage.cheers
       WHERE to_user_id = $1 AND seen_at IS NULL AND created_at >= $2`,
      [userId, since],
    );
    return Number(rows[0]?.n ?? 0);
  }

  async cheersSentOn(fromUserId: string, localDate: string): Promise<CheerRow[]> {
    const { rows } = await this.db.query(
      `SELECT ${CHEER_COLUMNS} FROM engage.cheers
       WHERE from_kind = 'member' AND from_user_id = $1 AND local_date = $2`,
      [fromUserId, localDate],
    );
    return rows.map(toCheer);
  }

  async cheerTally(userId: string, from: string, to: string): Promise<{ given: number; received: number }> {
    const { rows } = await this.db.query<{ given: number; received: number }>(
      `SELECT
         COUNT(*) FILTER (WHERE from_user_id = $1)::int AS given,
         COUNT(*) FILTER (WHERE to_user_id = $1)::int AS received
       FROM engage.cheers
       WHERE (from_user_id = $1 OR to_user_id = $1) AND local_date BETWEEN $2 AND $3`,
      [userId, from, to],
    );
    return { given: Number(rows[0]?.given ?? 0), received: Number(rows[0]?.received ?? 0) };
  }

  async coachCheersTo(userId: string): Promise<CheerRow[]> {
    const { rows } = await this.db.query(
      `SELECT ${CHEER_COLUMNS} FROM engage.cheers
       WHERE from_kind = 'coach' AND to_user_id = $1 ORDER BY local_date`,
      [userId],
    );
    return rows.map(toCheer);
  }

  async hasCheered(fromUserId: string, toUserId: string): Promise<boolean> {
    const { rows } = await this.db.query(
      'SELECT 1 FROM engage.cheers WHERE from_user_id = $1 AND to_user_id = $2 LIMIT 1',
      [fromUserId, toUserId],
    );
    return rows.length > 0;
  }

  // ----- experiments -----

  async assignArm(userId: string, experiment: 'early_cheers', arm: ExperimentArm, at: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `INSERT INTO engage.experiment_arms (user_id, experiment, arm, assigned_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, experiment) DO NOTHING RETURNING user_id`,
      [userId, experiment, arm, at],
    );
    return rows.length > 0;
  }

  // ----- Cut Man grace -----

  async graceEntries(userId: string): Promise<GraceRow[]> {
    return graceEntriesWithin(this.db, userId);
  }

  async withGraceLedger<T>(userId: string, fn: (ledger: GraceLedger) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      // Transaction-scoped: released by COMMIT or ROLLBACK on this connection.
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`engage.grace:${userId}`]);
      return fn({
        entries: () => graceEntriesWithin(tx, userId),
        append: async (rows) => {
          let added = 0;
          for (const row of rows) {
            const once =
              row.entry === 'earned'
                ? `(user_id, season_number, milestone) WHERE entry = 'earned'`
                : `(user_id, local_date) WHERE entry = 'applied'`;
            const result = await tx.query(
              `INSERT INTO engage.grace_ledger (id, user_id, entry, season_number, local_date, milestone, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT ${once} DO NOTHING RETURNING id`,
              [row.id, row.userId, row.entry, row.seasonNumber, row.localDate, row.milestone, row.createdAt],
            );
            added += result.rows.length;
          }
          return added;
        },
      });
    });
  }

  // ----- nudges -----

  async claimNudge(userId: string, localDate: string, kind: string, at: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `INSERT INTO engage.nudge_log (user_id, local_date, kind, sent_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, local_date) DO NOTHING RETURNING user_id`,
      [userId, localDate, kind, at],
    );
    return rows.length > 0;
  }

  async nudgeSettings(userId: string): Promise<Partial<Record<NudgeKind, boolean>>> {
    const { rows } = await this.db.query<{ kind: NudgeKind; enabled: boolean }>(
      'SELECT kind, enabled FROM engage.nudge_settings WHERE user_id = $1',
      [userId],
    );
    return Object.fromEntries(rows.map((r) => [r.kind, Boolean(r.enabled)]));
  }

  async setNudgeSetting(userId: string, kind: NudgeKind, enabled: boolean, at: string): Promise<void> {
    await this.db.query(
      `INSERT INTO engage.nudge_settings (user_id, kind, enabled, updated_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, kind) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at`,
      [userId, kind, enabled, at],
    );
  }

  // ----- share kit -----

  async shareLink(userId: string, kind: ShareKindP1, seasonNumber: number): Promise<ShareLinkRow | null> {
    const { rows } = await this.db.query(
      `SELECT ${LINK_COLUMNS} FROM engage.share_links
       WHERE user_id = $1 AND kind = $2 AND season_number = $3`,
      [userId, kind, seasonNumber],
    );
    return rows[0] ? toLink(rows[0]) : null;
  }

  async insertShareLink(row: ShareLinkRow): Promise<InsertShareLinkOutcome> {
    try {
      await this.db.query(
        `INSERT INTO engage.share_links (${LINK_COLUMNS}) VALUES ($1, $2, $3, $4, $5)`,
        [row.code, row.userId, row.kind, row.seasonNumber, row.createdAt],
      );
      return 'inserted';
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      if (constraintOf(err) === 'share_link_reuse') return 'exists';
      if (constraintOf(err) === 'share_links_pkey') return 'code_taken';
      throw err;
    }
  }

  async shareLinkByCode(code: string): Promise<ShareLinkRow | null> {
    const { rows } = await this.db.query(`SELECT ${LINK_COLUMNS} FROM engage.share_links WHERE code = $1`, [
      code,
    ]);
    return rows[0] ? toLink(rows[0]) : null;
  }

  async attribute(row: AttributionRow): Promise<boolean> {
    const { rows } = await this.db.query(
      `INSERT INTO engage.referral_attributions (invitee_user_id, share_code, squad_id, surface, created_at)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (invitee_user_id) DO NOTHING RETURNING invitee_user_id`,
      [row.inviteeUserId, row.shareCode, row.squadId, row.surface, row.createdAt],
    );
    return rows.length > 0;
  }

  async inviteesOf(userId: string): Promise<string[]> {
    const { rows } = await this.db.query<{ invitee_user_id: string }>(
      `SELECT a.invitee_user_id FROM engage.referral_attributions a
       JOIN engage.share_links l ON l.code = a.share_code WHERE l.user_id = $1`,
      [userId],
    );
    return rows.map((r) => r.invitee_user_id);
  }

  // ----- metrics -----

  async recordLanding(day: string, kind: ShareKindP1, surface: Surface): Promise<void> {
    await this.db.query(
      `INSERT INTO engage.share_landings (day, kind, surface, opens) VALUES ($1, $2, $3, 1)
       ON CONFLICT (day, kind, surface) DO UPDATE SET opens = engage.share_landings.opens + 1`,
      [day, kind, surface],
    );
  }

  async landingsSince(day: string): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(
      'SELECT COALESCE(SUM(opens), 0)::int AS n FROM engage.share_landings WHERE day >= $1',
      [day],
    );
    return Number(rows[0]?.n ?? 0);
  }

  async shareAttributionsSince(since: string): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM engage.referral_attributions
       WHERE share_code IS NOT NULL AND created_at >= $1`,
      [since],
    );
    return Number(rows[0]?.n ?? 0);
  }

  async squadFirstJoins(): Promise<Array<{ userId: string; joinedAt: string }>> {
    const { rows } = await this.db.query<{ user_id: string; joined_at: unknown }>(
      'SELECT user_id, MIN(joined_at) AS joined_at FROM engage.squad_members GROUP BY user_id',
    );
    return rows.map((r) => ({ userId: r.user_id, joinedAt: iso(r.joined_at) }));
  }

  async enrolledUsers(seasonNumber: number): Promise<string[]> {
    const { rows } = await this.db.query<{ user_id: string }>(
      'SELECT user_id FROM engage.season_enrolments WHERE season_number = $1',
      [seasonNumber],
    );
    return rows.map((r) => r.user_id);
  }

  async armsOf(experiment: 'early_cheers'): Promise<Array<{ userId: string; arm: ExperimentArm }>> {
    const { rows } = await this.db.query<{ user_id: string; arm: ExperimentArm }>(
      'SELECT user_id, arm FROM engage.experiment_arms WHERE experiment = $1',
      [experiment],
    );
    return rows.map((r) => ({ userId: r.user_id, arm: r.arm }));
  }

  async graceAppliedIn(seasonNumber: number): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM engage.grace_ledger WHERE entry = 'applied' AND season_number = $1`,
      [seasonNumber],
    );
    return Number(rows[0]?.n ?? 0);
  }

  async cheersPerSender(from: string, to: string): Promise<number[]> {
    const { rows } = await this.db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM engage.cheers
       WHERE from_kind = 'member' AND from_user_id IS NOT NULL AND local_date BETWEEN $1 AND $2
       GROUP BY from_user_id`,
      [from, to],
    );
    return rows.map((r) => Number(r.n));
  }

  // ----- privacy -----

  async exportUser(userId: string): Promise<EngageExport> {
    const q = (text: string) => this.db.query(text, [userId]).then((r) => r.rows);
    const [enrolments, memberships, squads, sent, received, grace, nudges, nudgePrefs, arms, links, attribution] =
      await Promise.all([
        q(`SELECT ${ENROLMENT_COLUMNS} FROM engage.season_enrolments WHERE user_id = $1`),
        q(`SELECT m.squad_id, m.user_id, m.member_ref, m.season_number, m.role, m.show_stats,
                  m.joined_at, m.left_at, s.name AS squad_name
           FROM engage.squad_members m JOIN engage.squads s ON s.id = m.squad_id
           WHERE m.user_id = $1`),
        q(`SELECT ${SQUAD_COLUMNS} FROM engage.squads WHERE created_by = $1`),
        q(`SELECT ${CHEER_COLUMNS} FROM engage.cheers WHERE from_user_id = $1`),
        q(`SELECT ${CHEER_COLUMNS} FROM engage.cheers WHERE to_user_id = $1`),
        q(`SELECT ${GRACE_COLUMNS} FROM engage.grace_ledger WHERE user_id = $1 ORDER BY seq`),
        q(`SELECT local_date::text AS local_date, kind, sent_at FROM engage.nudge_log WHERE user_id = $1`),
        q(`SELECT kind, enabled, updated_at FROM engage.nudge_settings WHERE user_id = $1`),
        q(`SELECT experiment, arm, assigned_at FROM engage.experiment_arms WHERE user_id = $1`),
        q(`SELECT ${LINK_COLUMNS} FROM engage.share_links WHERE user_id = $1`),
        q(`SELECT share_code, squad_id, surface, created_at FROM engage.referral_attributions
           WHERE invitee_user_id = $1`),
      ]);
    return {
      enrolments: enrolments.map(toEnrolment),
      memberships: memberships.map((r) => {
        const { userId: _omit, ...rest } = toMember(r);
        return { ...rest, squadName: String(r.squad_name) };
      }),
      squadsCreated: squads.map(toSquad).map(({ id, name, seasonNumber, createdAt }) => ({
        id,
        name,
        seasonNumber,
        createdAt,
      })),
      cheersSent: sent.map(toCheer).map(({ id, cheer, localDate, createdAt }) => ({
        id,
        cheer,
        localDate,
        createdAt,
      })),
      cheersReceived: received
        .map(toCheer)
        .map(({ id, fromKind, coachId, cheer, localDate, createdAt, seenAt }) => ({
          id,
          fromKind,
          coachId,
          cheer,
          localDate,
          createdAt,
          seenAt,
        })),
      grace: grace.map(toGrace),
      nudges: nudges.map((r) => ({
        localDate: String(r.local_date),
        kind: String(r.kind),
        sentAt: iso(r.sent_at),
      })),
      nudgeSettings: nudgePrefs.map((r) => ({
        kind: r.kind as NudgeKind,
        enabled: Boolean(r.enabled),
        updatedAt: iso(r.updated_at),
      })),
      experiments: arms.map((r) => ({
        experiment: String(r.experiment),
        arm: r.arm as ExperimentArm,
        assignedAt: iso(r.assigned_at),
      })),
      shareLinks: links.map(toLink),
      attribution: attribution[0]
        ? {
            shareCode: (attribution[0].share_code as string | null) ?? null,
            squadId: (attribution[0].squad_id as string | null) ?? null,
            surface: attribution[0].surface as AttributionRow['surface'],
            createdAt: iso(attribution[0].created_at),
          }
        : null,
    };
  }

  async eraseUser(userId: string, at: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Squad order is fixed so two erasures sharing squads lock them in the
      // same order and cannot deadlock.
      const { rows } = await tx.query<{ squad_id: string }>(
        `SELECT squad_id FROM engage.squad_members
         WHERE user_id = $1 AND left_at IS NULL ORDER BY squad_id COLLATE "C"`,
        [userId],
      );
      for (const row of rows) await leaveWithin(tx, row.squad_id, userId, at);
      const statements = [
        'DELETE FROM engage.squad_members WHERE user_id = $1',
        `UPDATE engage.squads SET name = '${ARCHIVED_SQUAD_NAME}', tg_chat_instance_hash = NULL
         WHERE created_by = $1 AND archived_at IS NOT NULL`,
        'UPDATE engage.squads SET created_by = NULL WHERE created_by = $1',
        'DELETE FROM engage.season_enrolments WHERE user_id = $1',
        'DELETE FROM engage.cheers WHERE to_user_id = $1',
        'UPDATE engage.cheers SET from_user_id = NULL WHERE from_user_id = $1',
        'DELETE FROM engage.grace_ledger WHERE user_id = $1',
        'DELETE FROM engage.nudge_log WHERE user_id = $1',
        'DELETE FROM engage.nudge_settings WHERE user_id = $1',
        'DELETE FROM engage.experiment_arms WHERE user_id = $1',
        // Referral rows that pointed at these links keep the invitee and lose
        // the code (ON DELETE SET NULL), so the inviter is unlinkable.
        'DELETE FROM engage.share_links WHERE user_id = $1',
        'DELETE FROM engage.referral_attributions WHERE invitee_user_id = $1',
      ];
      for (const statement of statements) await tx.query(statement, [userId]);
    });
  }
}

async function graceEntriesWithin(db: SqlRunner, userId: string): Promise<GraceRow[]> {
  const { rows } = await db.query(
    `SELECT ${GRACE_COLUMNS} FROM engage.grace_ledger WHERE user_id = $1 ORDER BY seq`,
    [userId],
  );
  return rows.map(toGrace);
}

async function insertMember(tx: SqlRunner, member: MemberRow): Promise<void> {
  await tx.query(
    `INSERT INTO engage.squad_members (${MEMBER_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      member.squadId,
      member.userId,
      member.memberRef,
      member.seasonNumber,
      member.role,
      member.showStats,
      member.joinedAt,
      member.leftAt,
    ],
  );
}
