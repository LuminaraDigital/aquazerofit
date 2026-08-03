/**
 * /foods — cached nutrition database search (AQF-07 §3.2). Source identifier
 * is carried on every record (AQF-12).
 */
import { Router } from 'express';
import { z } from 'zod';
import { MAX_PAGE_LIMIT, type Food } from '@aquazerofit/shared';
import { requireAuth } from '../../platform/auth';
import { AppError, asyncHandler } from '../../platform/errors';
import { getStore } from '../../platform/store';
import { findFoodByBarcode, isValidBarcode } from './service';

const querySchema = z.object({
  search: z.string().max(120).optional().default(''),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).optional().default(20),
});

/** Read-through cache; content changes only at publication (AQF-06 §5). */
const cache = new Map<string, { at: number; items: Food[] }>();
const CACHE_TTL_MS = 60_000;
/** Bound memory: FIFO-evict once the cache holds this many search keys. */
const CACHE_MAX_ENTRIES = 200;

function searchFoods(search: string, limit: number): Food[] {
  const key = `${search.toLowerCase()}::${limit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;

  const q = search.trim().toLowerCase();
  const foods = getStore().where<Food>('content', (d) => d.type === 'food');
  const items = foods
    .filter(
      (f) =>
        q.length === 0 ||
        f.name.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        (f.brand ?? '').toLowerCase().includes(q),
    )
    .sort((a, b) => {
      // Prefix matches first, then alphabetical — stable, predictable ranking.
      const aPrefix = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bPrefix = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return aPrefix - bPrefix || a.name.localeCompare(b.name);
    })
    .slice(0, limit);

  if (cache.size >= CACHE_MAX_ENTRIES) {
    // Simple FIFO eviction: Map preserves insertion order.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), items });
  return items;
}

export const foodsRouter = Router();
foodsRouter.use(requireAuth);

foodsRouter.get('/', (req, res) => {
  const { search, limit } = querySchema.parse(req.query);
  res.json({ items: searchFoods(search, limit) });
});

/**
 * Barcode lookup (Phase 4.2): segregated foodsOff mirror first, OFF product
 * API fallback with result caching. Returns the Food plus allergen flags
 * (best-effort; the deterministic allergen filter remains authoritative).
 * Mounted BEFORE /:id so the literal segment wins.
 */
foodsRouter.get(
  '/barcode/:code',
  asyncHandler(async (req, res) => {
    // String(): newer @types/express widens route params to string | string[].
    const code = String(req.params.code ?? '');
    if (!isValidBarcode(code)) {
      throw new AppError('VALIDATION_FAILED', 'Barcode must be a valid EAN-8 or EAN-13');
    }
    const result = await findFoodByBarcode(code);
    res.json({
      food: result.food,
      allergens: result.allergens,
      tracesAllergens: result.tracesAllergens,
      origin: result.origin,
    });
  }),
);

foodsRouter.get('/:id', (req, res) => {
  const food = getStore().byId<Food>('content', req.params.id);
  if (!food || food.type !== 'food') {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Food not found' });
    return;
  }
  res.json({ food });
});
