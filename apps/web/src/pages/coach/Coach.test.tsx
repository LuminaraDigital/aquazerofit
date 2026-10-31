// @vitest-environment jsdom
/**
 * The confirmed proposal must leave the screen for good. The list of pending
 * drafts is cached, so clearing local state alone let the effect that
 * rehydrates a proposal put the logged meal straight back.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ChatMealDraft } from './mealDraft';

const mealDraft = {
  id: 'cmd_1',
  sourceText: 'I had rice',
  mealType: 'lunch',
  localDate: '2026-10-30',
  status: 'proposed',
  items: [
    {
      id: 'it-1',
      phrase: 'rice',
      spokenName: 'rice',
      quantity: 1,
      unit: 'serving',
      status: 'resolved',
      suggestedFoodId: 'food-rice',
      matches: [
        {
          foodId: 'food-rice',
          name: 'Rice',
          grams: 100,
          gramsBasis: 'defaultServing',
          servingLabel: '1 cup',
          score: 100,
          kcal: 130,
          proteinG: 2.7,
          carbsG: 28,
          fatG: 0.3,
          allergenConflicts: [],
        },
      ],
    },
  ],
  notes: [],
  allergyCheck: 'applied',
  loggedMealId: null,
} as unknown as ChatMealDraft;

const state = vi.hoisted(() => ({ pending: [] as unknown[], actions: [] as unknown[] }));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  api: vi.fn(async (path: string) => {
    if (path === '/chat/meal-drafts') return { drafts: state.pending };
    if (path === '/chat/action-drafts') return { drafts: state.actions };
    if (path === '/analytics/nutrition/daily') return { kcalConsumed: 0, kcalTarget: 0, meals: {}, waterMl: { consumed: 0 } };
    if (path === '/chat/sessions') return { sessions: [{ id: 'cs_1', title: 'Chat', updatedAt: '2026-10-30T00:00:00Z' }] };
    if (path.startsWith('/chat/sessions/')) return { session: {}, messages: [] };
    if (path.startsWith('/coaches')) return { roster: [], activeCoachId: 'aqua' };
    if (path.endsWith('/confirm')) {
      state.pending = [];
      // Slow enough that the screen renders once with the cached list.
      await Promise.resolve();
      return { mealLog: { totalKcal: 130 } };
    }
    return {};
  }),
}));

afterEach(cleanup);

describe('Coach', () => {
  it('does not bring a confirmed meal back from the cached list', async () => {
    window.HTMLElement.prototype.scrollIntoView = () => undefined;
    window.matchMedia = (() => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
    state.pending = [mealDraft];
    const { default: Coach } = await import('./Coach');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Coach />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Log meal' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Log meal' })).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('button', { name: 'Log meal' })).toBeNull();
  });
});
