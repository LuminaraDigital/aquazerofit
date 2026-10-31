/**
 * Confirmation card for a coach action. Nothing happens until the user taps
 * through it, the same rule as MealDraftCard.
 */
import { CREDIT_COSTS, type ChatActionDraft } from '@aquazerofit/shared';
import { GlassCard } from '@/components/ui/GlassCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';

const FOCUS_LABEL = { general: 'general', strength: 'strength', weightLoss: 'weight loss' } as const;

function copyOf({ action }: ChatActionDraft): { summary: string; detail?: string; confirm: string } {
  switch (action.kind) {
    case 'logWater':
      return { summary: `Log ${action.amountMl} ml of water`, confirm: 'Log it' };
    case 'logWeight':
      return { summary: `Log your weight as ${action.weightKg} kg`, confirm: 'Log it' };
    case 'swapExercise':
      return {
        summary: `Swap ${action.exerciseName} in today's workout`,
        detail: `We choose a replacement that suits your equipment. Uses up to ${CREDIT_COSTS.exerciseSwap} credit.`,
        confirm: 'Swap it',
      };
    case 'rebuildPlan':
      return {
        summary: `Rebuild your training plan: ${action.daysPerWeek} days a week, ${FOCUS_LABEL[action.focus]} focus`,
        detail: `This replaces your current plan and uses up to ${CREDIT_COSTS.planGeneration} credits.`,
        confirm: 'Rebuild plan',
      };
  }
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
  const { summary, detail, confirm } = copyOf(draft);
  return (
    <GlassCard className="p-4">
      <p className="text-sm text-on-surface tabular-nums">{summary}</p>
      {detail && <p className="mt-1 text-xs text-on-surface-variant">{detail}</p>}
      <div className="mt-3 flex flex-col gap-2">
        <PrimaryButton loading={pending} onClick={onConfirm}>
          {confirm}
        </PrimaryButton>
        <SecondaryButton disabled={pending} onClick={onDismiss}>
          Not this
        </SecondaryButton>
      </div>
    </GlassCard>
  );
}
