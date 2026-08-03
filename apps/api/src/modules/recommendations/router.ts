/**
 * Meal recommendations (AQF-07 §3.3, FR context-aware suggestion).
 *
 * POST /meals         context-aware suggestion with AI metadata + rationale
 * POST /:id/log       one-tap add the suggestion to the meal log
 * POST /:id/feedback  up/down signal into the evaluation loop
 *
 * Admission sequence applies (brief rule 4). Remaining kcal/macros are
 * computed IN CODE from the store; candidates pass the deterministic dietary
 * and allergen filters BEFORE the model sees them, and the model's ranking is
 * re-validated against the filtered set afterwards — the model can only pick
 * from what code already declared safe.
 */
import { Router } from 'express';
import { requireAuth } from '../../platform/auth';
import { AppError } from '../../platform/errors';
import {
  mealRecommendationRequestSchema,
  recommendationFeedbackSchema,
} from '@aquazerofit/shared';
import type {
  DietaryPreference,
  Food,
  MealLog,
  MealRecommendation,
  Recipe,
} from '@aquazerofit/shared';
import { complete } from '../ai/gateway';
import { post as postGuardrail } from '../ai/guardrails';
import { creditLedger } from '../ai/creditLedger';
import { assertLaneAllowed } from '../ai/tierPolicy';
import { hasConsent } from '../me/service';
import {
  asyncHandler,
  byIdDoc,
  getUser,
  localToday,
  newId,
  nowIso,
  readProfile,
  readTargets,
  round1,
  upsertDoc,
  whereDocs,
} from '../ai/util';
import { excludeAllergens } from './allergenFilter';

export const recommendationsRouter = Router();
recommendationsRouter.use(requireAuth);

/** Preferences that strictly exclude foods (lifestyle prefs only influence ranking). */
const RESTRICTIVE_PREFS: DietaryPreference[] = [
  'vegetarian',
  'vegan',
  'pescatarian',
  'halal',
  'kosher',
  'glutenFree',
  'dairyFree',
];

interface Candidate {
  id: string;
  name: string;
  description: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  ingredients: string[];
  allergens: Recipe['allergens'];
}

function recipeToCandidate(r: Recipe): Candidate {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    kcal: r.perServing.kcal,
    proteinG: r.perServing.proteinG,
    carbsG: r.perServing.carbsG,
    fatG: r.perServing.fatG,
    ingredients: r.ingredients.map((i) => i.name),
    allergens: r.allergens,
  };
}

function foodToCandidate(f: Food): Candidate {
  const serving = f.commonServings?.[0]?.grams ?? 100;
  const factor = serving / 100;
  return {
    id: f.id,
    name: `${f.name} (${serving} g)`,
    description: f.category,
    kcal: round1(f.per100g.kcal * factor),
    proteinG: round1(f.per100g.proteinG * factor),
    carbsG: round1(f.per100g.carbsG * factor),
    fatG: round1(f.per100g.fatG * factor),
    ingredients: [f.name],
    allergens: f.allergens,
  };
}

// ---------------------------------------------------------------------------

/** Rough share of the remaining daily budget one meal should cover. */
const MEAL_BUDGET_SHARE: Record<string, number> = {
  breakfast: 0.3,
  lunch: 0.35,
  dinner: 0.35,
  snack: 0.15,
};

/** Generic daily targets used when wellness data may not be processed. */
const GENERIC_TARGETS = { kcal: 2000, proteinG: 110, carbsG: 230, fatG: 65 };

recommendationsRouter.post(
  '/meals',
  asyncHandler(async (req, res) => {
    const user = getUser(req);
    const parsed = mealRecommendationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_FAILED', 'mealType and localDate are required.', {
        issues: parsed.error.issues,
      });
    }
    const { mealType, localDate } = parsed.data;

    // --- Consent gates (AQF-07 §3.4):
    //   aiPersonalisation      — may profile + log data enter model context?
    //   wellnessDataProcessing — may profile data (allergies, targets) be used
    //                            at all for this feature?
    const personalised = hasConsent(user.id, 'aiPersonalisation');
    const wellnessOk = hasConsent(user.id, 'wellnessDataProcessing');

    // --- Admission
    assertLaneAllowed(user.tier, 'planStructured');
    const reservationId = await creditLedger.reserve(user.id, 'mealRecommendation');

    if (!personalised) {
      // Consent-off fallback: a generic, deterministic recommendation with NO
      // model call and NO profile/log data in any model context.
      //   - budget comes from stored targets only if wellnessDataProcessing is
      //     on; otherwise from generic defaults;
      //   - the hard allergen filter uses the profile ONLY when
      //     wellnessDataProcessing is on; when both consents are off, no
      //     dietary personalisation is applied at all and the rationale
      //     carries an advisory instead.
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const recipes = await whereDocs<Recipe>('content', (d: any) => d?.type === 'recipe');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const foods = await whereDocs<Food>('content', (d: any) => d?.type === 'food');
        let candidates: Candidate[] = recipes.map(recipeToCandidate);
        if (candidates.length < 3) candidates = candidates.concat(foods.map(foodToCandidate));

        const targets = wellnessOk ? await readTargets(user.id) : null;
        const budget = {
          kcal: targets ? targets.kcalTarget : GENERIC_TARGETS.kcal,
          proteinG: targets ? targets.proteinG : GENERIC_TARGETS.proteinG,
          carbsG: targets ? targets.carbsG : GENERIC_TARGETS.carbsG,
          fatG: targets ? targets.fatG : GENERIC_TARGETS.fatG,
        };

        if (wellnessOk) {
          const profile = await readProfile(user.id);
          candidates = excludeAllergens(candidates, profile?.allergies ?? []);
        }
        if (candidates.length === 0) {
          throw new AppError(
            'NOT_FOUND',
            'No suitable meals matched your preferences and allergies. Try logging manually or adjusting preferences.',
          );
        }

        // Deterministic pick: closest to this meal's share of the daily budget.
        const share = budget.kcal * (MEAL_BUDGET_SHARE[mealType] ?? 0.3);
        const chosen = [...candidates].sort(
          (a, b) => Math.abs(a.kcal - share) - Math.abs(b.kcal - share),
        )[0]!;

        const advisory = wellnessOk ? '' : ' Enable personalisation for tailored suggestions.';
        const recommendation: MealRecommendation = {
          id: newId('rec'),
          userId: user.id,
          type: 'recommendation',
          name: chosen.name,
          description: chosen.description,
          mealType,
          kcal: chosen.kcal,
          proteinG: chosen.proteinG,
          carbsG: chosen.carbsG,
          fatG: chosen.fatG,
          ingredients: chosen.ingredients,
          rationale: `A balanced ${mealType} option of about ${Math.round(chosen.kcal)} kcal.${advisory}`,
          ai: {
            provider: 'deterministic',
            model: 'consent-off-fallback',
            promptVersion: 'n/a',
            generatedAt: nowIso(),
          },
          feedback: null,
          loggedMealId: null,
          createdAt: nowIso(),
        };
        await upsertDoc('ai', recommendation);
        await creditLedger.commit(reservationId);
        res.status(201).json({ recommendation, remaining: budget });
      } catch (err) {
        await creditLedger.release(reservationId);
        throw err;
      }
      return;
    }

    try {
      // --- Remaining budget computed IN CODE from the store.
      const profile = await readProfile(user.id);
      const targets = await readTargets(user.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meals = await whereDocs<MealLog>('logs', (d: any) => {
        return d?.userId === user.id && d?.type === 'mealLog' && d?.localDate === localDate;
      });
      const consumed = meals.reduce(
        (acc, m) => ({
          kcal: acc.kcal + (m.totalKcal ?? 0),
          proteinG: acc.proteinG + (m.totalProteinG ?? 0),
          carbsG: acc.carbsG + (m.totalCarbsG ?? 0),
          fatG: acc.fatG + (m.totalFatG ?? 0),
        }),
        { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      );
      const remaining = {
        kcal: round1(Math.max(0, targets.kcalTarget - consumed.kcal)),
        proteinG: round1(Math.max(0, targets.proteinG - consumed.proteinG)),
        carbsG: round1(Math.max(0, targets.carbsG - consumed.carbsG)),
        fatG: round1(Math.max(0, targets.fatG - consumed.fatG)),
      };

      // --- Candidates: recipes first, foods as fallback breadth.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const recipes = await whereDocs<Recipe>('content', (d: any) => d?.type === 'recipe');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const foods = await whereDocs<Food>('content', (d: any) => d?.type === 'food');

      const prefs = profile?.dietaryPreferences ?? [];
      const restrictive = RESTRICTIVE_PREFS.filter((p) => prefs.includes(p));
      const prefFiltered = recipes.filter((r) =>
        restrictive.every((p) => (r.suitableFor ?? []).includes(p)),
      );

      let candidates: Candidate[] = prefFiltered.map(recipeToCandidate);
      if (candidates.length < 3) {
        candidates = candidates.concat(foods.map(foodToCandidate));
      }

      // --- HARD deterministic allergen exclusion. Never delegated to a model.
      const allergies = profile?.allergies ?? [];
      const safeCandidates = excludeAllergens(candidates, allergies);
      if (safeCandidates.length === 0) {
        throw new AppError(
          'NOT_FOUND',
          'No suitable meals matched your preferences and allergies. Try logging manually or adjusting preferences.',
        );
      }

      // --- Model ranks; code verifies the pick is inside the safe set.
      const result = await complete(
        'planStructured',
        [
          {
            role: 'user',
            content: `Recommend a ${mealType} within remaining budget ${JSON.stringify(remaining)}.`,
          },
        ],
        {
          json: true,
          promptId: 'P-02',
          context: {
            mealType,
            remaining,
            candidates: safeCandidates.map((c) => ({
              id: c.id,
              name: c.name,
              kcal: c.kcal,
              proteinG: c.proteinG,
              carbsG: c.carbsG,
              fatG: c.fatG,
            })),
          },
        },
      );

      const ranked = (result.json ?? {}) as { rankedIds?: string[]; rationale?: string };
      const safeIds = new Set(safeCandidates.map((c) => c.id));
      const chosenId = (ranked.rankedIds ?? []).find((id) => safeIds.has(id)) ?? safeCandidates[0]!.id;
      const chosen = safeCandidates.find((c) => c.id === chosenId)!;

      // Model-authored rationale passes the output guardrail before it can
      // reach the user; on any block the deterministic rationale substitutes.
      const deterministicRationale = `Fits your remaining ~${Math.round(remaining.kcal)} kcal for ${mealType} and supports your protein goal.`;
      let rationale = ranked.rationale ?? deterministicRationale;
      if (ranked.rationale && postGuardrail(ranked.rationale, { userId: user.id }).blocked) {
        rationale = deterministicRationale;
      }

      // Macro figures come from the content record, never from model output.
      const recommendation: MealRecommendation = {
        id: newId('rec'),
        userId: user.id,
        type: 'recommendation',
        name: chosen.name,
        description: chosen.description,
        mealType,
        kcal: chosen.kcal,
        proteinG: chosen.proteinG,
        carbsG: chosen.carbsG,
        fatG: chosen.fatG,
        ingredients: chosen.ingredients,
        rationale,
        ai: result.meta,
        feedback: null,
        loggedMealId: null,
        createdAt: nowIso(),
      };
      await upsertDoc('ai', recommendation);
      // Real providers failed and the gateway fell back to offline templates —
      // do not charge. Keyless mock (no providers configured) keeps degraded
      // false and bills normally per product rules. Same stance as the chat lane.
      if (result.meta.degraded) {
        await creditLedger.release(reservationId);
      } else {
        await creditLedger.commit(reservationId);
      }

      res.status(201).json({ recommendation, remaining });
    } catch (err) {
      await creditLedger.release(reservationId);
      if (err instanceof AppError) throw err;
      // Error hygiene: log internals server-side only — the client envelope
      // never carries err.message/cause.
      console.error('[recommendations] meal suggestion failed', err);
      throw new AppError(
        'AI_UNAVAILABLE',
        'Meal suggestions are temporarily unavailable — you can still browse recipes and log meals manually.',
      );
    }
  }),
);

// ---------------------------------------------------------------------------

recommendationsRouter.post(
  '/:id/log',
  asyncHandler(async (req, res) => {
    const user = getUser(req);
    const rec = await byIdDoc<MealRecommendation>('ai', req.params.id as string);
    if (!rec || rec.type !== 'recommendation' || rec.userId !== user.id) {
      throw new AppError('NOT_FOUND', 'Recommendation not found.');
    }
    if (rec.loggedMealId) {
      throw new AppError('CONFLICT', 'This recommendation has already been logged.', {
        loggedMealId: rec.loggedMealId,
      });
    }
    const localDate =
      typeof req.body?.localDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.localDate)
        ? (req.body.localDate as string)
        : localToday();

    const mealLog: MealLog = {
      id: newId('ml'),
      userId: user.id,
      type: 'mealLog',
      mealType: rec.mealType,
      items: [
        {
          name: rec.name,
          grams: 0,
          kcal: rec.kcal,
          proteinG: rec.proteinG,
          carbsG: rec.carbsG,
          fatG: rec.fatG,
        },
      ],
      totalKcal: rec.kcal,
      totalProteinG: rec.proteinG,
      totalCarbsG: rec.carbsG,
      totalFatG: rec.fatG,
      source: 'recommendation',
      loggedAt: nowIso(),
      localDate,
    };
    await upsertDoc('logs', mealLog);

    rec.loggedMealId = mealLog.id;
    await upsertDoc('ai', rec);

    res.status(201).json({ mealLog, recommendation: rec });
  }),
);

// ---------------------------------------------------------------------------

recommendationsRouter.post(
  '/:id/feedback',
  asyncHandler(async (req, res) => {
    const user = getUser(req);
    const rec = await byIdDoc<MealRecommendation>('ai', req.params.id as string);
    if (!rec || rec.type !== 'recommendation' || rec.userId !== user.id) {
      throw new AppError('NOT_FOUND', 'Recommendation not found.');
    }
    const parsed = recommendationFeedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_FAILED', 'feedback must be "up" or "down".', {
        issues: parsed.error.issues,
      });
    }
    rec.feedback = parsed.data.feedback;
    await upsertDoc('ai', rec);
    res.json({ recommendation: rec });
  }),
);
