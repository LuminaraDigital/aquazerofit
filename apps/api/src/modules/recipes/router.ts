/**
 * /recipes — recipe library backing the meal-plan and recipe-detail screens.
 * Read-only content; per-serving macros are precomputed ingredient sums.
 */
import { Router } from 'express';
import { z } from 'zod';
import { MAX_PAGE_LIMIT, type Recipe } from '@aquazerofit/shared';
import { requireAuth } from '../../platform/auth';
import { AppError } from '../../platform/errors';
import { getStore } from '../../platform/store';

const querySchema = z.object({
  search: z.string().max(120).optional().default(''),
  tag: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).optional().default(50),
});

export const recipesRouter = Router();
recipesRouter.use(requireAuth);

recipesRouter.get('/', (req, res) => {
  const { search, tag, limit } = querySchema.parse(req.query);
  const q = search.trim().toLowerCase();
  const items = getStore()
    .where<Recipe>('content', (d) => d.type === 'recipe')
    .filter(
      (r) =>
        (!tag || r.tags.includes(tag)) &&
        (q.length === 0 ||
          r.name.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q))),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, limit);
  res.json({ items });
});

recipesRouter.get('/:id', (req, res) => {
  const recipe = getStore().byId<Recipe>('content', req.params.id);
  if (!recipe || recipe.type !== 'recipe') {
    throw new AppError('NOT_FOUND', 'Recipe not found');
  }
  res.json({ recipe });
});
