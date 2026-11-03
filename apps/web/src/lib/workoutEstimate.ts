/**
 * One session-length estimate for Home and Workouts.
 *
 * Planned time is sets × (reps × 4 seconds + rest). A stored duration wins
 * when it is a positive number. The floor is 10 minutes, matching the
 * training screen and the Android client.
 */
export interface TimedSession {
  durationMinutes?: number | null;
  exercises: readonly { setsPlanned: number; reps: number; restSeconds: number }[];
}

export function estimateSessionMinutes(session: TimedSession): number {
  if (session.durationMinutes != null && session.durationMinutes > 0) return session.durationMinutes;
  const seconds = session.exercises.reduce(
    (total, exercise) => total + exercise.setsPlanned * (exercise.reps * 4 + exercise.restSeconds),
    0,
  );
  return Math.max(10, Math.round(seconds / 60));
}
