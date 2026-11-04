/**
 * EngageRepo: the one door to Fight Camp's relational data (AZF-P1 §4.1).
 *
 * Two adapters implement it and one contract suite runs against both
 * (engageRepo.contract.test.ts):
 *
 *  - PgEngageRepo: parameterised SQL over the shared pool. Production.
 *  - MemoryEngageRepo: the same rules over arrays. Tests and keyless local
 *    dev, where there is no DATABASE_URL. It loses its data on restart, which
 *    is the honest cost of "no keys needed"; production refuses to boot
 *    without a database, so it never runs there.
 *
 * Rules that protect integrity live HERE rather than in services, because
 * only here can they be atomic: one active squad per user per season, a full
 * squad refusing a sixth member, ownership passing on when the owner leaves,
 * one cheer per sender, recipient and day. Outcomes come back as values, not
 * database errors, so a service never has to know which adapter it is on.
 *
 * Every timestamp is passed in by the caller. That keeps a pinned test clock
 * and the database in agreement, and makes "now" a decision made once per
 * request rather than once per statement.
 */
import type { CheerKind, EnrolSource, NudgeKind, ShareKindP1 } from '@aquazerofit/shared';

export interface EnrolmentRow {
  userId: string;
  seasonNumber: number;
  source: EnrolSource;
  enrolledAt: string;
}

export interface SquadRow {
  id: string;
  seasonNumber: number;
  name: string;
  inviteCode: string;
  /** HMAC of a Telegram group's chat_instance, never the raw value. */
  cornerHash: string | null;
  maxMembers: number;
  /** Null once the creator's account is erased. */
  createdBy: string | null;
  createdAt: string;
  archivedAt: string | null;
}

export type SquadRole = 'owner' | 'member';

export interface MemberRow {
  squadId: string;
  userId: string;
  /** Opaque id clients address members by. Never the user id. */
  memberRef: string;
  seasonNumber: number;
  role: SquadRole;
  showStats: boolean;
  joinedAt: string;
  leftAt: string | null;
}

export type CheerFrom = 'member' | 'coach';

export interface CheerRow {
  id: string;
  fromKind: CheerFrom;
  /** Null for coach cheers, and nulled when the sender's account is erased. */
  fromUserId: string | null;
  coachId: string | null;
  toUserId: string;
  squadId: string | null;
  cheer: CheerKind;
  /** The sender's local date: the day the one-a-day rule is counted on. */
  localDate: string;
  createdAt: string;
  seenAt: string | null;
}

export type GraceEntry = 'earned' | 'applied';

export interface GraceRow {
  id: string;
  userId: string;
  entry: GraceEntry;
  seasonNumber: number;
  /** earned: the active date that reached the milestone; applied: the bridged date. */
  localDate: string;
  /** earned only: 7, 14, 21 ... active days into the season. */
  milestone: number | null;
  createdAt: string;
}

export interface ShareLinkRow {
  code: string;
  userId: string;
  kind: ShareKindP1;
  seasonNumber: number;
  createdAt: string;
}

export type Surface = 'web' | 'tma';

export type ExperimentArm = 'treatment' | 'holdout';

export interface AttributionRow {
  inviteeUserId: string;
  shareCode: string | null;
  squadId: string | null;
  surface: Surface;
  createdAt: string;
}

/** The user's grace ledger, as seen from inside their lock. */
export interface GraceLedger {
  /** Every row, in write order. */
  entries(): Promise<GraceRow[]>;
  /**
   * Append in the order given; rows a unique rule refuses (an earn already
   * held, a date already bridged) are skipped. Returns how many were new.
   */
  append(rows: readonly GraceRow[]): Promise<number>;
}

export type CreateSquadOutcome =
  | { ok: true }
  | { ok: false; reason: 'already_member' | 'corner_taken' | 'code_taken' };

export type JoinSquadOutcome =
  | { ok: true; member: MemberRow }
  | { ok: false; reason: 'not_found' | 'archived' | 'full' | 'already_member' | 'removed' };

export type InsertShareLinkOutcome = 'inserted' | 'exists' | 'code_taken';

/**
 * Where the previous page ended. Both fields, because several cheers can
 * share one instant: a timestamp alone would skip all but the first of them.
 */
export interface CheerCursor {
  createdAt: string;
  id: string;
}

export interface CheerPage {
  /** Only cheers strictly after this one in newest-first order. */
  before?: CheerCursor;
  /** Only cheers created at or after this instant. */
  since: string;
  limit: number;
}

/** Everything engage holds about one person, for GET /me/export. */
export interface EngageExport {
  enrolments: EnrolmentRow[];
  memberships: Array<Omit<MemberRow, 'userId'> & { squadName: string }>;
  squadsCreated: Array<Pick<SquadRow, 'id' | 'name' | 'seasonNumber' | 'createdAt'>>;
  /** Recipients are not named: their identity is theirs, not the sender's. */
  cheersSent: Array<Pick<CheerRow, 'id' | 'cheer' | 'localDate' | 'createdAt'>>;
  /** Senders appear only as a kind: a member's id is not the recipient's to export. */
  cheersReceived: Array<Pick<CheerRow, 'id' | 'fromKind' | 'coachId' | 'cheer' | 'localDate' | 'createdAt' | 'seenAt'>>;
  grace: GraceRow[];
  nudges: Array<{ localDate: string; kind: string; sentAt: string }>;
  nudgeSettings: Array<{ kind: NudgeKind; enabled: boolean; updatedAt: string }>;
  experiments: Array<{ experiment: string; arm: ExperimentArm; assignedAt: string }>;
  shareLinks: ShareLinkRow[];
  attribution: Omit<AttributionRow, 'inviteeUserId'> | null;
}

export interface EngageRepo {
  // ----- enrolment -----
  /** Idempotent: a second call returns the stored row with created=false. */
  enrol(row: EnrolmentRow): Promise<{ row: EnrolmentRow; created: boolean }>;
  enrolment(userId: string, seasonNumber: number): Promise<EnrolmentRow | null>;

  // ----- squads -----
  createSquad(squad: SquadRow, owner: MemberRow): Promise<CreateSquadOutcome>;
  squad(id: string): Promise<SquadRow | null>;
  squadByCode(code: string): Promise<SquadRow | null>;
  /** The live (unarchived) squad bound to a group's hash this season. */
  squadByCorner(seasonNumber: number, cornerHash: string): Promise<SquadRow | null>;
  activeMembership(userId: string, seasonNumber: number): Promise<MemberRow | null>;
  /** Active members, earliest joined first. */
  activeMembers(squadId: string): Promise<MemberRow[]>;
  /** The active member of this squad with this ref, or null. Scoped so a ref can never reach across squads. */
  activeMemberByRef(squadId: string, memberRef: string): Promise<MemberRow | null>;
  /** Atomic: capacity, archival and the one-squad rule are checked together. */
  joinSquad(squadId: string, member: MemberRow): Promise<JoinSquadOutcome>;
  /**
   * Atomic leave. When the owner leaves, ownership passes to the earliest
   * joined active member; when nobody is left the squad is archived. False
   * when the user was not an active member.
   */
  leaveSquad(squadId: string, userId: string, at: string, opts?: { removed?: boolean }): Promise<boolean>;
  /** Whether the owner took this person out of this squad (they cannot rejoin it). */
  wasRemoved(squadId: string, userId: string): Promise<boolean>;
  setShowStats(squadId: string, userId: string, showStats: boolean): Promise<MemberRow | null>;
  /** Replace a live squad's invite code. */
  setInviteCode(squadId: string, inviteCode: string): Promise<'ok' | 'code_taken' | 'not_found'>;
  squadsCreatedSince(userId: string, since: string): Promise<number>;

  // ----- cheers -----
  /** False when the one-a-day rule (member or coach) already holds a row. */
  insertCheer(row: CheerRow): Promise<boolean>;
  /** Newest first. */
  cheersTo(userId: string, page: CheerPage): Promise<CheerRow[]>;
  markCheersSeen(userId: string, ids: readonly string[], at: string): Promise<void>;
  unseenCheerCount(userId: string, since: string): Promise<number>;
  /** Member cheers this sender has sent on a local date (for "Sent today"). */
  cheersSentOn(fromUserId: string, localDate: string): Promise<CheerRow[]>;
  /** Cheers given and received with sender-local dates in [from, to]. */
  cheerTally(userId: string, from: string, to: string): Promise<{ given: number; received: number }>;
  coachCheersTo(userId: string): Promise<CheerRow[]>;
  /** Whether this sender has ever cheered this recipient. */
  hasCheered(fromUserId: string, toUserId: string): Promise<boolean>;

  // ----- experiments -----
  /** Record the arm once; true only for the call that recorded it. */
  assignArm(userId: string, experiment: 'early_cheers', arm: ExperimentArm, at: string): Promise<boolean>;

  // ----- Cut Man grace -----
  /** Every ledger row for the user, in write order. */
  graceEntries(userId: string): Promise<GraceRow[]>;
  /**
   * Run `fn` holding the user's grace lock, so one read-plan-write cycle
   * cannot interleave with another (two tabs, or the dashboard's parallel
   * reads). The ledger handed to `fn` is the only way to write grace.
   */
  withGraceLedger<T>(userId: string, fn: (ledger: GraceLedger) => Promise<T>): Promise<T>;

  // ----- nudges -----
  /** Claim the user's one nudge for a local date. False when already claimed. */
  claimNudge(userId: string, localDate: string, kind: string, at: string): Promise<boolean>;
  /** Kinds the user switched off or back on; a kind with no row is on. */
  nudgeSettings(userId: string): Promise<Partial<Record<NudgeKind, boolean>>>;
  setNudgeSetting(userId: string, kind: NudgeKind, enabled: boolean, at: string): Promise<void>;

  // ----- share kit -----
  shareLink(userId: string, kind: ShareKindP1, seasonNumber: number): Promise<ShareLinkRow | null>;
  insertShareLink(row: ShareLinkRow): Promise<InsertShareLinkOutcome>;
  shareLinkByCode(code: string): Promise<ShareLinkRow | null>;
  /** First touch wins: false when the invitee already has an attribution. */
  attribute(row: AttributionRow): Promise<boolean>;
  /** Invitees attributed to any of this user's share links. */
  inviteesOf(userId: string): Promise<string[]>;

  // ----- privacy -----
  exportUser(userId: string): Promise<EngageExport>;
  /**
   * Remove or anonymise everything engage holds about the user (PRD §8.4):
   * leave every squad (ownership passes on), delete enrolments, memberships,
   * grace, nudges, share links and their own attribution; null them as the
   * sender of cheers and as a squad's creator; delete cheers sent to them.
   * A squad they named that nobody is left in loses its name and its group
   * binding too: the name is free text they typed.
   */
  eraseUser(userId: string, at: string): Promise<void>;
}

/** What an erased creator's archived squad is called from then on. */
export const ARCHIVED_SQUAD_NAME = 'Archived squad';

/**
 * Every table in the engage schema and what export and erasure do with it.
 * The table-enumeration test parses the migrations and fails if a table that
 * holds user data is missing here, so a new table cannot quietly skip the
 * privacy sweep.
 */
export const ENGAGE_TABLE_PRIVACY = {
  schema_migrations: { userData: false },
  season_enrolments: { userData: true, exportedAs: 'enrolments', erasure: 'delete' },
  squads: {
    userData: true,
    exportedAs: 'squadsCreated',
    erasure: 'null created_by; rename and unbind archived squads they created',
  },
  squad_members: { userData: true, exportedAs: 'memberships', erasure: 'leave, then delete' },
  cheers: {
    userData: true,
    exportedAs: 'cheersSent, cheersReceived',
    erasure: 'null from_user_id on sent, delete received',
  },
  grace_ledger: { userData: true, exportedAs: 'grace', erasure: 'delete' },
  nudge_log: { userData: true, exportedAs: 'nudges', erasure: 'delete' },
  nudge_settings: { userData: true, exportedAs: 'nudgeSettings', erasure: 'delete' },
  experiment_arms: { userData: true, exportedAs: 'experiments', erasure: 'delete' },
  share_links: { userData: true, exportedAs: 'shareLinks', erasure: 'delete' },
  referral_attributions: { userData: true, exportedAs: 'attribution', erasure: 'delete' },
} as const satisfies Record<
  string,
  { userData: false } | { userData: true; exportedAs: string; erasure: string }
>;
