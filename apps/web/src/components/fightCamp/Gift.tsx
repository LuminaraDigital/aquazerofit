/**
 * Gift a Round (AZF-P1 Epic G, US-G1): buy a squad mate a week of Premium
 * with Telegram Stars, inside the Mini App only.
 *
 * Shown only where it can work: gifting on, a price set, an adult account
 * linked to Telegram (the `gifting` part of the Fight Camp block), and a
 * client that can open a Stars invoice. Everything else is hidden, not
 * disabled (PRD §6.1). The price is fixed and stated before anything is
 * paid; the server checks every rule again and Telegram asks once more.
 */
import { useState } from 'react';
import { GIFT_PREMIUM_DAYS, type SquadMemberView } from '@aquazerofit/shared';
import { GlassCard } from '@/components/ui/GlassCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { BottomSheet } from '@/pages/training/BottomSheet';
import { squadErrorMessage, useGiftInvoice } from '@/lib/fightCamp';
import { useFightCamp } from '@/lib/fightRecord';
import { canPayWithStars, openStarsInvoice } from '@/lib/telegram';

/** The fixed price, when this person can gift from this client; null otherwise. */
export function useGiftPrice(): number | null {
  const gifting = useFightCamp().data?.gifting;
  return gifting && canPayWithStars() ? gifting.stars : null;
}

export function GiftButton({ member, stars }: { member: SquadMemberView; stars: number }) {
  const toast = useToast();
  const buy = useGiftInvoice();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gift = () => {
    setError(null);
    buy.mutate(member.ref, {
      onSuccess: async ({ invoiceLink }) => {
        const status = await openStarsInvoice(invoiceLink);
        if (status === 'paid') {
          setOpen(false);
          toast.success(`Gift sent. ${member.displayName} has a week of Premium.`);
        } else if (status === 'failed') {
          setError('The payment did not go through. Nothing was charged.');
        }
      },
      onError: (e) => setError(squadErrorMessage(e, 'Could not start the gift. Try again.')),
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Gift ${member.displayName} a week of Premium`}
        className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-on-surface-variant focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
          redeem
        </span>
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Gift a round">
        <p className="text-sm leading-relaxed text-on-surface text-pretty">
          Give {member.displayName} a week of Premium.
        </p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-on-surface-variant">What they get</dt>
            <dd className="text-right text-on-surface">{GIFT_PREMIUM_DAYS} days of Premium, from when you pay</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-on-surface-variant">Price</dt>
            <dd className="tabular-nums text-on-surface">{stars} Stars</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-on-surface-variant text-pretty">
          Paid in Telegram Stars. For a refund, message the AquaZeroFit bot with /paysupport.{' '}
          <a href="/terms#gifts" className="font-semibold text-primary underline-offset-4 hover:underline">
            Gift terms
          </a>
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-on-surface">
            {error}
          </p>
        )}
        <PrimaryButton className="mt-5" loading={buy.isPending} onClick={gift}>
          Gift for {stars} Stars
        </PrimaryButton>
      </BottomSheet>
    </>
  );
}

/** "<Name> gifted you a week of Premium" (US-G1 AC5), for the week it lasts. */
export function GiftReceived() {
  const received = useFightCamp().data?.gifting?.received;
  if (!received) return null;
  return (
    <GlassCard className="flex items-center gap-3 p-4">
      <span className="material-symbols-outlined text-[22px] text-on-surface-variant" aria-hidden="true">
        redeem
      </span>
      <p className="text-sm text-on-surface text-pretty">
        <span className="font-semibold">{received.fromName}</span> gifted you a week of Premium.
      </p>
    </GlassCard>
  );
}
