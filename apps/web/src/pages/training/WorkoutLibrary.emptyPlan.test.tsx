// @vitest-environment jsdom
/**
 * A new account has no plan and no session today. The weekly strip already
 * says so and offers to generate one; the "today" hero used to repeat the same
 * card and the same button underneath it, two identical calls to action on one
 * screen (seen in the Mini App during release testing).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WorkoutLibrary from './WorkoutLibrary';

vi.mock('@/lib/api', () => ({
  tokenStore: { isAuthenticated: true },
  // No plan and no session today: the API answers null for both.
  api: vi.fn(async (path: string) => (path.startsWith('/exercises') ? { items: [], total: 0 } : null)),
  mediaUrl: (src: string) => src,
  ApiError: class ApiError extends Error {
    code = 'NOT_FOUND';
    status = 404;
  },
}));

afterEach(cleanup);

describe('workouts with no plan', () => {
  it('offers to generate a plan once', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <WorkoutLibrary />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('No training plan yet')).toBeTruthy();
    expect(screen.getAllByText('No training plan yet')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /generate my plan/i })).toHaveLength(1);
    // No empty "Today's workout" region left for a screen reader to land on.
    expect(screen.queryByRole('region', { name: "Today's workout" })).toBeNull();
  });
});
