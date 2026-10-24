/**
 * Shown when meal-photo recognition fell back to the offline engine.
 * The colours are the warning-container pair, which Telegram theme binding
 * does not repaint, so the same ink stays AA on light and dark hosts.
 */
export const AI_DEGRADED_NOTICE =
  'This result is an estimate. AI recognition was unavailable. Check the items and edit them before you log the meal.';

export const AI_DEGRADED_STORAGE_KEY = 'azf.mealAiDegraded';

export function rememberAiDegraded(degraded: boolean): void {
  try {
    if (degraded) sessionStorage.setItem(AI_DEGRADED_STORAGE_KEY, '1');
    else sessionStorage.removeItem(AI_DEGRADED_STORAGE_KEY);
  } catch {
    // Private mode can reject sessionStorage. The notice on this screen still shows.
  }
}

export function readAiDegradedFlag(): boolean {
  try {
    return sessionStorage.getItem(AI_DEGRADED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function AiDegradedNotice() {
  return (
    <div
      role="status"
      data-testid="ai-degraded-notice"
      className="rounded-xl border border-warning bg-warning-container px-4 py-3 text-sm font-medium leading-5 text-on-warning-container"
    >
      {AI_DEGRADED_NOTICE}
    </div>
  );
}
