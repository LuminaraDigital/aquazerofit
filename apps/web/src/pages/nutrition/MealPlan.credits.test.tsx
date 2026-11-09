// @vitest-environment jsdom
/**
 * An account out of credits sees why the meal plan is empty and a way to the
 * plan page, not a Retry button that cannot succeed until the daily grant.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '@/lib/api';

const api = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api };
});

import MealPlan from './MealPlan';

function renderWith(recommendationError: ApiError) {
  api.mockImplementation((path: string) =>
    path === '/recommendations/meals' ? Promise.reject(recommendationError) : new Promise(() => {}),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MealPlan />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('meal plan credit refusal', () => {
  it('explains the empty slots and links to Your plan', async () => {
    renderWith(new ApiError(402, { code: 'CREDITS_INSUFFICIENT', message: 'Out of credits.' }));

    expect(await screen.findAllByText(/Out of AI credits for today/)).toHaveLength(4);
    const links = screen.getAllByRole('link', { name: 'Your plan' });
    expect(links[0]?.getAttribute('href')).toBe('/plan');
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('keeps Retry for an ordinary failure', async () => {
    renderWith(new ApiError(500, { code: 'INTERNAL', message: 'Internal server error' }));

    expect(await screen.findAllByRole('button', { name: 'Retry' })).toHaveLength(4);
    expect(screen.queryByRole('link', { name: 'Your plan' })).toBeNull();
  });
});
