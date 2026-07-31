/**
 * Number / date / unit formatting helpers.
 * Canonical storage is metric (kg, cm, ml) — imperial conversion happens
 * only at the display edge, honoring the user's unitPreference.
 */
import type { UnitPreference } from '@aquazerofit/shared';

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------- nutrition ----------

/** "1,850" (no unit) — em dash for missing values. */
export function formatKcal(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}

/** "82 g" — em dash for missing values. */
export function formatGrams(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Math.round(n)} g`;
}

/** "1,250 ml" or "1.3 L" when >= 1000. */
export function formatMl(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1000) return `${round1(n / 1000)} L`;
  return `${Math.round(n)} ml`;
}

// ---------- weight ----------

export function kgToLbs(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbsToKg(lbs: number): number {
  return lbs * KG_PER_LB;
}

/** Numeric weight in the user's display unit, 1 decimal. */
export function kgToDisplay(kg: number, unit: UnitPreference): number {
  return unit === 'imperial' ? round1(kgToLbs(kg)) : round1(kg);
}

/** Convert a value typed in the display unit back to canonical kg. */
export function displayToKg(value: number, unit: UnitPreference): number {
  return unit === 'imperial' ? round1(lbsToKg(value)) : value;
}

export function weightUnit(unit: UnitPreference): 'kg' | 'lbs' {
  return unit === 'imperial' ? 'lbs' : 'kg';
}

/** "72.5 kg" / "159.8 lbs". */
export function formatWeight(kg: number | null | undefined, unit: UnitPreference): string {
  if (kg == null || !Number.isFinite(kg)) return '—';
  return `${kgToDisplay(kg, unit)} ${weightUnit(unit)}`;
}

// ---------- height ----------

export function cmToFtIn(cm: number): { ft: number; inches: number } {
  const totalIn = cm / CM_PER_IN;
  let ft = Math.floor(totalIn / 12);
  let inches = Math.round(totalIn - ft * 12);
  if (inches === 12) {
    ft += 1;
    inches = 0;
  }
  return { ft, inches };
}

export function ftInToCm(ft: number, inches: number): number {
  return Math.round((ft * 12 + inches) * CM_PER_IN);
}

/** "178 cm" / 5'10" depending on preference. */
export function formatHeight(cm: number | null | undefined, unit: UnitPreference): string {
  if (cm == null || !Number.isFinite(cm)) return '—';
  if (unit === 'imperial') {
    const { ft, inches } = cmToFtIn(cm);
    return `${ft}'${inches}"`;
  }
  return `${Math.round(cm)} cm`;
}

// ---------- dates ----------

/** Local YYYY-MM-DD for "today" — the canonical localDate the API expects. */
export function todayLocalDate(): string {
  return toLocalDate(new Date());
}

export function toLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD string as a local date (never UTC-shifted). */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** "Tue, 29 Jul" from a YYYY-MM-DD or ISO string. */
export function formatDate(dateStr: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? parseLocalDate(dateStr) : new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "Jan 2024" style month label from an ISO timestamp. */
export function formatMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/** "Today" / "Yesterday" / "Tue, 29 Jul" for a YYYY-MM-DD local date. */
export function relativeDay(dateStr: string): string {
  const today = new Date();
  if (dateStr === toLocalDate(today)) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dateStr === toLocalDate(yesterday)) return 'Yesterday';
  return formatDate(dateStr);
}

/** "Just now" / "5m ago" / "3h ago" / "Yesterday" / "Tue, 29 Jul" from an ISO timestamp. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '—';
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24 && toLocalDate(new Date(then)) === todayLocalDate()) return `${hours}h ago`;
  return relativeDay(toLocalDate(new Date(then)));
}

/** Shift a YYYY-MM-DD local date by n days. */
export function addDays(dateStr: string, n: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + n);
  return toLocalDate(d);
}
