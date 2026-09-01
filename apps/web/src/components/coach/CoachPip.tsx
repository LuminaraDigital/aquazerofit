/**
 * Always-on-top coach HUD via the Document Picture-in-Picture API (AQF-27 §2.1).
 *
 * A phone competes for a session; desktop competes for a corner of the screen
 * for eight hours. When the API is missing (Safari, mobile browsers), the pin
 * control stays hidden and the main app is unchanged.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import type { DailyNutrition, WorkoutSession } from '@aquazerofit/shared';
import { COACHES, coachById } from '@aquazerofit/shared';
import { api } from '@/lib/api';
import { useProgression } from '@/lib/queries';
import { RingProgress } from '@/components/ui/RingProgress';
import { CoachAvatar } from '@/components/coach/CoachAvatar';
import {
  asWorkoutSession,
  estimateDurationMinutes,
  fmtInt,
  todayLocalDate,
} from '@/pages/dashboard/lib';
import { supportsDocumentPictureInPicture } from '@/lib/useDesktopAmbient';

interface DocumentPictureInPictureApi {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
  window: Window | null;
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPictureApi;
  }
}

function copyStylesInto(target: Window) {
  [...document.styleSheets].forEach((sheet) => {
    try {
      const rules = [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
      const style = target.document.createElement('style');
      style.textContent = rules;
      target.document.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = target.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        target.document.head.appendChild(link);
      }
    }
  });
  target.document.body.className = document.body.className;
  target.document.documentElement.className = document.documentElement.className;
}

function PipHud({
  daily,
  session,
  coachName,
  coachColour,
  coachLine,
  coachArt,
}: {
  daily: DailyNutrition | undefined;
  session: WorkoutSession | null;
  coachName: string;
  coachColour: string;
  coachLine: string | null;
  coachArt: (typeof COACHES)[number]['art'];
}) {
  const nextExercise = session?.exercises[0];
  const resting = session?.focus.toLowerCase().includes('rest') ?? false;

  return (
    <div className="min-h-screen bg-surface text-on-surface p-4 font-body">
      <header className="flex items-center gap-3 mb-4">
        <CoachAvatar art={coachArt} name={coachName} colour={coachColour} size={40} />
        <div className="min-w-0">
          <p className="font-heading font-semibold text-sm leading-tight truncate">{coachName}</p>
          <p className="text-[11px] uppercase tracking-wider text-on-surface-variant/70">
            Corner coach
          </p>
        </div>
      </header>

      {daily ? (
        <section className="mb-4 flex flex-col items-center" aria-label="Daily calories">
          <RingProgress
            value={daily.kcalConsumed}
            target={daily.kcalTarget}
            size={120}
            strokeWidth={6}
            tone="aqua"
          >
            <div className="flex flex-col items-center">
              <span className="font-heading font-semibold text-2xl text-primary tabular-nums leading-none">
                {fmtInt(Math.max(0, daily.kcalRemaining))}
              </span>
              <span className="text-[10px] text-on-surface-variant/70 mt-1 uppercase tracking-wider">
                kcal left
              </span>
            </div>
          </RingProgress>
        </section>
      ) : (
        <p className="text-sm text-on-surface-variant/70 mb-4">Loading today&apos;s ring…</p>
      )}

      <section className="mb-4 rounded-xl border border-outline/40 bg-surface-container-low/60 p-3">
        <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/70 mb-1">
          {resting || !session ? 'Today' : 'Next up'}
        </p>
        {resting || !session ? (
          <p className="text-sm text-on-surface-variant">Rest and recover.</p>
        ) : (
          <>
            <p className="font-heading font-semibold text-sm">{session.focus}</p>
            {nextExercise && (
              <p className="text-xs text-on-surface-variant mt-1 truncate">
                {nextExercise.name} · {nextExercise.setsPlanned}×{nextExercise.reps}
              </p>
            )}
            <p className="text-xs text-on-surface-variant/70 mt-1 tabular-nums">
              ~{estimateDurationMinutes(session)} min
            </p>
          </>
        )}
      </section>

      {coachLine && (
        <p className="text-sm text-on-surface-variant leading-relaxed border-t border-outline/30 pt-3">
          {coachLine}
        </p>
      )}
    </div>
  );
}

export function CoachPip() {
  const pipWindowRef = useRef<Window | null>(null);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [open, setOpen] = useState(false);
  const supported = supportsDocumentPictureInPicture();

  const today = todayLocalDate();
  const dailyQuery = useQuery({
    queryKey: ['nutrition', 'daily', today],
    queryFn: () => api<DailyNutrition>('/analytics/nutrition/daily', { query: { date: today } }),
    enabled: open,
  });
  const workoutQuery = useQuery({
    queryKey: ['workouts', 'today'],
    queryFn: () => api<unknown>('/workouts/today'),
    enabled: open,
  });
  const progression = useProgression();

  const progressionData = progression.data;
  const coach = coachById(progressionData?.activeCoachId) ?? COACHES[0]!;
  const coachLine = progressionData?.reactions[0]?.text ?? null;
  const session = asWorkoutSession(workoutQuery.data);

  const closePip = useCallback(() => {
    pipWindowRef.current?.close();
    pipWindowRef.current = null;
    setPipWindow(null);
    setOpen(false);
  }, []);

  const openPip = useCallback(async () => {
    const api = window.documentPictureInPicture;
    if (!api) return;

    try {
      if (pipWindowRef.current && !pipWindowRef.current.closed) {
        pipWindowRef.current.focus();
        return;
      }

      const win = await api.requestWindow({ width: 320, height: 420 });
      copyStylesInto(win);
      pipWindowRef.current = win;
      setPipWindow(win);
      setOpen(true);

      win.addEventListener('pagehide', closePip);
    } catch {
      closePip();
    }
  }, [closePip]);

  useEffect(() => () => closePip(), [closePip]);

  if (!supported) return null;

  let pipContent: ReactNode = null;
  if (pipWindow && !pipWindow.closed) {
    pipContent = createPortal(
      <PipHud
        daily={dailyQuery.data}
        session={session}
        coachName={coach.name}
        coachColour={coach.colour}
        coachLine={coachLine}
        coachArt={coach.art}
      />,
      pipWindow.document.body,
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openPip()}
        className="fixed bottom-28 right-[max(1rem,calc(50%-240px))] z-50 hidden lg:flex items-center gap-2 rounded-full border border-primary/40 bg-surface/90 backdrop-blur px-4 py-2 text-sm font-medium text-on-surface shadow-lg hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        aria-label="Pin coach to an always-on-top window"
      >
        <span className="material-symbols-outlined text-[18px] text-primary" aria-hidden="true">
          picture_in_picture_alt
        </span>
        Pin coach
      </button>
      {pipContent}
    </>
  );
}
