/**
 * Cut Man (AZF-P1 Epic E): the corner who steps in when a day slips.
 *
 * Two pieces, both calm by design: no red, no warning icon, no word about
 * anything gone. `CutManChip` sits on the season card and says how many days
 * are in the corner; `CutManNote` sits on the consistency card and says when
 * Cut Man last stepped in (or is standing by), with the smallest possible way
 * to show up today: one tap that logs a glass of water.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GraceView } from '@aquazerofit/shared';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { parseLocalDate, toLocalDate, todayLocalDate } from '@/lib/format';
import { newIdempotencyKey } from '@/pages/dashboard/lib';
import { queryKeys } from '@/lib/queries';

/** One glass. A water log is an active day (activeDatesOf on the API). */
const ONE_GLASS_ML = 250;

/** "2 in your corner", or how far the first one is. */
export function cutManChipLabel(grace: GraceView): string {
  if (grace.banked > 0) return `Cut Man: ${grace.banked} in your corner`;
  const n = grace.nextEarnInActiveDays;
  return `Cut Man: first one in ${n} active ${n === 1 ? 'day' : 'days'}`;
}

export function CutManChip({ grace }: { grace: GraceView }) {
  return (
    <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold tabular-nums text-on-surface">
      <span className="material-symbols-outlined text-[16px] text-primary" aria-hidden="true">
        healing
      </span>
      {cutManChipLabel(grace)}
    </p>
  );
}

function weekdayOf(isoDate: string): string {
  return parseLocalDate(isoDate).toLocaleDateString('en-US', { weekday: 'short' });
}

function daysBefore(isoDate: string, days: number): string {
  const date = parseLocalDate(isoDate);
  date.setDate(date.getDate() - days);
  return toLocalDate(date);
}

/** Cut Man is mentioned only while the bridge is recent enough to matter. */
const NOTE_WINDOW_DAYS = 7;

function useLogOneGlass() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: () =>
      api('/water-logs', {
        method: 'POST',
        body: { amountMl: ONE_GLASS_ML, localDate: todayLocalDate() },
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => toast.success('One glass logged. That counts for today.'),
    onError: () => toast.error('Could not log that just now. Try again.'),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['nutrition'] });
      void qc.invalidateQueries({ queryKey: queryKeys.progress });
    },
  });
}

export function CutManNote({ grace, lastActiveDate }: { grace: GraceView; lastActiveDate: string | null }) {
  const logOneGlass = useLogOneGlass();
  const today = todayLocalDate();
  const recent =
    grace.lastApplied !== null && grace.lastApplied >= daysBefore(today, NOTE_WINDOW_DAYS - 1);
  const showedUpToday = lastActiveDate === today;
  if (!recent && !grace.standingBy && showedUpToday) return null;

  return (
    <div className="mt-3 space-y-1">
      {grace.standingBy ? (
        <p className="text-sm text-on-surface text-pretty">
          Cut Man is standing by. Log anything today and your run carries on.
        </p>
      ) : (
        recent && (
          <p className="text-sm text-on-surface text-pretty">
            Cut Man stepped in on {weekdayOf(grace.lastApplied!)}. Your run carried on.
          </p>
        )
      )}
      {!showedUpToday && (
        <button
          type="button"
          onClick={() => logOneGlass.mutate()}
          disabled={logOneGlass.isPending || logOneGlass.isSuccess}
          className="min-h-[44px] rounded-lg text-left text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
        >
          Keep it simple today: log one glass of water
        </button>
      )}
    </div>
  );
}
