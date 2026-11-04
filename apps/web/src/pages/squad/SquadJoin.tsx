/**
 * /s/:code: the squad invite landing (AZF-P1 US-C2).
 *
 * Public on purpose: someone tapping a friend's link should see what they
 * are being invited to before being asked to sign in. The preview names the
 * squad, its size and the season, and nobody in it. After sign-in the
 * visitor comes back here, agrees to what the squad will see, and joins.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SQUAD_CONSENT_TEXT, SQUAD_MAX_MEMBERS, squadCodeSchema } from '@aquazerofit/shared';
import { AppBackground } from '@/components/layout/AppBackground';
import { GlassCard } from '@/components/ui/GlassCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { ApiError, restoreSession, tokenStore } from '@/lib/api';
import { peekSquad, useJoinSquad } from '@/lib/fightCamp';
import { squadErrorMessage } from './Squad';

/** null until the cookie-backed session restore has answered. */
function useSignedIn(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(tokenStore.isAuthenticated ? true : null);
  useEffect(() => {
    if (signedIn !== null) return;
    let alive = true;
    void restoreSession().finally(() => {
      if (alive) setSignedIn(tokenStore.isAuthenticated);
    });
    return () => {
      alive = false;
    };
  }, [signedIn]);
  return signedIn;
}

export default function SquadJoinPage() {
  const { code: raw = '' } = useParams();
  const parsed = squadCodeSchema.safeParse(raw);
  const code = parsed.success ? parsed.data : null;
  const peek = useQuery({
    queryKey: ['squadPeek', code],
    queryFn: () => peekSquad(code!),
    enabled: code !== null,
    retry: false,
  });

  let body;
  if (code === null || (peek.isSuccess && peek.data === null)) {
    body = (
      <Notice title="This invite has no squad behind it">
        The code may be mistyped, or the squad may have closed. Ask whoever sent it for a fresh link.
      </Notice>
    );
  } else if (peek.isPending) {
    body = (
      <div aria-busy="true" aria-label="Invite loading">
        <Skeleton className="h-48 w-full" />
      </div>
    );
  } else if (peek.isError) {
    body = (
      <ErrorState surface="squad-invite" message="We couldn't load this invite." retry={() => void peek.refetch()} />
    );
  } else {
    const squad = peek.data!;
    body = (
      <GlassCard className="p-6">
        <p className="text-sm text-on-surface-variant">You&apos;re invited to a Fight Camp squad</p>
        <h1 className="heading-display mt-1 font-heading text-3xl text-on-surface text-balance">{squad.name}</h1>
        <p className="mt-1 text-sm tabular-nums text-on-surface-variant">
          {squad.memberCount} of {SQUAD_MAX_MEMBERS} members · {squad.seasonName}
        </p>
        {squad.full ? (
          <p className="mt-4 text-base text-on-surface">This squad is full. Squads have room for five.</p>
        ) : (
          <JoinAction code={code} />
        )}
      </GlassCard>
    );
  }

  return (
    <>
      <AppBackground />
      <main className="azf-content relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
        {body}
        <Link
          to="/"
          className="mt-6 inline-flex min-h-[44px] items-center justify-center text-sm font-semibold text-primary"
        >
          Go to AquaZeroFit
        </Link>
      </main>
    </>
  );
}

function JoinAction({ code }: { code: string }) {
  const navigate = useNavigate();
  const signedIn = useSignedIn();
  const join = useJoinSquad();
  const [error, setError] = useState<{ message: string; alreadyIn: boolean } | null>(null);

  if (signedIn === null) return <Skeleton className="mt-5 h-[52px] w-full" />;

  if (!signedIn) {
    return (
      <PrimaryButton
        className="mt-5"
        onClick={() => navigate('/sign-in', { state: { from: `/s/${code}` } })}
      >
        Sign in to join
      </PrimaryButton>
    );
  }

  return (
    <div className="mt-5 space-y-3">
      <p className="text-sm leading-relaxed text-on-surface text-pretty">{SQUAD_CONSENT_TEXT}</p>
      <PrimaryButton
        loading={join.isPending}
        onClick={() =>
          join.mutate(
            { code, via: 'link' },
            {
              onSuccess: () => navigate('/squad', { replace: true }),
              onError: (e) =>
                setError({
                  message: squadErrorMessage(e, 'That did not work. Try again.'),
                  alreadyIn:
                    e instanceof ApiError &&
                    (e.body?.details as { reason?: string } | undefined)?.reason === 'squad_already_member',
                }),
            },
          )
        }
      >
        Agree and join
      </PrimaryButton>
      {error && (
        <p role="alert" className="text-sm text-on-surface">
          {error.message}{' '}
          {error.alreadyIn && (
            <Link to="/squad" className="font-semibold text-primary underline-offset-4 hover:underline">
              Go to my squad
            </Link>
          )}
        </p>
      )}
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <GlassCard className="p-6">
      <h1 className="heading-display font-heading text-2xl text-on-surface text-balance">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-on-surface-variant text-pretty">{children}</p>
    </GlassCard>
  );
}
