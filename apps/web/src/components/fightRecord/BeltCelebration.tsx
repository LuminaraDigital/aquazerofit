/**
 * The once-per-belt celebration (AZF-W3-05 US-05).
 *
 * Shown when the read model carries a belt nobody has been shown yet, in the
 * active coach's own `achievement` line, so the moment sounds like the coach
 * and costs nothing: it is a lookup, like every coach reaction.
 *
 * Closing it in any way acknowledges it, on every device. Sharing closes it
 * first and keeps the belt in local state for the share sheet, because the
 * acknowledgement clears `celebrate` from the cache and the sheet must not
 * lose what it is sharing. Nothing happens without a tap: no auto-share, no
 * auto-status, and the status button exists only for an adult whose Telegram
 * client and account can actually show it.
 *
 * Both sheets render into document.body. The dashboard's `reveal` entrance
 * animation leaves a transform on its section (fill-mode forwards), and a
 * transformed ancestor becomes the containing block for `position: fixed`, so
 * a sheet rendered in place would sit inside the card, under the bottom nav
 * and the capture button, instead of over the screen.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { COACHES, renderReaction, type BeltAwardView, type FightRecordStatus } from '@aquazerofit/shared';
import { BottomSheet } from '@/pages/training/BottomSheet';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { ShareMoment } from '@/components/share/ShareMoment';
import { useToast } from '@/components/ui/Toast';
import { useMe, useProgression } from '@/lib/queries';
import {
  beltName,
  beltSharePayload,
  beltStoryCaption,
  storyMediaUrl,
  useAckBelt,
  useSetEmojiStatus,
} from '@/lib/fightRecord';
import { canManageEmojiStatus, haptic, requestEmojiStatusAccess } from '@/lib/telegram';
import { BeltBadge } from './BeltBadge';

/** Share sheet for one belt, with a story option for adults. */
export function BeltShareSheet({
  award,
  adult,
  onClose,
}: {
  award: BeltAwardView | null;
  adult: boolean;
  onClose: () => void;
}) {
  const me = useMe();
  return createPortal(
    <ShareMoment
      open={award !== null}
      onClose={onClose}
      payload={award ? beltSharePayload(award) : null}
      userId={me.data?.id ?? null}
      invitePath="/welcome"
      story={
        award && adult
          ? { mediaUrl: storyMediaUrl(award.tier), caption: beltStoryCaption(award) }
          : null
      }
    />,
    document.body,
  );
}

export function BeltCelebration({ record }: { record: FightRecordStatus }) {
  const toast = useToast();
  const ack = useAckBelt();
  const setEmojiStatus = useSetEmojiStatus();
  const progression = useProgression();
  const award = record.celebrate;
  const [closedId, setClosedId] = useState<string | null>(null);
  const [sharing, setSharing] = useState<BeltAwardView | null>(null);

  const open = award !== null && closedId !== award.id;
  // The active coach saying the belt's name; a plain line until the roster loads.
  const coach = COACHES.find((c) => c.id === progression.data?.activeCoachId);
  const line = award
    ? coach
      ? renderReaction(coach.reactions.achievement, { name: beltName(award.tier) })
      : `${beltName(award.tier)}, earned.`
    : '';
  const offerStatus =
    record.adult &&
    record.emojiStatus.available &&
    !record.emojiStatus.enabled &&
    canManageEmojiStatus();

  const close = () => {
    if (!award) return;
    setClosedId(award.id);
    ack.mutate(award.id);
  };

  const share = () => {
    if (!award) return;
    close();
    setSharing(award);
  };

  const showOnProfile = async () => {
    if (!(await requestEmojiStatusAccess())) return;
    setEmojiStatus.mutate(true, {
      onSuccess: () => {
        haptic('success');
        toast.success('Your belt is on your Telegram profile until the season ends');
        close();
      },
      onError: () => toast.error('Telegram did not accept the status. Try again from Fight Record.'),
    });
  };

  return createPortal(
    <>
      <BottomSheet open={open} onClose={close} title="New belt">
        {award && (
          <div className="space-y-5 pb-2 text-center">
            <BeltBadge tier={award.tier} size="lg" className="mx-auto" decorative />
            <div>
              <p className="font-heading text-3xl font-semibold text-on-surface text-balance">
                {beltName(award.tier)}
              </p>
              <p className="mt-1 text-sm text-on-surface-variant">
                Season {award.seasonNumber} · {award.seasonName}
              </p>
            </div>
            <p className="text-base text-on-surface text-pretty">{line}</p>
            <div className="grid gap-2">
              <PrimaryButton onClick={share}>Share</PrimaryButton>
              {offerStatus && (
                <SecondaryButton
                  onClick={() => void showOnProfile()}
                  loading={setEmojiStatus.isPending}
                >
                  Show on my Telegram profile
                </SecondaryButton>
              )}
              <button
                type="button"
                onClick={close}
                className="py-2 text-sm text-on-surface-variant underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                Not now
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
      <BeltShareSheet award={sharing} adult={record.adult} onClose={() => setSharing(null)} />
    </>,
    document.body,
  );
}
