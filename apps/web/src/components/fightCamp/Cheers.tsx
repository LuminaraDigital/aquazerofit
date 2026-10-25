/**
 * Cheers (AZF-P1 Epic D): one tap of support, and the inbox they land in.
 *
 * `CheerButton` opens five fixed cheers for one squad mate; there is no text
 * to type, so nothing to moderate. Once sent, it says "Sent today" until the
 * sender's next day. `CheersInbox` lists what arrived, newest first, and
 * marks what it showed as seen. A coach's cheer always carries an
 * "Automated" badge: it must never pass for a person (PRD §8.3).
 */
import { useEffect, useRef, useState } from 'react';
import { CHEER_EMOJI, CHEER_KINDS, type CheerView, type SquadMemberView } from '@aquazerofit/shared';
import { GlassCard } from '@/components/ui/GlassCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/Toast';
import { BottomSheet } from '@/pages/training/BottomSheet';
import { squadErrorMessage, useCheerInbox, useMarkCheersSeen, useSendCheer } from '@/lib/fightCamp';

export function CheerButton({ member }: { member: SquadMemberView }) {
  const toast = useToast();
  const send = useSendCheer();
  const [open, setOpen] = useState(false);

  if (member.cheeredToday) {
    return <span className="shrink-0 text-xs font-semibold text-on-surface-variant">Sent today</span>;
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Cheer ${member.displayName}`}
        className="min-h-[44px] min-w-[44px] shrink-0 rounded-full text-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        <span aria-hidden="true">{CHEER_EMOJI.glove}</span>
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={`Cheer ${member.displayName}`}>
        <p className="text-sm text-on-surface-variant">One a day. They see it in their Fight Record.</p>
        <div className="mt-4 grid grid-cols-5 gap-2">
          {CHEER_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              disabled={send.isPending}
              aria-label={`Send ${kind} cheer to ${member.displayName}`}
              onClick={() =>
                send.mutate(
                  { to: member.ref, cheer: kind },
                  {
                    onSuccess: () => {
                      setOpen(false);
                      toast.success(`Cheer sent to ${member.displayName}.`);
                    },
                    onError: (e) => toast.error(squadErrorMessage(e, 'Could not send that. Try again.')),
                  },
                )
              }
              className="flex min-h-[56px] items-center justify-center rounded-2xl bg-surface-container-low text-3xl transition-transform active:scale-[0.97] motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
            >
              <span aria-hidden="true">{CHEER_EMOJI[kind]}</span>
            </button>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}

function senderLabel(from: CheerView['from']): string {
  return from.kind === 'coach' ? `Coach ${from.coachName}` : from.displayName;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

export function CheersInbox() {
  const inbox = useCheerInbox(true);
  const markSeen = useMarkCheersSeen();
  const marked = useRef(new Set<string>());
  const cheers = inbox.data?.pages.flatMap((page) => page?.cheers ?? []) ?? [];

  // Seen once shown. Each id is sent once per mount, at most 50 at a time.
  useEffect(() => {
    const unseen = cheers.filter((c) => !c.seen && !marked.current.has(c.id)).map((c) => c.id).slice(0, 50);
    if (unseen.length === 0) return;
    unseen.forEach((id) => marked.current.add(id));
    markSeen.mutate(unseen);
  }, [cheers, markSeen]);

  return (
    <section id="cheers" aria-labelledby="cheers-heading">
      <GlassCard className="p-5">
        <h2 id="cheers-heading" className="font-heading text-lg font-semibold text-on-surface">Cheers</h2>
        {inbox.isPending ? (
          <div aria-busy="true" aria-label="Cheers loading" className="mt-3 space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : inbox.isError ? (
          <div className="mt-3">
            <ErrorState surface="cheers" message="We couldn't load your cheers." retry={() => void inbox.refetch()} />
          </div>
        ) : cheers.length === 0 ? (
          <p className="mt-2 text-sm text-on-surface-variant">Cheers from your squad show up here.</p>
        ) : (
          <>
            <ul className="mt-3 space-y-3">
              {cheers.map((c) => (
                <li key={c.id} className="flex items-center gap-3">
                  <span className="text-2xl" aria-hidden="true">
                    {CHEER_EMOJI[c.cheer]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-on-surface">
                      <span className="font-semibold">{senderLabel(c.from)}</span> sent a {c.cheer} cheer
                      {c.from.kind === 'coach' && (
                        <span className="ml-2 inline-flex rounded-full bg-surface-container-high px-2 py-0.5 text-xs font-semibold text-on-surface-variant">
                          Automated
                        </span>
                      )}
                    </p>
                    <p className="text-xs tabular-nums text-on-surface-variant">{when(c.createdAt)}</p>
                  </div>
                  {!c.seen && <span className="sr-only">New</span>}
                </li>
              ))}
            </ul>
            {inbox.hasNextPage && (
              <button
                type="button"
                onClick={() => void inbox.fetchNextPage()}
                disabled={inbox.isFetchingNextPage}
                className="mt-3 min-h-[44px] text-sm font-semibold text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                Show earlier cheers
              </button>
            )}
          </>
        )}
      </GlassCard>
    </section>
  );
}
