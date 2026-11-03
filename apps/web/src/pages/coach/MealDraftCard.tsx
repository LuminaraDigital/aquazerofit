/**
 * Inline meal-confirmation card for the coach conversation (FR-013).
 *
 * The card exists because the coach must never log anything on its own. Every
 * line is opt-in: an item the corpus resolved cleanly starts checked, an item
 * that matched several foods starts with NO food chosen (choosing for the user
 * is the exact failure the confirmation step exists to prevent), and an item
 * the corpus does not know is shown greyed with a route to manual logging
 * rather than quietly dropped.
 *
 * Calories on screen are a linear projection of the server's own figures so the
 * card can respond while a portion is edited; the numbers written to the log
 * are recomputed server-side from the food record on confirm.
 *
 * Layout is mobile-first at 375px: one column, 44px+ tap targets, the food
 * picker is a native select so it gets the platform's own wheel on a phone.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MealType } from '@aquazerofit/shared';
import {
  COOKING_FAT_PRESETS,
  confidenceBandFromScore,
  confidenceBandLabel,
  FAT_CAUTION_NOTE,
  shouldShowFatCaution,
} from '@aquazerofit/shared';
import { GlassCard } from '@/components/ui/GlassCard';
import { Chip } from '@/components/ui/Chip';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import {
  describePortion,
  MEAL_TYPES,
  projectKcal,
  type ChatMealDraft,
  type ChatMealItem,
  type ChatMealMatch,
  type ConfirmSelection,
} from './mealDraft';

interface ItemChoice {
  /** null means "no food chosen yet" (ambiguous) or "not included". */
  foodId: string | null;
  included: boolean;
  grams: number | null;
}

interface CookingFatLine {
  key: string;
  presetId: string;
  label: string;
  grams: number;
  kcal: number;
  fatG: number;
  baseGrams: number;
}

function projectPresetKcal(line: CookingFatLine): number {
  if (line.baseGrams <= 0) return 0;
  return Math.round((line.kcal * line.grams) / line.baseGrams);
}

function initialChoices(draft: ChatMealDraft): Record<string, ItemChoice> {
  const choices: Record<string, ItemChoice> = {};
  for (const item of draft.items) {
    const suggested = item.suggestedFoodId
      ? item.matches.find((m) => m.foodId === item.suggestedFoodId)
      : undefined;
    choices[item.id] = {
      foodId: suggested?.foodId ?? null,
      // Only a clean single match is pre-included; ambiguous items are still
      // "on" so the row stays live, but they cannot be logged until a food is
      // picked (the confirm button accounts for that).
      included: item.status !== 'unmatched',
      grams: suggested?.grams ?? null,
    };
  }
  return choices;
}

function matchOf(item: ChatMealItem, foodId: string | null): ChatMealMatch | undefined {
  if (!foodId) return undefined;
  return item.matches.find((m) => m.foodId === foodId);
}

export function MealDraftCard({
  draft,
  pending,
  onConfirm,
  onDismiss,
}: {
  draft: ChatMealDraft;
  pending: boolean;
  onConfirm: (payload: {
    mealType: MealType;
    items: ConfirmSelection[];
    acknowledgeAllergens: boolean;
  }) => void;
  onDismiss: () => void;
}) {
  const [mealType, setMealType] = useState<MealType>(draft.mealType);
  const [choices, setChoices] = useState<Record<string, ItemChoice>>(() => initialChoices(draft));
  const [acknowledged, setAcknowledged] = useState(false);
  const [fatAdditives, setFatAdditives] = useState<CookingFatLine[]>([]);

  const selections = useMemo<ConfirmSelection[]>(() => {
    const out: ConfirmSelection[] = [];
    for (const item of draft.items) {
      const choice = choices[item.id];
      if (!choice?.included || !choice.foodId) continue;
      const match = matchOf(item, choice.foodId);
      if (!match) continue;
      out.push({ itemId: item.id, foodId: choice.foodId, grams: choice.grams ?? match.grams });
    }
    return out;
  }, [draft.items, choices]);

  const conflicts = useMemo(() => {
    const out: { name: string; allergens: string[] }[] = [];
    for (const item of draft.items) {
      const choice = choices[item.id];
      if (!choice?.included || !choice.foodId) continue;
      const match = matchOf(item, choice.foodId);
      if (match && match.allergenConflicts.length > 0) {
        out.push({ name: match.name, allergens: match.allergenConflicts });
      }
    }
    return out;
  }, [draft.items, choices]);

  const totalKcal = useMemo(() => {
    let total = 0;
    for (const item of draft.items) {
      const choice = choices[item.id];
      if (!choice?.included || !choice.foodId) continue;
      const match = matchOf(item, choice.foodId);
      if (match) total += projectKcal(match, choice.grams ?? match.grams);
    }
    for (const line of fatAdditives) {
      total += projectPresetKcal(line);
    }
    return total;
  }, [draft.items, choices, fatAdditives]);

  const showFatCaution = useMemo(() => {
    const names: string[] = [];
    let fatG = 0;
    for (const item of draft.items) {
      const choice = choices[item.id];
      if (!choice?.included || !choice.foodId) continue;
      const match = matchOf(item, choice.foodId);
      if (!match) continue;
      names.push(match.name);
      const grams = choice.grams ?? match.grams;
      if (match.grams > 0) fatG += match.fatG * (grams / match.grams);
    }
    for (const line of fatAdditives) {
      names.push(line.label);
      if (line.baseGrams > 0) fatG += line.fatG * (line.grams / line.baseGrams);
    }
    return shouldShowFatCaution(names, { kcal: totalKcal, fatG });
  }, [draft.items, choices, fatAdditives, totalKcal]);

  const update = (itemId: string, patch: Partial<ItemChoice>) =>
    setChoices((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] as ItemChoice), ...patch } }));

  const blockedByAllergens = conflicts.length > 0 && !acknowledged;
  const canConfirm = selections.length > 0 && !blockedByAllergens && !pending;

  if (draft.status === 'empty') {
    return (
      <GlassCard className="p-4">
        <p className="text-sm text-on-surface">
          I couldn’t read a meal out of that. Try naming the foods and roughly how much, like “two eggs
          on toast and a flat white”.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <Link
            to="/nutrition"
            className="flex min-h-[44px] items-center justify-center rounded-2xl border border-primary/60 px-4 text-sm font-semibold uppercase tracking-[0.04em] text-primary"
          >
            Log it manually
          </Link>
          <SecondaryButton onClick={onDismiss}>Dismiss</SecondaryButton>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Ready to log</p>
      <p className="mt-1 text-sm text-on-surface-variant">
        From “{draft.sourceText}”. Nothing is saved until you tap <strong>Log meal</strong>.
      </p>

      {/* meal type */}
      <fieldset className="mt-3">
        <legend className="sr-only">Meal</legend>
        <div className="flex flex-wrap gap-2">
          {MEAL_TYPES.map((type) => (
            <Chip
              key={type}
              label={type[0]?.toUpperCase() + type.slice(1)}
              tone="aqua"
              active={mealType === type}
              onClick={() => setMealType(type)}
            />
          ))}
        </div>
      </fieldset>

      {showFatCaution && (
        <div className="mt-3 space-y-2">
          <p className="rounded-card border border-coral/50 bg-coral/10 p-3 text-xs text-on-surface">
            {FAT_CAUTION_NOTE}
          </p>
          <p className="text-xs text-on-surface-variant">Add cooking fat if needed:</p>
          <div className="flex flex-wrap gap-2">
            {COOKING_FAT_PRESETS.map((preset) => (
              <Chip
                key={preset.id}
                label={preset.label}
                tone="aqua"
                onClick={() =>
                  setFatAdditives((prev) => [
                    ...prev,
                    {
                      key: `fat-${preset.id}-${Date.now()}`,
                      presetId: preset.id,
                      label: preset.label,
                      grams: preset.grams,
                      kcal: preset.kcal,
                      fatG: preset.fatG,
                      baseGrams: preset.grams,
                    },
                  ])
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* items */}
      <ul className="mt-4 space-y-3">
        {draft.items.map((item) => {
          const choice = choices[item.id] as ItemChoice;
          const match = matchOf(item, choice.foodId);
          const grams = choice.grams ?? match?.grams ?? 0;

          if (item.status === 'unmatched') {
            return (
              <li
                key={item.id}
                className="rounded-card border border-outline-variant bg-surface-container-low/40 p-3"
              >
                <p className="text-sm text-on-surface-variant">
                  “{item.phrase}” — not in the food database yet.
                </p>
                <Link to="/nutrition" className="mt-1 inline-block text-sm font-semibold text-primary">
                  Log it manually
                </Link>
              </li>
            );
          }

          return (
            <li
              key={item.id}
              className="rounded-card border border-outline-variant bg-surface-container-low/40 p-3"
            >
              <div className="flex items-start gap-3">
                <input
                  id={`incl-${draft.id}-${item.id}`}
                  type="checkbox"
                  checked={choice.included}
                  onChange={(e) => update(item.id, { included: e.target.checked })}
                  className="mt-1 h-5 w-5 shrink-0 rounded border-outline-variant bg-transparent accent-primary"
                />
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor={`incl-${draft.id}-${item.id}`}
                    className="block text-sm font-semibold text-on-surface"
                  >
                    {item.phrase}
                  </label>

                  {item.status === 'ambiguous' && (
                    <>
                      <label
                        htmlFor={`pick-${draft.id}-${item.id}`}
                        className="mt-2 block text-xs text-secondary"
                      >
                        Which one did you have?
                      </label>
                      <select
                        id={`pick-${draft.id}-${item.id}`}
                        value={choice.foodId ?? ''}
                        onChange={(e) => {
                          const foodId = e.target.value || null;
                          const picked = matchOf(item, foodId);
                          update(item.id, { foodId, grams: picked?.grams ?? null });
                        }}
                        className="mt-1 min-h-[44px] w-full rounded-xl border border-outline-variant bg-surface-container-high px-3 text-sm text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        <option value="">Choose a food…</option>
                        {item.matches.map((m) => (
                          <option key={m.foodId} value={m.foodId}>
                            {m.name} · {m.grams} g · {m.kcal} kcal
                          </option>
                        ))}
                      </select>
                    </>
                  )}

                  {match && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {item.status === 'resolved' && (
                        <span className="text-sm text-on-surface-variant">{match.name}</span>
                      )}
                      <label htmlFor={`g-${draft.id}-${item.id}`} className="sr-only">
                        Grams of {match.name}
                      </label>
                      <input
                        id={`g-${draft.id}-${item.id}`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={2000}
                        value={grams}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          update(item.id, {
                            grams: Number.isFinite(next) ? Math.min(2000, Math.max(1, next)) : null,
                          });
                        }}
                        className="min-h-[44px] w-24 rounded-xl border border-outline-variant bg-surface-container-high px-3 text-sm tabular-nums text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      />
                      <span className="text-sm text-on-surface-variant">g</span>
                      <span className="ml-auto text-sm font-semibold tabular-nums text-primary">
                        {projectKcal(match, grams)} kcal
                      </span>
                      {match.score > 0 && (
                        <span className="w-full text-xs font-semibold text-secondary">
                          {confidenceBandLabel(confidenceBandFromScore(match.score))} · {match.score}
                        </span>
                      )}
                    </div>
                  )}

                  {match && (
                    <p className="mt-1 text-xs text-on-surface-variant">{describePortion(match)}</p>
                  )}

                  {match && match.allergenConflicts.length > 0 && (
                    <p className="mt-1 text-xs font-semibold text-coral">
                      Contains {match.allergenConflicts.join(', ')} — on your allergy list.
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
        {fatAdditives.map((line) => (
          <li
            key={line.key}
            className="rounded-card border border-outline-variant bg-surface-container-low/40 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-on-surface">{line.label}</p>
              <button
                type="button"
                className="text-sm font-semibold text-primary"
                onClick={() => setFatAdditives((prev) => prev.filter((l) => l.key !== line.key))}
              >
                Remove
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={2000}
                value={line.grams}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setFatAdditives((prev) =>
                    prev.map((l) =>
                      l.key === line.key
                        ? {
                            ...l,
                            grams: Number.isFinite(next) ? Math.min(2000, Math.max(1, next)) : l.grams,
                          }
                        : l,
                    ),
                  );
                }}
                className="min-h-[44px] w-24 rounded-xl border border-outline-variant bg-surface-container-high px-3 text-sm tabular-nums text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              />
              <span className="text-sm text-on-surface-variant">g</span>
              <span className="ml-auto text-sm font-semibold tabular-nums text-primary">
                {projectPresetKcal(line)} kcal
              </span>
            </div>
          </li>
        ))}
      </ul>

      {/* notes */}
      {draft.notes.length > 0 && (
        <ul className="mt-3 space-y-1">
          {draft.notes.map((note) => (
            <li key={note} className="text-xs text-on-surface-variant">
              {note}
            </li>
          ))}
        </ul>
      )}

      {/* allergen acknowledgement — never pre-ticked */}
      {conflicts.length > 0 && (
        <div className="mt-3 rounded-card border border-coral/50 bg-coral/10 p-3">
          <p className="text-sm font-semibold text-coral">Allergy check</p>
          <p className="mt-1 text-xs text-on-surface">
            {conflicts.map((c) => `${c.name} (${c.allergens.join(', ')})`).join('; ')} match an allergy
            on your profile.
          </p>
          <label className="mt-2 flex items-start gap-2 text-xs text-on-surface">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-outline-variant bg-transparent accent-coral"
            />
            I know — log it anyway.
          </label>
        </div>
      )}

      <p className="mt-4 text-sm text-on-surface-variant">
        Total to log:{' '}
        <strong className="tabular-nums text-on-surface">
          {fatAdditives.length === 0
            ? totalKcal
            : totalKcal - fatAdditives.reduce((sum, line) => sum + projectPresetKcal(line), 0)}{' '}
          kcal
        </strong>
      </p>
      {fatAdditives.length > 0 && (
        <p className="mt-1 text-xs text-on-surface-variant">
          With cooking fat estimates: {totalKcal} kcal (adjust matched foods before logging)
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2">
        <PrimaryButton
          loading={pending}
          disabled={!canConfirm}
          onClick={() => onConfirm({ mealType, items: selections, acknowledgeAllergens: acknowledged })}
        >
          Log meal
        </PrimaryButton>
        <SecondaryButton disabled={pending} onClick={onDismiss}>
          Not this
        </SecondaryButton>
      </div>
    </GlassCard>
  );
}
