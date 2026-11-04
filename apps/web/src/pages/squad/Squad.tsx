/**
 * /squad: your squad this season (AZF-P1 Epic C).
 *
 * Up to five people who show up together. The page is built around what a
 * squad mate is allowed to see: everyone's belt, and a member's days this
 * week only if that member turned "Show my numbers" on. The board counts
 * days, one per day, never anything about bodies or food; nobody is ranked
 * last, and a member with nothing yet this week is "warming up".
 *
 * Off for the account (flag, rollout or age): sent home, like /fight-record.
 */
import { type FormEvent, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  SQUAD_CONSENT_TEXT,
  SQUAD_MAX_MEMBERS,
  seasonByNumber,
  seasonTheme,
  squadBoard,
  type SquadMemberView,
  type SquadView,
} from '@aquazerofit/shared';
import { AppHeader } from '@/components/ui/AppHeader';
import { AppBackground } from '@/components/layout/AppBackground';
import { BottomNav } from '@/components/ui/BottomNav';
import { GlassCard } from '@/components/ui/GlassCard';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { useToast } from '@/components/ui/Toast';
import { BeltBadge } from '@/components/fightRecord/BeltBadge';
import { CheerButton } from '@/components/fightCamp/Cheers';
import { ShareKitSheet } from '@/components/fightCamp/ShareKitSheet';
import { BottomSheet } from '@/pages/training/BottomSheet';
import { formatDate } from '@/lib/format';
import { beltName, useFightCamp } from '@/lib/fightRecord';
import {
  prepareSquadInvite,
  squadErrorMessage,
  squadTelegramUrl,
  useCreateSquad,
  useJoinSquad,
  useLeaveSquad,
  useRemoveMember,
  useRotateInviteCode,
  useShowMyNumbers,
  useSquad,
} from '@/lib/fightCamp';
import { canShareMessage, isTMA, openTelegramLink, shareMessage } from '@/lib/telegram';

export default function SquadPage() {
  const camp = useFightCamp();
  const available = Boolean(camp.data?.squads);
  const squad = useSquad(available);

  let body;
  if (camp.isPending || (available && squad.isPending)) {
    body = (
      <div aria-busy="true" aria-label="Squad loading" className="mt-6 space-y-4">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  } else if (camp.isError || squad.isError) {
    body = (
      <div className="mt-6">
        <ErrorState
          surface="squad"
          message="We couldn't load your squad."
          retry={() => void (camp.isError ? camp.refetch() : squad.refetch())}
        />
      </div>
    );
  } else if (!available) {
    return <Navigate to="/" replace />;
  } else {
    body = squad.data ? <Member squad={squad.data} canCheer={Boolean(camp.data?.cheers)} /> : <NoSquad />;
  }

  return (
    <>
      <AppBackground />
      <div className="azf-content relative mx-auto min-h-screen max-w-md safe-bottom">
        <div className="px-5 pb-28">
          <AppHeader title="Squad" back />
          {body}
        </div>
        <BottomNav />
      </div>
    </>
  );
}

// ---------- no squad yet ----------

function NoSquad() {
  const create = useCreateSquad();
  const join = useJoinSquad();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = (action: 'create' | 'join') => (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(action);
  };
  const agree = () => {
    const done = { onError: (e: unknown) => setError(squadErrorMessage(e, 'That did not work. Try again.')) };
    if (pending === 'create') create.mutate(name.trim(), done);
    if (pending === 'join') join.mutate({ code: code.trim(), via: 'code' }, done);
    setPending(null);
  };

  return (
    <div className="mt-4 space-y-5">
      <p className="text-sm leading-relaxed text-on-surface-variant text-pretty">
        A squad is up to {SQUAD_MAX_MEMBERS} people who show up together this season. You see each
        other&apos;s first names and belts. Daily numbers stay hidden unless each person turns them on.
      </p>

      <GlassCard className="p-5">
        <form onSubmit={ask('create')} className="space-y-3">
          <h2 className="font-heading text-lg font-semibold text-on-surface">Start a squad</h2>
          <label className="block text-sm font-semibold text-on-surface" htmlFor="squad-name">
            Squad name
          </label>
          <input
            id="squad-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={3}
            maxLength={32}
            required
            autoComplete="off"
            className="min-h-[44px] w-full rounded-xl border border-outline-variant bg-surface-container-low px-3 text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          />
          <PrimaryButton type="submit" loading={create.isPending} disabled={name.trim().length < 3}>
            Start a squad
          </PrimaryButton>
        </form>
      </GlassCard>

      <GlassCard className="p-5">
        <form onSubmit={ask('join')} className="space-y-3">
          <h2 className="font-heading text-lg font-semibold text-on-surface">Join with a code</h2>
          <label className="block text-sm font-semibold text-on-surface" htmlFor="squad-code">
            Invite code
          </label>
          <input
            id="squad-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="SQD-XXXXXXXXXX"
            required
            autoComplete="off"
            autoCapitalize="characters"
            className="min-h-[44px] w-full rounded-xl border border-outline-variant bg-surface-container-low px-3 font-mono uppercase tracking-wider text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          />
          <SecondaryButton type="submit" loading={join.isPending} disabled={code.trim().length < 14}>
            Join squad
          </SecondaryButton>
        </form>
      </GlassCard>

      {error && (
        <p role="alert" className="text-sm text-on-surface">
          {error}
        </p>
      )}

      <ConsentSheet
        open={pending !== null}
        action={pending === 'create' ? 'Agree and start' : 'Agree and join'}
        onAgree={agree}
        onClose={() => setPending(null)}
      />
    </div>
  );
}

/** The one-time consent the server also requires (PRD §8.4). */
export function ConsentSheet({
  open,
  action,
  onAgree,
  onClose,
}: {
  open: boolean;
  action: string;
  onAgree: () => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Before you join">
      <p className="text-base leading-relaxed text-on-surface text-pretty">{SQUAD_CONSENT_TEXT}</p>
      <p className="mt-2 text-sm leading-relaxed text-on-surface-variant text-pretty">
        No weight, food or photos are ever shown to your squad. You can leave whenever you like.
      </p>
      <div className="mt-5 space-y-3">
        <PrimaryButton onClick={onAgree}>{action}</PrimaryButton>
        <SecondaryButton onClick={onClose}>Not now</SecondaryButton>
      </div>
    </BottomSheet>
  );
}

// ---------- in a squad ----------

function Member({ squad, canCheer }: { squad: SquadView; canCheer: boolean }) {
  const toast = useToast();
  const [leaving, setLeaving] = useState(false);
  const shareKit = Boolean(useFightCamp().data?.shareKit);
  const [kit, setKit] = useState<'week' | 'squad_invite' | null>(null);
  const myWeek = squad.members.find((m) => m.isMe)?.weekActiveDays ?? 0;
  const full = squad.members.length >= SQUAD_MAX_MEMBERS;
  const kitCard = useMemo(
    () =>
      kit && {
        kind: kit,
        season: seasonByNumber(squad.seasonNumber),
        accent: seasonTheme(squad.seasonNumber).accent,
        belt: null,
        weekActiveDays: myWeek,
        squadName: squad.name,
      },
    [kit, squad.seasonNumber, squad.name, myWeek],
  );
  const leave = useLeaveSquad();

  const invite = async () => {
    const text = `Join my squad "${squad.name}" on AquaZeroFit.`;
    // Bot API 8.0: a prepared message sent to chats the user picks. Anything
    // less, or a refusal, falls through to the share link below.
    if (isTMA()) {
      // A prepared message the client can send is the whole answer: if the
      // person then cancels Telegram's chooser, a second share screen would
      // only be in the way. The link is for clients that cannot do it at all.
      const prepared = canShareMessage() ? await prepareSquadInvite(squad.id) : null;
      if (prepared) {
        await shareMessage(prepared);
        return;
      }
      const url = squadTelegramUrl(squad);
      openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
      return;
    }
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'AquaZeroFit squad', text, url: squad.inviteUrl });
        return;
      } catch {
        // Cancelled or refused: fall through to copying, which always works.
      }
    }
    await copyInvite();
  };
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(squad.inviteUrl);
      toast.success('Invite link copied.');
    } catch {
      toast.show(`Your invite code is ${squad.inviteCode}`);
    }
  };

  return (
    <div className="mt-4 space-y-5">
      <GlassCard className="p-5">
        <h2 className="heading-display font-heading text-2xl text-on-surface text-balance">{squad.name}</h2>
        <p className="mt-0.5 text-xs tabular-nums text-on-surface-variant">
          Season {squad.seasonNumber} · {squad.members.length} of {SQUAD_MAX_MEMBERS} members
        </p>
        {!full && (
          <div className="mt-4 space-y-3">
            <PrimaryButton onClick={() => void invite()}>Invite to squad</PrimaryButton>
            <button
              type="button"
              onClick={() => void copyInvite()}
              className="min-h-[44px] w-full rounded-lg text-sm font-semibold text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              Copy invite link · <span className="font-mono">{squad.inviteCode}</span>
            </button>
          </div>
        )}
      </GlassCard>

      {canCheer &&
        squad.members
          .filter((m) => m.welcome && !m.cheeredToday)
          .map((member) => (
            <GlassCard key={member.ref} className="flex items-center justify-between gap-3 p-4">
              <p className="min-w-0 text-sm text-on-surface text-pretty">
                <span className="font-semibold">{member.displayName}</span> just joined. Send a cheer?
              </p>
              <CheerButton member={member} />
            </GlassCard>
          ))}
      <WeekBoard squad={squad} canCheer={canCheer} />
      {shareKit && (
        <div className={full ? '' : 'grid grid-cols-2 gap-3'}>
          <SecondaryButton onClick={() => setKit('week')}>Share my week</SecondaryButton>
          {/* A full squad has no room: an invite card would only turn people away. */}
          {!full && <SecondaryButton onClick={() => setKit('squad_invite')}>Share invite card</SecondaryButton>}
        </div>
      )}
      {kitCard && (
        <ShareKitSheet
          open
          onClose={() => setKit(null)}
          accentId={seasonTheme(squad.seasonNumber).accentId}
          card={kitCard}
          link={kit === 'squad_invite' ? { url: squad.inviteUrl, tgStartParam: squad.tgStartParam } : undefined}
        />
      )}
      <ShowMyNumbers squad={squad} />
      {squad.me.role === 'owner' && <OwnerTools squad={squad} />}

      <SecondaryButton onClick={() => setLeaving(true)}>Leave squad</SecondaryButton>
      <BottomSheet open={leaving} onClose={() => setLeaving(false)} title={`Leave ${squad.name}?`}>
        <p className="text-base leading-relaxed text-on-surface text-pretty">
          Your belts stay on your Fight Record. Cheers you sent stay with your squad mates. You can
          join or start another squad this season.
        </p>
        <div className="mt-5 space-y-3">
          <PrimaryButton
            loading={leave.isPending}
            onClick={() =>
              leave.mutate(squad.id, {
                onSuccess: () => setLeaving(false),
                onError: (e) => toast.error(squadErrorMessage(e, 'Could not leave just now. Try again.')),
              })
            }
          >
            Leave squad
          </PrimaryButton>
          <SecondaryButton onClick={() => setLeaving(false)}>Stay</SecondaryButton>
        </div>
      </BottomSheet>
    </div>
  );
}

/**
 * For the person who runs the squad: retire a code that went further than
 * intended, and take out someone who should not be there.
 */
function OwnerTools({ squad }: { squad: SquadView }) {
  const toast = useToast();
  const rotate = useRotateInviteCode();
  const remove = useRemoveMember(squad.id);
  const [removing, setRemoving] = useState<SquadMemberView | null>(null);
  const others = squad.members.filter((m) => !m.isMe);
  return (
    <GlassCard className="p-5">
      <h2 className="font-heading text-lg font-semibold text-on-surface">You run this squad</h2>
      <p className="mt-1 text-sm leading-relaxed text-on-surface-variant text-pretty">
        A new code stops every invite link you have shared. People already in the squad stay.
      </p>
      <SecondaryButton
        className="mt-3"
        loading={rotate.isPending}
        onClick={() =>
          rotate.mutate(squad.id, {
            onSuccess: () => toast.success('New invite code ready. Old links no longer work.'),
            onError: (e) => toast.error(squadErrorMessage(e, 'Could not change the code. Try again.')),
          })
        }
      >
        New invite code
      </SecondaryButton>
      {others.length > 0 && (
        <ul className="mt-4 space-y-1" aria-label="Members you can remove">
          {others.map((member) => (
            <li key={member.ref} className="flex min-h-[44px] items-center justify-between gap-3">
              <span className="truncate text-sm text-on-surface">{member.displayName}</span>
              <button
                type="button"
                onClick={() => setRemoving(member)}
                aria-label={`Remove ${member.displayName} from the squad`}
                className="min-h-[44px] rounded-lg px-2 text-sm font-semibold text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <BottomSheet
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.displayName ?? 'member'}?`}
      >
        <p className="text-base leading-relaxed text-on-surface text-pretty">
          They leave the squad straight away and can join another one. Consider a new invite code
          too, so the link they had stops working.
        </p>
        <div className="mt-5 space-y-3">
          <PrimaryButton
            loading={remove.isPending}
            onClick={() =>
              removing &&
              remove.mutate(removing.ref, {
                onSuccess: () => setRemoving(null),
                onError: (e) => toast.error(squadErrorMessage(e, 'Could not remove them. Try again.')),
              })
            }
          >
            Remove from squad
          </PrimaryButton>
          <SecondaryButton onClick={() => setRemoving(null)}>Keep them</SecondaryButton>
        </div>
      </BottomSheet>
    </GlassCard>
  );
}

function MemberRow({ member, rank, canCheer }: { member: SquadMemberView; rank: number | null; canCheer: boolean }) {
  return (
    <li className="flex min-h-[44px] items-center gap-3">
      <span className="w-6 text-center text-sm font-semibold tabular-nums text-on-surface-variant">
        {rank ?? ''}
      </span>
      <BeltBadge tier={member.beltTier} size="sm" decorative />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-on-surface">
          {member.displayName}
          {member.isMe && <span className="font-normal text-on-surface-variant"> (you)</span>}
        </p>
        <p className="text-xs text-on-surface-variant">
          {member.beltTier ? beltName(member.beltTier) : 'No belt yet'}
          {member.role === 'owner' ? ' · Started the squad' : ''}
        </p>
      </div>
      <span className="shrink-0 text-sm tabular-nums text-on-surface">
        {member.weekActiveDays === null ? 'Hidden' : `${member.weekActiveDays} of 7`}
      </span>
      {canCheer && !member.isMe && <CheerButton member={member} />}
    </li>
  );
}

function WeekBoard({ squad, canCheer }: { squad: SquadView; canCheer: boolean }) {
  const { ranked, warmingUp, hidden } = squadBoard(squad.members);
  return (
    <GlassCard className="p-5">
      <h2 className="font-heading text-lg font-semibold text-on-surface">This week</h2>
      <p className="mt-0.5 text-xs text-on-surface-variant">
        Days shown up since {formatDate(squad.weekStart)}. One point a day, whatever you log.
      </p>
      {ranked.length > 0 && (
        <ol className="mt-3 space-y-2" aria-label="Showed up this week">
          {ranked.map(({ member, rank }) => (
            <MemberRow key={member.ref} member={member} rank={rank} canCheer={canCheer} />
          ))}
        </ol>
      )}
      {warmingUp.length > 0 && (
        <>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            Warming up
          </h3>
          <ul className="mt-2 space-y-2">
            {warmingUp.map((member) => (
              <MemberRow key={member.ref} member={member} rank={null} canCheer={canCheer} />
            ))}
          </ul>
        </>
      )}
      {hidden.length > 0 && (
        <>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            Numbers hidden
          </h3>
          <ul className="mt-2 space-y-2">
            {hidden.map((member) => (
              <MemberRow key={member.ref} member={member} rank={null} canCheer={canCheer} />
            ))}
          </ul>
        </>
      )}
    </GlassCard>
  );
}

function ShowMyNumbers({ squad }: { squad: SquadView }) {
  const toast = useToast();
  const setShow = useShowMyNumbers(squad.id);
  const on = squad.me.showStats;
  return (
    <GlassCard className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="show-numbers-label" className="font-heading text-lg font-semibold text-on-surface">
            Show my numbers
          </h2>
          <p id="show-numbers-help" className="mt-1 text-sm leading-relaxed text-on-surface-variant text-pretty">
            Your squad sees how many days you showed up this week. Nothing else, ever.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="show-numbers-label"
          aria-describedby="show-numbers-help"
          disabled={setShow.isPending}
          onClick={() =>
            setShow.mutate(!on, { onError: () => toast.error('Could not change that. Try again.') })
          }
          className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors motion-reduce:transition-none before:absolute before:-inset-2 before:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60 ${
            on ? 'bg-primary' : 'bg-outline-variant'
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-1 h-5 w-5 rounded-full bg-surface transition-transform motion-reduce:transition-none ${
              on ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </GlassCard>
  );
}
