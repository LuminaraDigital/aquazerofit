// @vitest-environment jsdom
/**
 * With every Fight Camp flag off, the screens Fight Camp extends render
 * exactly what they rendered before it existed (AZF-P1 §10.2 DoD).
 *
 * The snapshot files were recorded by running this same file on the commits
 * Fight Camp was built on, 6a80efd and then origin/staging at 1732a90 (same
 * output), against the API's own responses from those commits
 * (apps/api/src/__tests__/__snapshots__/flagsOff.api.json):
 * no `fightCamp` block, so every Fight Camp addition must render nothing.
 * React's generated ids are the only thing normalised, since a component
 * added anywhere in the tree renumbers them without changing the page.
 *
 * Self-contained on purpose: it must run unchanged on the old commit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const here = path.dirname(fileURLToPath(import.meta.url));
const recorded = JSON.parse(
  fs.readFileSync(path.resolve(here, '../../../api/src/__tests__/__snapshots__/flagsOff.api.json'), 'utf8'),
) as Record<string, unknown> & { exported: { user: Record<string, unknown> } };

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  api: mocks.api,
}));

import Dashboard from './dashboard/Dashboard';
import FightRecordPage from './fightRecord/FightRecord';
import NotificationSettings from './settings/NotificationSettings';

beforeAll(async () => {
  // The dashboard's chart is lazy: load it first, so a busy machine cannot
  // snapshot the page before it arrives.
  await import('./dashboard/Sparkline');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-18T10:00:00.000Z'));
  mocks.api.mockImplementation(async (route: string) => {
    if (route === '/fight-record') return recorded.fightRecordOn;
    if (route === '/progress/summary') return recorded.progressSummary;
    if (route === '/coaches/progression') return recorded.progression;
    if (route === '/me') return { user: recorded.exported.user };
    return null;
  });
});

afterEach(() => cleanup());

afterAll(() => {
  vi.useRealTimers();
});

async function settled(node: ReactNode, at: string): Promise<string> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[at]}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
  // Settled: nothing fetching and the markup unchanged for three quiet
  // turns. A fixed wait is not enough when the whole suite runs at once.
  let previous = '';
  let quiet = 0;
  for (let turn = 0; turn < 200 && quiet < 3; turn += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    const html = container.innerHTML;
    quiet = client.isFetching() === 0 && html === previous ? quiet + 1 : 0;
    previous = html;
  }
  // One tag per line, so a failure reads as a diff of the elements that changed.
  return `${previous.replace(/:r[0-9a-z]+:/g, ':r:').replace(/></g, '>\n<')}\n`;
}

describe('every Fight Camp flag off', () => {
  it.each([
    ['dashboard', () => <Dashboard />, '/'],
    ['fight-record', () => <FightRecordPage />, '/fight-record'],
    ['notification-settings', () => <NotificationSettings />, '/settings/notifications'],
  ] as const)('renders %s exactly as before Fight Camp', async (name, page, at) => {
    await expect(await settled(page(), at)).toMatchFileSnapshot(`./__snapshots__/flagsOff.${name}.html`);
  });
});
