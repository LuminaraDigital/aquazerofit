/**
 * Fixtures shared by the Fight Camp component suites. Each suite mocks
 * `@/lib/api` itself (vi.mock is hoisted per file) and passes its mock here.
 */
import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import {
  BELT_LADDER,
  seasonTheme,
  type FightCampStatus,
  type FightRecordStatus,
  type Season,
} from '@aquazerofit/shared';
import type { Mock } from 'vitest';

export const SEASON: Season = {
  id: 'season-3',
  number: 3,
  name: 'Second Wind',
  startsOn: '2027-03-01',
  endsOn: '2027-04-25',
};

export function recordWith(overrides: Partial<FightRecordStatus> = {}): FightRecordStatus {
  return {
    current: { season: SEASON, activeDays: 14, daysLeft: 23, tier: 'blue', next: BELT_LADDER[2]! },
    ladder: BELT_LADDER,
    belts: [],
    celebrate: null,
    adult: true,
    emojiStatus: { available: false, enabled: false },
    ...overrides,
  };
}

export function campWith(overrides: Partial<FightCampStatus> = {}): FightCampStatus {
  return {
    theme: seasonTheme(SEASON.number),
    enrolment: null,
    grace: null,
    ...overrides,
  };
}

type Handler = (body: unknown, method: string) => unknown;

/**
 * Route the mocked api by path. `/fight-record` answers the envelope; any
 * other path answers its handler, or null.
 */
export function serve(
  api: Mock,
  envelope: { fightRecord: FightRecordStatus | null; fightCamp?: FightCampStatus | null },
  routes: Record<string, Handler> = {},
): void {
  api.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
    if (path === '/fight-record') {
      return envelope.fightCamp === undefined
        ? { fightRecord: envelope.fightRecord }
        : { fightRecord: envelope.fightRecord, fightCamp: envelope.fightCamp };
    }
    const handler = routes[path];
    return handler ? handler(options?.body, options?.method ?? 'GET') : null;
  });
}

export function renderWithClient(node: ReactNode, initialPath = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}
