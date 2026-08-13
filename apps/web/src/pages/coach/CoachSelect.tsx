/**
 * Character select.
 *
 * Locked coaches are shown, not hidden. A ladder you cannot see is a ladder
 * nobody climbs, and the requirement under a locked portrait ("Reach level 5")
 * is the only place the progression system explains what it is for.
 *
 * Every locked coach carries two doors and the earned one is always listed
 * first. That ordering is a product commitment, not a layout accident: the
 * Stars price is a shortcut past a door that is already open to everyone, and
 * a screen that leads with the price teaches the opposite.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bondLevelForXp, type CoachEntitlement } from '@aquazerofit/shared';
import { AppHeader } from '@/components/ui/AppHeader';
import { BottomNav } from '@/components/ui/BottomNav';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlassCard } from '@/components/ui/GlassCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { LevelBar } from '@/components/progress/LevelBar';
import { CoachPortrait } from '@/components/coach/CoachAvatar';
import { useToast } from '@/components/ui/Toast';
import {
  useCoachRoster,
  usePurchaseCoach,
  useSelectCoach,
  type CoachCardData,
} from '@/lib/queries';
import { canPayWithStars, haptic, openStarsInvoice } from '@/lib/telegram';

export default function CoachSelect() {
  const navigate = useNavigate();
  const toast = useToast();
  const roster = useCoachRoster();
  const select = useSelectCoach();
  const purchase = usePurchaseCoach();
  const [busyCoachId, setBusyCoachId] = useState<string | null>(null);

  const entitlementOf = (coachId: string): CoachEntitlement | undefined =>
    roster.data?.entitlements.find((e) => e.coachId === coachId);

  async function onSelect(coach: CoachCardData) {
    if (coach.id === roster.data?.activeCoachId) {
      navigate('/coach');
      return;
    }
    setBusyCoachId(coach.id);
    try {
      await select.mutateAsync(coach.id);
      haptic('success');
      toast.show(`${coach.name} is in your corner.`);
      navigate('/coach');
    } catch {
      toast.show('Could not switch coach. Please try again.');
    } finally {
      setBusyCoachId(null);
    }
  }

  async function onPurchase(coach: CoachCardData) {
    if (!canPayWithStars()) {
      toast.show('Open AquaZeroFit in Telegram to unlock with Stars.');
      return;
    }
    setBusyCoachId(coach.id);
    try {
      const { invoiceLink } = await purchase.mutateAsync(coach.id);
      const status = await openStarsInvoice(invoiceLink);
      if (status === 'paid') {
        haptic('success');
        toast.show(`${coach.name} unlocked. Welcome to the corner.`);
        // Telegram confirms to the client before our webhook has necessarily
        // landed, so the entitlement may still be a moment away. Refetching is
        // what closes that gap; the roster is the source of truth, not the
        // client's optimism about a payment it did not process.
        await roster.refetch();
      } else if (status === 'pending') {
        toast.show('Payment is still processing — your coach will appear shortly.');
      } else if (status === 'failed') {
        toast.show('That purchase could not be completed.');
      }
    } catch {
      toast.show('Could not start the purchase. Please try again.');
    } finally {
      setBusyCoachId(null);
    }
  }

  return (
    <div className="pb-24">
      <AppHeader />

      <main className="px-container-margin">
        <section className="mt-5 mb-5">
          <h1 className="font-heading font-semibold tracking-tight text-3xl text-on-surface leading-tight">
            Your corner
          </h1>
          <p className="text-sm text-on-surface-variant/80 mt-1.5 leading-relaxed">
            Every coach gives the same safe, measured advice. What changes is who is saying it.
          </p>
        </section>

        {roster.isPending && (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-64 w-full rounded-2xl" />
            ))}
          </div>
        )}

        {roster.isError && (
          <ErrorState
            message="We couldn't load the coach roster."
            retry={() => void roster.refetch()}
          />
        )}

        {roster.data && (
          <>
            <GlassCard className="p-card-padding mb-5">
              <LevelBar experience={roster.data.experience} />
              <p className="text-xs text-on-surface-variant/70 mt-2.5 leading-relaxed">
                You earn XP for logging, training, hydrating and resting — never for eating less.
              </p>
            </GlassCard>

            <div className="grid grid-cols-2 gap-3">
              {roster.data.roster.map((coach) => {
                const entitlement = entitlementOf(coach.id);
                const active = coach.id === roster.data.activeCoachId;
                const unlocked = entitlement?.unlocked ?? false;
                const busy = busyCoachId === coach.id;

                return (
                  <article
                    key={coach.id}
                    className={`relative rounded-2xl overflow-hidden border transition-colors ${
                      active ? 'border-primary' : 'border-outline/50'
                    }`}
                    style={active ? { borderColor: coach.colour } : undefined}
                  >
                    <div
                      className="relative h-40 flex items-end justify-center"
                      style={{
                        background: `linear-gradient(180deg, ${coach.colour}22 0%, transparent 100%)`,
                      }}
                    >
                      <CoachPortrait
                        art={coach.art}
                        name={coach.name}
                        colour={coach.colour}
                        className={`h-40 w-full ${unlocked ? '' : 'grayscale opacity-45'}`}
                      />
                      {active && (
                        <span
                          className="absolute top-2 left-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium"
                          style={{ backgroundColor: coach.colour, color: '#04121a' }}
                        >
                          In your corner
                        </span>
                      )}
                      {!unlocked && (
                        <span
                          className="absolute top-2 right-2 material-symbols-outlined text-[16px] text-on-surface-variant/80"
                          aria-hidden="true"
                        >
                          lock
                        </span>
                      )}
                    </div>

                    <div className="p-3">
                      <h2 className="font-heading font-semibold text-sm text-on-surface leading-tight">
                        {coach.name}
                      </h2>
                      <p className="text-[11px] uppercase tracking-wider mt-0.5" style={{ color: coach.colour }}>
                        {coach.ringName} · {coach.voiceWord}
                      </p>
                      <p className="text-xs text-on-surface-variant/75 mt-1.5 leading-snug line-clamp-2">
                        {coach.domain}
                      </p>

                      {unlocked && entitlement && entitlement.bondXp > 0 && (
                        <p className="text-[11px] text-on-surface-variant/60 mt-1.5 tabular-nums">
                          Bond {bondLevelForXp(entitlement.bondXp)} ·{' '}
                          {entitlement.bondXp.toLocaleString()} XP together
                        </p>
                      )}

                      <div className="mt-3">
                        {unlocked ? (
                          <PrimaryButton
                            onClick={() => void onSelect(coach)}
                            disabled={busy}
                            className="w-full text-sm py-2"
                          >
                            {active ? 'Open chat' : busy ? 'Switching…' : 'Choose'}
                          </PrimaryButton>
                        ) : (
                          <div className="space-y-1.5">
                            <p className="text-[11px] text-on-surface-variant/80 text-center">
                              {coach.unlock.kind === 'earned' ? coach.unlock.label : ''}
                            </p>
                            {entitlement?.starsPrice != null && roster.data.starsAvailable && (
                              <SecondaryButton
                                onClick={() => void onPurchase(coach)}
                                disabled={busy}
                                className="w-full text-sm py-2"
                              >
                                {busy ? 'Opening…' : `Unlock now · ${entitlement.starsPrice} ⭐`}
                              </SecondaryButton>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <p className="text-xs text-on-surface-variant/60 mt-5 leading-relaxed">
              Coaches change the tone, never the advice. Calorie targets, allergen filtering and
              every safety boundary are computed the same way whoever is in your corner.
            </p>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
