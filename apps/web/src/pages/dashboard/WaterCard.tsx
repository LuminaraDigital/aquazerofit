import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DailyNutrition } from '@aquazerofit/shared';
import { api } from '@/lib/api';
import { GlassCard } from '@/components/ui/GlassCard';
import { useToast } from '@/components/ui/Toast';
import { newIdempotencyKey } from './lib';

const SEGMENTS = 8;
const DROP_PATH =
  'M12 32C5.37258 32 0 26.6274 0 20C0 12 12 0 12 0C12 0 24 12 24 20C24 26.6274 18.6274 32 12 32Z';
const INCREMENT_ML = 250;

interface WaterCardProps {
  date: string;
  consumedMl: number;
  targetMl: number;
}

/**
 * Hydration card: 8 droplet segments + one-tap +250ml logging.
 * Optimistically bumps the cached daily analytics and rolls back with a toast on failure.
 */
export function WaterCard({ date, consumedMl, targetMl }: WaterCardProps) {
  const queryClient = useQueryClient();
  const { show } = useToast();

  const filled = targetMl > 0 ? Math.min(SEGMENTS, Math.round((consumedMl / targetMl) * SEGMENTS)) : 0;

  const logWater = useMutation({
    mutationFn: () =>
      api('/water-logs', {
        method: 'POST',
        body: { amountMl: INCREMENT_ML, localDate: date },
        idempotencyKey: newIdempotencyKey(),
      }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['nutrition', 'daily', date] });
      const previous = queryClient.getQueryData<DailyNutrition>(['nutrition', 'daily', date]);
      if (previous) {
        queryClient.setQueryData<DailyNutrition>(['nutrition', 'daily', date], {
          ...previous,
          waterMl: { ...previous.waterMl, consumed: previous.waterMl.consumed + INCREMENT_ML },
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['nutrition', 'daily', date], context.previous);
      }
      show('Could not log water — please try again');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['nutrition'] });
      void queryClient.invalidateQueries({ queryKey: ['progress'] });
    },
  });

  return (
    <GlassCard className="p-card-padding">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary" aria-hidden="true">
            water_drop
          </span>
          <h3 className="font-heading font-semibold uppercase tracking-[0.02em] text-xl text-on-surface">
            Hydration
          </h3>
        </div>
        <span className="text-sm font-bold text-primary tabular-nums">
          {(consumedMl / 1000).toFixed(1)}L / {(targetMl / 1000).toFixed(1)}L
        </span>
      </div>

      <div
        className="flex justify-between items-center gap-1 mb-4"
        role="img"
        aria-label={`Water intake ${consumedMl} of ${targetMl} millilitres`}
      >
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <svg
            key={i}
            width="24"
            height="32"
            viewBox="0 0 24 32"
            aria-hidden="true"
            className={
              i < filled
                ? 'text-primary drop-shadow-[0_0_4px_rgba(138,235,255,0.6)] transition-all duration-300'
                : 'text-outline-variant transition-all duration-300'
            }
          >
            <path d={DROP_PATH} fill="currentColor" />
          </svg>
        ))}
      </div>

      <button
        type="button"
        onClick={() => logWater.mutate()}
        disabled={logWater.isPending}
        aria-label="Log 250 millilitres of water"
        className="w-full py-3 rounded-xl border border-primary text-primary font-bold transition-all active:scale-95 flex justify-center items-center gap-2 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
          add
        </span>
        Log 250ml
      </button>
    </GlassCard>
  );
}
