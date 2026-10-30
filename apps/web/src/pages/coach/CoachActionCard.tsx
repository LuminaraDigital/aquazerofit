/**
 * Confirmation card for a coach action. Nothing is logged until the user taps
 * through it, the same rule as MealDraftCard.
 */
import type { ChatActionDraft } from './mealDraft';
import { GlassCard } from '@/components/ui/GlassCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';

function summaryOf({ action }: ChatActionDraft): string {
  return action.kind === 'logWater'
    ? `Log ${action.amountMl} ml of water`
    : `Log your weight as ${action.weightKg} kg`;
}

export function CoachActionCard({
  draft,
  pending,
  onConfirm,
  onDismiss,
}: {
  draft: ChatActionDraft;
  pending: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <GlassCard className="p-4">
      <p className="text-sm text-on-surface tabular-nums">{summaryOf(draft)}</p>
      <div className="mt-3 flex flex-col gap-2">
        <PrimaryButton loading={pending} onClick={onConfirm}>
          Log it
        </PrimaryButton>
        <SecondaryButton disabled={pending} onClick={onDismiss}>
          Not this
        </SecondaryButton>
      </div>
    </GlassCard>
  );
}
