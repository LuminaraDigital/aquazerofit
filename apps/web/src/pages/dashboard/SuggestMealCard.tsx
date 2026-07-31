import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { GlassCard } from '@/components/ui/GlassCard';
import { useToast } from '@/components/ui/Toast';
import {
  asRecommendation,
  fmtInt,
  mealTypeForNow,
  newIdempotencyKey,
  type RecommendationWithRecipe,
} from './lib';

/** On-demand AI meal suggestion with one-tap "Add to log" (dashboard card). */
export function SuggestMealCard({ date }: { date: string }) {
  const queryClient = useQueryClient();
  const { show } = useToast();
  const [rec, setRec] = useState<RecommendationWithRecipe | null>(null);
  const [logged, setLogged] = useState(false);

  const suggest = useMutation({
    mutationFn: () =>
      api<unknown>('/recommendations/meals', {
        method: 'POST',
        body: { mealType: mealTypeForNow(), localDate: date },
      }),
    onSuccess: (raw) => {
      const next = asRecommendation(raw);
      if (next) {
        setRec(next);
        setLogged(false);
      } else {
        show('Could not read the suggestion — please try again');
      }
    },
    onError: () => show('Suggestion unavailable right now'),
  });

  const addToLog = useMutation({
    mutationFn: (id: string) =>
      api(`/recommendations/${id}/log`, { method: 'POST', idempotencyKey: newIdempotencyKey() }),
    onSuccess: () => {
      setLogged(true);
      show('Added to your log');
      void queryClient.invalidateQueries({ queryKey: ['nutrition'] });
      void queryClient.invalidateQueries({ queryKey: ['progress'] });
    },
    onError: () => show('Could not log that meal — please try again'),
  });

  return (
    <GlassCard className="p-card-padding">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 cta-gradient rounded-full flex items-center justify-center text-on-primary">
          <span className="material-symbols-outlined" aria-hidden="true">
            smart_toy
          </span>
        </div>
        <div>
          <h3 className="font-heading font-semibold uppercase tracking-[0.02em] text-xl text-on-surface">
            AI Meal Suggestion
          </h3>
          <p className="text-sm text-on-surface-variant">Tuned to what you have left today.</p>
        </div>
      </div>

      {rec && (
        <div className="mb-4 rounded-xl bg-surface-container-low border border-outline-variant p-4">
          <div className="flex justify-between items-start gap-3 mb-1">
            <p className="font-bold text-on-surface">{rec.name}</p>
            <span className="text-primary font-bold text-sm tabular-nums whitespace-nowrap">
              {fmtInt(rec.kcal)} kcal
            </span>
          </div>
          <p className="text-xs text-on-surface-variant tabular-nums mb-2">
            P {Math.round(rec.proteinG)}g · C {Math.round(rec.carbsG)}g · F {Math.round(rec.fatG)}g
          </p>
          <p className="text-sm text-on-surface-variant">{rec.rationale}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => suggest.mutate()}
          disabled={suggest.isPending}
          className="flex-1 py-3 rounded-xl border border-primary text-primary font-bold transition-all active:scale-95 disabled:opacity-60 flex justify-center items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
            auto_fix_high
          </span>
          {suggest.isPending ? 'Thinking…' : rec ? 'Suggest another' : 'Suggest a meal'}
        </button>
        {rec && (
          <button
            type="button"
            onClick={() => addToLog.mutate(rec.id)}
            disabled={addToLog.isPending || logged}
            className="flex-1 py-3 rounded-xl cta-gradient text-on-primary font-bold transition-all active:scale-95 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            {logged ? 'Logged ✓' : addToLog.isPending ? 'Logging…' : 'Add to log'}
          </button>
        )}
      </div>
    </GlassCard>
  );
}
