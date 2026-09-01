/**
 * Buddy huddles: private accountability challenges (growth P0).
 * Not a public social feed - invite-only codes shared with friends.
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BuddyChallenge, BuddyChallengeKind } from '@aquazerofit/shared';
import { BUDDY_CHALLENGE_MAX_MEMBERS } from '@aquazerofit/shared';
import { api, ApiError } from '@/lib/api';
import { useMe } from '@/lib/queries';
import { AppHeader } from '@/components/ui/AppHeader';
import { GlassCard } from '@/components/ui/GlassCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { AquaMascot } from '@/components/brand/AquaMascot';
import { ShareMoment } from '@/components/share/ShareMoment';
import type { ShareCardPayload } from '@/lib/shareCard';
import { buildShareUrl, inviteRefFromUserId } from '@/lib/attribution';
import { ANDROID_PLAY_STORE_URL, isAndroidMobileBrowser, joinChallengeUrl } from '@/lib/challenges';
import { trackGrowth } from '@/lib/growth';
import { BottomNav } from '@/components/ui/BottomNav';
import { AppBackground } from '@/components/layout/AppBackground';

/**
 * Display labels for the buddy-challenge kinds. `logging_streak` is the wire
 * enum, but nothing user-facing says "streak": a huddle counts show-up days,
 * which only ever accumulate.
 */
const KIND_LABELS: Record<BuddyChallengeKind, string> = {
  logging_streak: 'Show-up days',
  workouts: 'Workout days',
  meal_logs: 'Meal logging days',
};

export default function Challenges() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const me = useMe();
  const [params] = useSearchParams();
  const [kind, setKind] = useState<BuddyChallengeKind>('logging_streak');
  const [joinCode, setJoinCode] = useState(() =>
    (params.get('challenge') ?? params.get('code') ?? '').toUpperCase(),
  );
  const [share, setShare] = useState<ShareCardPayload | null>(null);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const listQuery = useQuery({
    queryKey: ['challenges'],
    queryFn: async () => {
      const data = await api<{ challenges: BuddyChallenge[] }>('/challenges');
      return data.challenges;
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api<{ challenge: BuddyChallenge }>('/challenges', {
        method: 'POST',
        body: { kind, targetDays: 7, durationDays: 14 },
      }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['challenges'] });
      void trackGrowth('challenge_created', { kind, code: data.challenge.code });
      toast.success(`Huddle ${data.challenge.code} ready`);
      openShare(data.challenge);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not create huddle'),
  });

  const joinMutation = useMutation({
    mutationFn: (code: string) =>
      api<{ challenge: BuddyChallenge }>('/challenges/join', {
        method: 'POST',
        body: { code },
      }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['challenges'] });
      void trackGrowth('challenge_joined', { code: data.challenge.code });
      toast.success('Joined the huddle');
      setJoinCode('');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not join'),
  });

  const openShare = (challenge: BuddyChallenge) => {
    setShareCode(challenge.code);
    setShare({
      kind: 'challenge',
      headline: KIND_LABELS[challenge.kind],
      subline: `${challenge.targetDays}-day target · code ${challenge.code}`,
      stats: [
        { label: 'Days', value: String(challenge.targetDays) },
        { label: 'Members', value: `${challenge.members.length}/${BUDDY_CHALLENGE_MAX_MEMBERS}` },
        { label: 'Ends', value: challenge.endsAt.slice(5) },
      ],
      catchphrase: 'Show up together.',
    });
    setShareOpen(true);
    void trackGrowth('challenge_shared', { code: challenge.code });
  };

  const challenges = listQuery.data ?? [];
  const showAndroidAppBanner = isAndroidMobileBrowser();
  const deepLinkCode = joinCode.trim().length >= 4 ? joinCode.trim() : null;
  const invitePreview = useMemo(() => {
    if (!me.data) return null;
    return buildShareUrl('/welcome', {
      ref: inviteRefFromUserId(me.data.id),
      utm_source: 'app',
      utm_medium: 'challenges',
    });
  }, [me.data]);

  return (
    <>
      <AppBackground />
      <div className="azf-content relative mx-auto min-h-screen max-w-md safe-bottom">
        <div className="px-5 pb-28">
          <AppHeader title="Buddy huddles" back />

          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <AquaMascot size="md" decorative />
            <p className="text-sm leading-relaxed text-on-surface-variant">
              Private accountability with friends. No public feed. Invite a buddy with a code and
              keep each other honest for two weeks.
            </p>
          </div>

          {showAndroidAppBanner && (
            <GlassCard className="mt-4 space-y-3 p-4">
              <h2 className="font-heading text-base text-on-surface">Get the Android app</h2>
              <p className="text-sm leading-relaxed text-on-surface-variant">
                Open huddle invites in AquaZeroFit with App Links. Install from Google Play for
                guided workouts, meal trust, and the full daily energy loop.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <PrimaryButton
                  className="!w-full sm:!w-auto"
                  onClick={() => {
                    window.location.href = ANDROID_PLAY_STORE_URL;
                  }}
                >
                  Install on Google Play
                </PrimaryButton>
                {deepLinkCode && (
                  <SecondaryButton
                    className="!w-full sm:!w-auto"
                    onClick={() => {
                      window.location.href = joinChallengeUrl(deepLinkCode);
                    }}
                  >
                    Open invite link
                  </SecondaryButton>
                )}
              </div>
            </GlassCard>
          )}

          <GlassCard className="mt-5 space-y-4 p-4">
            <h2 className="font-heading text-lg text-on-surface">Start a huddle</h2>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(KIND_LABELS) as BuddyChallengeKind[]).map((k) => (
                <Chip
                  key={k}
                  label={KIND_LABELS[k]}
                  tone="aqua"
                  active={kind === k}
                  onClick={() => setKind(k)}
                />
              ))}
            </div>
            <PrimaryButton
              loading={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              Create 14-day huddle
            </PrimaryButton>
          </GlassCard>

          <GlassCard className="mt-4 space-y-3 p-4">
            <h2 className="font-heading text-lg text-on-surface">Join with a code</h2>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="AQUA-XXXXXX"
              className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-high/50 px-4 py-3 font-mono text-sm tracking-wider text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              aria-label="Challenge code"
            />
            <SecondaryButton
              loading={joinMutation.isPending}
              disabled={joinCode.trim().length < 4}
              onClick={() => joinMutation.mutate(joinCode.trim())}
            >
              Join huddle
            </SecondaryButton>
          </GlassCard>

          <section className="mt-6 space-y-3">
            <h2 className="font-heading text-lg text-on-surface">Your huddles</h2>
            {listQuery.isPending ? (
              <>
                <Skeleton className="h-28 w-full rounded-2xl" />
                <Skeleton className="h-28 w-full rounded-2xl" />
              </>
            ) : listQuery.isError ? (
              <ErrorState
                message="Could not load huddles."
                retry={() => void listQuery.refetch()}
              />
            ) : challenges.length === 0 ? (
              <EmptyState
                icon="groups"
                title="No huddles yet"
                body="Create one and invite a friend from Telegram or anywhere."
              />
            ) : (
              challenges.map((c) => (
                <GlassCard key={c.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                        {KIND_LABELS[c.kind]} · {c.status}
                      </p>
                      <p className="mt-1 font-mono text-lg text-on-surface">{c.code}</p>
                    </div>
                    <SecondaryButton className="!min-h-[40px] !w-auto !px-3 !text-xs" onClick={() => openShare(c)}>
                      Invite
                    </SecondaryButton>
                  </div>
                  <p className="text-xs text-on-surface-variant">
                    Target {c.targetDays} days · ends {c.endsAt}
                  </p>
                  <ul className="space-y-2">
                    {c.members.map((m) => (
                      <li
                        key={m.userId}
                        className="flex items-center justify-between text-sm text-on-surface"
                      >
                        <span>{m.displayName}</span>
                        <span className="tabular-nums text-primary">
                          {m.progressDays}/{c.targetDays}
                        </span>
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              ))
            )}
          </section>

          {invitePreview && (
            <p className="mt-6 text-center text-xs text-on-surface-variant">
              Personal invite base:{' '}
              <Link to="/welcome" className="text-primary underline-offset-2 hover:underline">
                welcome link
              </Link>
            </p>
          )}
        </div>
        <BottomNav />
      </div>

      <ShareMoment
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        payload={share}
        userId={me.data?.id ?? null}
        challengeCode={shareCode}
        invitePath="/welcome"
      />
    </>
  );
}
