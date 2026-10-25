/**
 * In-memory EngageRepo for tests and keyless local dev (see ./types).
 *
 * It reproduces every unique rule and every atomic rule the Postgres schema
 * enforces, because the contract suite holds both adapters to the same
 * answers. Node runs each method to completion between awaits, so a method
 * with no await inside is as atomic here as a transaction is in Postgres.
 *
 * Rows are copied in and out so a caller mutating a returned object cannot
 * reach into the store, which is the isolation a database gives for free.
 */
import type { NudgeKind, ShareKindP1 } from '@aquazerofit/shared';
import { ARCHIVED_SQUAD_NAME } from './types';
import type {
  AttributionRow,
  CheerPage,
  CheerRow,
  CreateSquadOutcome,
  EngageExport,
  EngageRepo,
  EnrolmentRow,
  GraceLedger,
  GraceRow,
  InsertShareLinkOutcome,
  JoinSquadOutcome,
  MemberRow,
  ShareLinkRow,
  SquadRow,
} from './types';

const copy = <T extends object>(row: T): T => ({ ...row });

/**
 * Code-point order, the same as `COLLATE "C"` in the SQL adapter. Not
 * localeCompare: the database and every locale disagree about case, and a
 * tie-break that differs between adapters hands a squad to a different heir.
 */
const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Newest first, ties by id, matching the inbox index order. */
const newestFirst = (a: CheerRow, b: CheerRow): number =>
  byCodePoint(b.createdAt, a.createdAt) || byCodePoint(b.id, a.id);

export class MemoryEngageRepo implements EngageRepo {
  private enrolments: EnrolmentRow[] = [];
  private squads: SquadRow[] = [];
  private members: MemberRow[] = [];
  private cheers: CheerRow[] = [];
  private grace: GraceRow[] = [];
  private nudges: Array<{ userId: string; localDate: string; kind: string; sentAt: string }> = [];
  private nudgePrefs: Array<{ userId: string; kind: NudgeKind; enabled: boolean; updatedAt: string }> = [];
  private links: ShareLinkRow[] = [];
  private attributions: AttributionRow[] = [];

  // ----- enrolment -----

  async enrol(row: EnrolmentRow): Promise<{ row: EnrolmentRow; created: boolean }> {
    const held = this.findEnrolment(row.userId, row.seasonNumber);
    if (held) return { row: copy(held), created: false };
    this.enrolments.push(copy(row));
    return { row: copy(row), created: true };
  }

  async enrolment(userId: string, seasonNumber: number): Promise<EnrolmentRow | null> {
    const held = this.findEnrolment(userId, seasonNumber);
    return held ? copy(held) : null;
  }

  private findEnrolment(userId: string, seasonNumber: number): EnrolmentRow | undefined {
    return this.enrolments.find((e) => e.userId === userId && e.seasonNumber === seasonNumber);
  }

  // ----- squads -----

  async createSquad(squad: SquadRow, owner: MemberRow): Promise<CreateSquadOutcome> {
    if (this.active(owner.userId, owner.seasonNumber)) return { ok: false, reason: 'already_member' };
    if (this.squads.some((s) => s.inviteCode === squad.inviteCode)) {
      return { ok: false, reason: 'code_taken' };
    }
    if (squad.cornerHash && this.liveCorner(squad.seasonNumber, squad.cornerHash)) {
      return { ok: false, reason: 'corner_taken' };
    }
    this.squads.push(copy(squad));
    this.members.push(copy(owner));
    return { ok: true };
  }

  async squad(id: string): Promise<SquadRow | null> {
    const found = this.squads.find((s) => s.id === id);
    return found ? copy(found) : null;
  }

  async squadByCode(code: string): Promise<SquadRow | null> {
    const found = this.squads.find((s) => s.inviteCode === code);
    return found ? copy(found) : null;
  }

  async squadByCorner(seasonNumber: number, cornerHash: string): Promise<SquadRow | null> {
    const found = this.liveCorner(seasonNumber, cornerHash);
    return found ? copy(found) : null;
  }

  private liveCorner(seasonNumber: number, cornerHash: string): SquadRow | undefined {
    return this.squads.find(
      (s) => s.seasonNumber === seasonNumber && s.cornerHash === cornerHash && s.archivedAt === null,
    );
  }

  private active(userId: string, seasonNumber: number): MemberRow | undefined {
    return this.members.find(
      (m) => m.userId === userId && m.seasonNumber === seasonNumber && m.leftAt === null,
    );
  }

  private activeIn(squadId: string): MemberRow[] {
    return this.members
      .filter((m) => m.squadId === squadId && m.leftAt === null)
      .sort((a, b) => byCodePoint(a.joinedAt, b.joinedAt) || byCodePoint(a.memberRef, b.memberRef));
  }

  async activeMembership(userId: string, seasonNumber: number): Promise<MemberRow | null> {
    const found = this.active(userId, seasonNumber);
    return found ? copy(found) : null;
  }

  async activeMembers(squadId: string): Promise<MemberRow[]> {
    return this.activeIn(squadId).map(copy);
  }

  async activeMemberByRef(squadId: string, memberRef: string): Promise<MemberRow | null> {
    const found = this.members.find(
      (m) => m.squadId === squadId && m.memberRef === memberRef && m.leftAt === null,
    );
    return found ? copy(found) : null;
  }

  async joinSquad(squadId: string, member: MemberRow): Promise<JoinSquadOutcome> {
    const squad = this.squads.find((s) => s.id === squadId);
    if (!squad) return { ok: false, reason: 'not_found' };
    if (squad.archivedAt !== null) return { ok: false, reason: 'archived' };
    if (this.active(member.userId, member.seasonNumber)) return { ok: false, reason: 'already_member' };
    if (this.activeIn(squadId).length >= squad.maxMembers) return { ok: false, reason: 'full' };

    // A member who left and comes back reuses their row (one row per squad
    // and person) with a fresh join time and their numbers hidden again.
    const previous = this.members.find((m) => m.squadId === squadId && m.userId === member.userId);
    if (previous) {
      Object.assign(previous, {
        role: 'member',
        showStats: false,
        joinedAt: member.joinedAt,
        leftAt: null,
      } satisfies Partial<MemberRow>);
      return { ok: true, member: copy(previous) };
    }
    this.members.push(copy(member));
    return { ok: true, member: copy(member) };
  }

  async leaveSquad(squadId: string, userId: string, at: string): Promise<boolean> {
    const member = this.members.find(
      (m) => m.squadId === squadId && m.userId === userId && m.leftAt === null,
    );
    if (!member) return false;
    member.leftAt = at;
    const wasOwner = member.role === 'owner';
    member.role = 'member';
    if (wasOwner) {
      const heir = this.activeIn(squadId)[0];
      if (heir) heir.role = 'owner';
    }
    if (this.activeIn(squadId).length === 0) {
      const squad = this.squads.find((s) => s.id === squadId);
      if (squad && squad.archivedAt === null) squad.archivedAt = at;
    }
    return true;
  }

  async setShowStats(squadId: string, userId: string, showStats: boolean): Promise<MemberRow | null> {
    const member = this.members.find(
      (m) => m.squadId === squadId && m.userId === userId && m.leftAt === null,
    );
    if (!member) return null;
    member.showStats = showStats;
    return copy(member);
  }

  async setInviteCode(squadId: string, inviteCode: string): Promise<'ok' | 'code_taken' | 'not_found'> {
    const squad = this.squads.find((s) => s.id === squadId && s.archivedAt === null);
    if (!squad) return 'not_found';
    if (this.squads.some((s) => s.inviteCode === inviteCode)) return 'code_taken';
    squad.inviteCode = inviteCode;
    return 'ok';
  }

  async squadsCreatedSince(userId: string, since: string): Promise<number> {
    return this.squads.filter((s) => s.createdBy === userId && s.createdAt >= since).length;
  }

  // ----- cheers -----

  async insertCheer(row: CheerRow): Promise<boolean> {
    // An id collision is a bug, not a second cheer: Postgres raises on it too.
    if (this.cheers.some((c) => c.id === row.id)) throw new Error(`duplicate cheer id ${row.id}`);
    const clash = this.cheers.some((c) =>
      row.fromKind === 'member'
        ? c.fromKind === 'member' &&
          c.fromUserId === row.fromUserId &&
          c.toUserId === row.toUserId &&
          c.localDate === row.localDate
        : c.fromKind === 'coach' && c.toUserId === row.toUserId && c.localDate === row.localDate,
    );
    if (clash) return false;
    this.cheers.push(copy(row));
    return true;
  }

  async cheersTo(userId: string, page: CheerPage): Promise<CheerRow[]> {
    const { before } = page;
    return this.cheers
      .filter(
        (c) =>
          c.toUserId === userId &&
          c.createdAt >= page.since &&
          (before === undefined || newestFirst(c, { ...c, createdAt: before.createdAt, id: before.id }) > 0),
      )
      .sort(newestFirst)
      .slice(0, page.limit)
      .map(copy);
  }

  async markCheersSeen(userId: string, ids: readonly string[], at: string): Promise<void> {
    const wanted = new Set(ids);
    for (const cheer of this.cheers) {
      if (cheer.toUserId === userId && wanted.has(cheer.id) && cheer.seenAt === null) cheer.seenAt = at;
    }
  }

  async unseenCheerCount(userId: string, since: string): Promise<number> {
    return this.cheers.filter((c) => c.toUserId === userId && c.seenAt === null && c.createdAt >= since)
      .length;
  }

  async cheersSentOn(fromUserId: string, localDate: string): Promise<CheerRow[]> {
    return this.cheers
      .filter((c) => c.fromKind === 'member' && c.fromUserId === fromUserId && c.localDate === localDate)
      .map(copy);
  }

  async cheerTally(userId: string, from: string, to: string): Promise<{ given: number; received: number }> {
    const inRange = (c: CheerRow) => c.localDate >= from && c.localDate <= to;
    return {
      given: this.cheers.filter((c) => c.fromUserId === userId && inRange(c)).length,
      received: this.cheers.filter((c) => c.toUserId === userId && inRange(c)).length,
    };
  }

  async coachCheersTo(userId: string): Promise<CheerRow[]> {
    return this.cheers
      .filter((c) => c.fromKind === 'coach' && c.toUserId === userId)
      .sort((a, b) => a.localDate.localeCompare(b.localDate))
      .map(copy);
  }

  // ----- Cut Man grace -----

  /** Array order is write order: rows are only ever appended. */
  async graceEntries(userId: string): Promise<GraceRow[]> {
    return this.grace.filter((g) => g.userId === userId).map(copy);
  }

  private graceLocks = new Map<string, Promise<unknown>>();

  async withGraceLedger<T>(userId: string, fn: (ledger: GraceLedger) => Promise<T>): Promise<T> {
    const previous = this.graceLocks.get(userId) ?? Promise.resolve();
    const run = previous.then(() =>
      fn({ entries: () => this.graceEntries(userId), append: (rows) => this.appendGrace(rows) }),
    );
    // The chain continues whether this holder succeeds or throws.
    const settled = run.catch(() => undefined);
    this.graceLocks.set(userId, settled);
    try {
      return await run;
    } finally {
      if (this.graceLocks.get(userId) === settled) this.graceLocks.delete(userId);
    }
  }

  private async appendGrace(rows: readonly GraceRow[]): Promise<number> {
    let added = 0;
    for (const row of rows) {
      const clash = this.grace.some((g) =>
        row.entry === 'earned'
          ? g.entry === 'earned' &&
            g.userId === row.userId &&
            g.seasonNumber === row.seasonNumber &&
            g.milestone === row.milestone
          : g.entry === 'applied' && g.userId === row.userId && g.localDate === row.localDate,
      );
      if (this.grace.some((g) => g.id === row.id)) throw new Error(`duplicate grace id ${row.id}`);
      if (clash) continue;
      this.grace.push(copy(row));
      added += 1;
    }
    return added;
  }

  // ----- nudges -----

  async claimNudge(userId: string, localDate: string, kind: string, at: string): Promise<boolean> {
    if (this.nudges.some((n) => n.userId === userId && n.localDate === localDate)) return false;
    this.nudges.push({ userId, localDate, kind, sentAt: at });
    return true;
  }

  async nudgeSettings(userId: string): Promise<Partial<Record<NudgeKind, boolean>>> {
    return Object.fromEntries(this.nudgePrefs.filter((p) => p.userId === userId).map((p) => [p.kind, p.enabled]));
  }

  async setNudgeSetting(userId: string, kind: NudgeKind, enabled: boolean, at: string): Promise<void> {
    const held = this.nudgePrefs.find((p) => p.userId === userId && p.kind === kind);
    if (held) Object.assign(held, { enabled, updatedAt: at });
    else this.nudgePrefs.push({ userId, kind, enabled, updatedAt: at });
  }

  // ----- share kit -----

  async shareLink(userId: string, kind: ShareKindP1, seasonNumber: number): Promise<ShareLinkRow | null> {
    const found = this.links.find(
      (l) => l.userId === userId && l.kind === kind && l.seasonNumber === seasonNumber,
    );
    return found ? copy(found) : null;
  }

  async insertShareLink(row: ShareLinkRow): Promise<InsertShareLinkOutcome> {
    // The primary key is checked before the reuse index, as in Postgres.
    if (this.links.some((l) => l.code === row.code)) return 'code_taken';
    if (
      this.links.some(
        (l) => l.userId === row.userId && l.kind === row.kind && l.seasonNumber === row.seasonNumber,
      )
    ) {
      return 'exists';
    }
    this.links.push(copy(row));
    return 'inserted';
  }

  async shareLinkByCode(code: string): Promise<ShareLinkRow | null> {
    const found = this.links.find((l) => l.code === code);
    return found ? copy(found) : null;
  }

  async attribute(row: AttributionRow): Promise<boolean> {
    if (this.attributions.some((a) => a.inviteeUserId === row.inviteeUserId)) return false;
    this.attributions.push(copy(row));
    return true;
  }

  async inviteesOf(userId: string): Promise<string[]> {
    const codes = new Set(this.links.filter((l) => l.userId === userId).map((l) => l.code));
    return this.attributions
      .filter((a) => a.shareCode !== null && codes.has(a.shareCode))
      .map((a) => a.inviteeUserId);
  }

  // ----- privacy -----

  async exportUser(userId: string): Promise<EngageExport> {
    const attribution = this.attributions.find((a) => a.inviteeUserId === userId);
    return {
      enrolments: this.enrolments.filter((e) => e.userId === userId).map(copy),
      memberships: this.members
        .filter((m) => m.userId === userId)
        .map(({ userId: _omit, ...rest }) => ({
          ...rest,
          squadName: this.squads.find((s) => s.id === rest.squadId)?.name ?? '',
        })),
      squadsCreated: this.squads
        .filter((s) => s.createdBy === userId)
        .map(({ id, name, seasonNumber, createdAt }) => ({ id, name, seasonNumber, createdAt })),
      cheersSent: this.cheers
        .filter((c) => c.fromUserId === userId)
        .map(({ id, cheer, localDate, createdAt }) => ({ id, cheer, localDate, createdAt })),
      cheersReceived: this.cheers
        .filter((c) => c.toUserId === userId)
        .map(({ id, fromKind, coachId, cheer, localDate, createdAt, seenAt }) => ({
          id,
          fromKind,
          coachId,
          cheer,
          localDate,
          createdAt,
          seenAt,
        })),
      grace: this.grace.filter((g) => g.userId === userId).map(copy),
      nudges: this.nudges
        .filter((n) => n.userId === userId)
        .map(({ localDate, kind, sentAt }) => ({ localDate, kind, sentAt })),
      nudgeSettings: this.nudgePrefs
        .filter((p) => p.userId === userId)
        .map(({ kind, enabled, updatedAt }) => ({ kind, enabled, updatedAt })),
      shareLinks: this.links.filter((l) => l.userId === userId).map(copy),
      attribution: attribution
        ? (({ inviteeUserId: _omit, ...rest }) => rest)(attribution)
        : null,
    };
  }

  async eraseUser(userId: string, at: string): Promise<void> {
    for (const member of this.members.filter((m) => m.userId === userId && m.leftAt === null)) {
      await this.leaveSquad(member.squadId, userId, at);
    }
    this.members = this.members.filter((m) => m.userId !== userId);
    for (const squad of this.squads) {
      if (squad.createdBy !== userId) continue;
      if (squad.archivedAt !== null) Object.assign(squad, { name: ARCHIVED_SQUAD_NAME, cornerHash: null });
      squad.createdBy = null;
    }
    this.enrolments = this.enrolments.filter((e) => e.userId !== userId);
    this.cheers = this.cheers.filter((c) => c.toUserId !== userId);
    for (const cheer of this.cheers) if (cheer.fromUserId === userId) cheer.fromUserId = null;
    this.grace = this.grace.filter((g) => g.userId !== userId);
    this.nudges = this.nudges.filter((n) => n.userId !== userId);
    this.nudgePrefs = this.nudgePrefs.filter((p) => p.userId !== userId);
    const codes = new Set(this.links.filter((l) => l.userId === userId).map((l) => l.code));
    this.links = this.links.filter((l) => l.userId !== userId);
    this.attributions = this.attributions.filter((a) => a.inviteeUserId !== userId);
    for (const attribution of this.attributions) {
      if (attribution.shareCode !== null && codes.has(attribution.shareCode)) attribution.shareCode = null;
    }
  }
}
