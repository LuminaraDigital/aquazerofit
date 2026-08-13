import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { COACHES, coachById, bondProgressForXp } from '@aquazerofit/shared';
import { GlassCard } from '@/components/ui/GlassCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { LevelBar, XpBreakdown } from '@/components/progress/LevelBar';
import { useAcknowledgeReactions, useProgression } from '@/lib/queries';
import { CoachAvatar } from './CoachAvatar';

/**
 * The dashboard's coach card: who is in your corner, what they have to say
 * about your week, and where you are on the ladder.
 *
 * Reactions are acknowledged from an effect *after* they render, not when the
 * query resolves. The distinction matters: a fetch that completes while the
 * user is mid-navigation would otherwise burn a level-up celebration nobody
 * saw, and a level-up only happens once.
 */
export function CoachCard() {
  const navigate = useNavigate();
  const progression = useProgression();
  const acknowledge = useAcknowledgeReactions();

  const data = progression.data;
  const coach = coachById(data?.activeCoachId) ?? COACHES[0]!;
  const lead = data?.reactions[0];

  // Key the acknowledgement on the reaction content so a *new* reaction after
  // an ack still fires, while a re-render of the same one does not.
  const ackedKey = useRef<string | null>(null);
  const reactionKey = data?.reactions.map((r) => `${r.kind}:${r.text}`).join('|') ?? null;

  useEffect(() => {
    if (!reactionKey || ackedKey.current === reactionKey) return;
    // A bare greeting is the "nothing to report" case — acknowledging it would
    // spend a write on every dashboard load for no behavioural change.
    if (data?.reactions.length === 1 && data.reactions[0]!.kind === 'greeting') return;
    ackedKey.current = reactionKey;
    acknowledge.mutate();
  }, [reactionKey, data, acknowledge]);

  if (progression.isPending) {
    return (
      <GlassCard className="p-card-padding">
        <Skeleton className="h-24 w-full" />
      </GlassCard>
    );
  }

  // A failed progression fetch hides the card rather than showing an error.
  // It is an enrichment surface; the dashboard's real job (calories, macros,
  // hydration) is unaffected, and an error panel here would imply otherwise.
  if (progression.isError || !data) return null;

  const bondPct = Math.round(bondProgressForXp(data.bondXp) * 100);

  return (
    <GlassCard className="p-card-padding">
      <div className="flex items-start gap-3.5">
        <button
          type="button"
          onClick={() => navigate('/coach/select')}
          aria-label={`${coach.name} is your coach. Change coach.`}
          className="shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <CoachAvatar
            art={coach.art}
            name={coach.name}
            colour={coach.colour}
            size={52}
            expression={lead?.expression ?? 'neutral'}
          />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="font-heading font-semibold text-on-surface leading-tight">
              {coach.name}
            </h2>
            <span
              className="text-[11px] uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ color: coach.colour, backgroundColor: `${coach.colour}1a` }}
            >
              Bond {data.bondLevel}
            </span>
          </div>

          {lead && (
            <p className="text-sm text-on-surface-variant mt-1.5 leading-relaxed">{lead.text}</p>
          )}

          {data.reactions.slice(1).map((reaction) => (
            <p
              key={`${reaction.kind}:${reaction.text}`}
              className="text-xs text-on-surface-variant/70 mt-1.5 leading-relaxed"
            >
              {reaction.text}
            </p>
          ))}

          <div
            className="h-1 w-full rounded-full bg-surface-variant/50 overflow-hidden mt-3"
            role="progressbar"
            aria-valuenow={bondPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Bond with ${coach.name}`}
          >
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{ width: `${Math.max(3, bondPct)}%`, backgroundColor: coach.colour }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-outline/40">
        <LevelBar experience={data.experience} />
        <XpBreakdown experience={data.experience} />
      </div>
    </GlassCard>
  );
}
