/**
 * Asks for aiPersonalisation where it matters. Telegram sign-in skips the setup
 * screen that normally asks, which left the coach blind with no way to tell why.
 * Consent stays off until the user taps Allow.
 */
import { GlassCard } from '@/components/ui/GlassCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';

export function CoachConsentCard({
  coachName,
  pending,
  onAllow,
  onDecline,
}: {
  coachName: string;
  pending: boolean;
  onAllow: () => void;
  onDecline: () => void;
}) {
  return (
    <GlassCard className="p-4">
      <p className="text-sm text-on-surface">Let {coachName} use your data?</p>
      <p className="mt-1 text-xs text-on-surface-variant">
        Your profile, logs, plan and saved memories are sent to our AI providers to personalise replies. Without this,
        answers stay general. You can change this any time in Settings.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <PrimaryButton loading={pending} onClick={onAllow}>
          Allow
        </PrimaryButton>
        <SecondaryButton disabled={pending} onClick={onDecline}>
          Not now
        </SecondaryButton>
      </div>
    </GlassCard>
  );
}
