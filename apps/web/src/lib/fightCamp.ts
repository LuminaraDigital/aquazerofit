/**
 * Fight Camp client (AZF-P1): the hooks behind enrolment, squads, cheers,
 * grace and the Share Kit.
 *
 * The status block itself rides GET /fight-record (see useFightCamp in
 * ./fightRecord), so every write here refreshes that one cache entry rather
 * than keeping a second copy of the same state.
 */
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  CheerKind,
  CheerView,
  EnrolSource,
  NudgeSettings,
  EnrolmentView,
  SquadCornerInput,
  SquadCornerView,
  SquadMemberView,
  SeasonRecap,
  ShareKindP1,
  ShareLinkView,
  SquadPeekView,
  SquadView,
} from '@aquazerofit/shared';
import { api, ApiError } from './api';
import { unwrap } from './envelopes';
import { fightRecordKey, type FightRecordEnvelope } from './fightRecord';
import { telegramStartAppUrl } from './telegramLink';

export function useEnrol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (source: EnrolSource) =>
      unwrap<EnrolmentView>(
        await api<unknown>('/fight-camp/enrolments', { method: 'POST', body: { source } }),
        'enrolment',
      ),
    // Mark the cached status enrolled straight away, so the action cannot be
    // tapped a second time while the refetch is still on its way.
    onSuccess: () =>
      qc.setQueryData<FightRecordEnvelope>(fightRecordKey, (envelope) =>
        envelope?.fightCamp?.enrolment
          ? {
              ...envelope,
              fightCamp: {
                ...envelope.fightCamp,
                enrolment: { ...envelope.fightCamp.enrolment, enrolled: true },
              },
            }
          : envelope,
      ),
    onSettled: () => void qc.invalidateQueries({ queryKey: fightRecordKey }),
  });
}

// ---------- squads ----------

/** The server's message when it has one: its copy is already reviewed. */
export function squadErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.body?.message ? error.body.message : fallback;
}

/**
 * Under ['progress'] like the Fight Record key, so a log anywhere refreshes
 * the weekly board without new wiring.
 */
export const squadKey = ['progress', 'squad'] as const;

/** Null while the caller has no squad this season. */
export function useSquad(enabled = true): UseQueryResult<SquadView | null> {
  return useQuery({
    queryKey: squadKey,
    queryFn: async () => unwrap<SquadView>(await api<unknown>('/squads/current'), 'squad'),
    enabled,
  });
}

/** The public invite preview. Null for a code that matches no live squad. */
export async function peekSquad(code: string): Promise<SquadPeekView | null> {
  const body = await api<{ squad: SquadPeekView | null }>(
    `/squads/peek/${encodeURIComponent(code)}`,
    { auth: false },
  );
  return body?.squad ?? null;
}

function useSquadWrite<TInput>(write: (input: TInput) => Promise<SquadView | null>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: (squad) => qc.setQueryData(squadKey, squad),
    onSettled: () => void qc.invalidateQueries({ queryKey: fightRecordKey }),
  });
}

/** Both writes send `consent: true`: the server refuses them without it. */
export function useCreateSquad() {
  return useSquadWrite(async (name: string) =>
    unwrap<SquadView>(await api<unknown>('/squads', { method: 'POST', body: { name, consent: true } }), 'squad'),
  );
}

export function useJoinSquad() {
  return useSquadWrite(async ({ code, via }: { code: string; via: 'code' | 'link' }) =>
    unwrap<SquadView>(
      await api<unknown>('/squads/join', { method: 'POST', query: { via }, body: { code, consent: true } }),
      'squad',
    ),
  );
}

/** Owner only: a fresh invite code; links with the old one stop working. */
export function useRotateInviteCode() {
  return useSquadWrite(async (squadId: string) =>
    unwrap<SquadView>(
      await api<unknown>(`/squads/${encodeURIComponent(squadId)}/rotate-code`, { method: 'POST' }),
      'squad',
    ),
  );
}

/** Owner only: take a member out of the squad. */
export function useRemoveMember(squadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberRef: string) =>
      api<void>(`/squads/${encodeURIComponent(squadId)}/members/${encodeURIComponent(memberRef)}/remove`, {
        method: 'POST',
      }),
    onSuccess: (_void, memberRef) =>
      qc.setQueryData<SquadView | null>(squadKey, (squad) =>
        squad ? { ...squad, members: squad.members.filter((m) => m.ref !== memberRef) } : squad,
      ),
    onSettled: () => void qc.invalidateQueries({ queryKey: squadKey }),
  });
}

/** The reason code the API put in an error's details, if any. */
export function errorReason(error: unknown): string | null {
  const reason = error instanceof ApiError ? (error.body?.details as { reason?: unknown } | undefined)?.reason : null;
  return typeof reason === 'string' ? reason : null;
}

export function useLeaveSquad() {
  return useSquadWrite(async (squadId: string) => {
    await api<void>(`/squads/${encodeURIComponent(squadId)}/leave`, { method: 'POST' });
    return null;
  });
}

export function useShowMyNumbers(squadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (showStats: boolean) =>
      unwrap<SquadMemberView>(
        await api<unknown>(`/squads/${encodeURIComponent(squadId)}/me`, {
          method: 'PATCH',
          body: { showStats },
        }),
        'member',
      ),
    onSuccess: (member, showStats) => {
      if (!member) return;
      qc.setQueryData<SquadView | null>(squadKey, (squad) =>
        squad
          ? {
              ...squad,
              me: { ...squad.me, showStats },
              members: squad.members.map((m) => (m.ref === member.ref ? member : m)),
            }
          : squad,
      );
    },
  });
}

/** t.me/<bot>/<app>?startapp=sq_<code>: opens the Mini App on the invite. */
export function squadTelegramUrl(squad: Pick<SquadView, 'tgStartParam'>): string {
  return telegramStartAppUrl(squad.tgStartParam);
}

/** Squad Corner: what the launching group's squad is, and act on it. */
export function useSquadCorner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SquadCornerInput) =>
      unwrap<SquadCornerView>(await api<unknown>('/squads/corner', { method: 'POST', body: input }), 'corner'),
    onSuccess: (corner) => {
      if (corner?.state === 'member') {
        void qc.invalidateQueries({ queryKey: squadKey });
        void qc.invalidateQueries({ queryKey: fightRecordKey });
      }
    },
  });
}

/** A prepared Telegram invite, or null when the client must fall back to a link. */
export async function prepareSquadInvite(squadId: string): Promise<string | null> {
  try {
    const body = await api<{ preparedMessageId: string | null }>(
      `/squads/${encodeURIComponent(squadId)}/invite-message`,
      { method: 'POST' },
    );
    return body?.preparedMessageId ?? null;
  } catch {
    return null;
  }
}

// ---------- cheers ----------

export const cheersKey = ['progress', 'cheers'] as const;

/** One tap: a fixed cheer to a squad mate. The board shows "Sent today" straight after. */
export function useSendCheer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ to, cheer }: { to: string; cheer: CheerKind }) =>
      api<unknown>('/cheers', { method: 'POST', body: { to, cheer } }),
    onSuccess: (_body, { to }) =>
      qc.setQueryData<SquadView | null>(squadKey, (squad) =>
        squad
          ? { ...squad, members: squad.members.map((m) => (m.ref === to ? { ...m, cheeredToday: true } : m)) }
          : squad,
      ),
  });
}

interface CheerPage {
  cheers: CheerView[];
  nextCursor: string | null;
}

export function useCheerInbox(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: cheersKey,
    queryFn: ({ pageParam }) =>
      api<CheerPage>('/cheers', pageParam ? { query: { cursor: pageParam } } : {}),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page?.nextCursor ?? null,
    enabled,
  });
}

/** Mark cheers the person has now seen; the dashboard count follows. */
export function useMarkCheersSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api<void>('/cheers/seen', { method: 'POST', body: { ids } }),
    onSettled: () => void qc.invalidateQueries({ queryKey: fightRecordKey }),
  });
}

export const nudgeSettingsKey = ['fightCamp', 'nudges'] as const;

export function useNudgeSettings(enabled: boolean) {
  return useQuery({
    queryKey: nudgeSettingsKey,
    queryFn: async () => unwrap<NudgeSettings>(await api<unknown>('/cheers/nudges'), 'nudges'),
    enabled,
  });
}

export function useSetNudgeSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: NudgeSettings) =>
      unwrap<NudgeSettings>(await api<unknown>('/cheers/nudges', { method: 'PUT', body: settings }), 'nudges'),
    onSuccess: (settings) => qc.setQueryData(nudgeSettingsKey, settings),
  });
}

// ---------- Share Kit ----------

/**
 * The person's first name, for a card they choose to sign. Same cache entry
 * and raw shape as the dashboard's GET /me, so it costs no extra request.
 */
export function useFirstName(): string | null {
  const me = useQuery({ queryKey: ['me', 'user'], queryFn: () => api<unknown>('/me') }).data as
    | { displayName?: string; user?: { displayName?: string } }
    | undefined;
  const name = (me?.user?.displayName ?? me?.displayName ?? '').trim().split(/\s+/)[0];
  return name ? name : null;
}

/** The person's reusable link for a card kind this season. */
export function useShareLink(kind: ShareKindP1, enabled: boolean) {
  return useQuery({
    queryKey: ['fightCamp', 'shareLink', kind],
    queryFn: async () =>
      unwrap<ShareLinkView>(await api<unknown>('/share/links', { method: 'POST', body: { kind } }), 'shareLink'),
    enabled,
    staleTime: Infinity,
  });
}

// ---------- season recap ----------

export function useSeasonRecap(seasonNumber: number | null) {
  return useQuery({
    queryKey: ['progress', 'recap', seasonNumber],
    queryFn: async () =>
      unwrap<SeasonRecap>(await api<unknown>(`/fight-camp/recap/${seasonNumber}`), 'recap'),
    enabled: seasonNumber !== null,
    retry: false,
  });
}
