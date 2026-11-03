// @vitest-environment jsdom
/**
 * When recognition falls back, the capture and analysis screens say so.
 * A degraded job must not present the offline food list as a recognition.
 */
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { VisionJob } from '@aquazerofit/shared';
import { AI_DEGRADED_NOTICE, AI_DEGRADED_STORAGE_KEY } from './AiDegradedNotice';

const api = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api };
});

import AnalysisResults from './AnalysisResults';
import CaptureMeal from './CaptureMeal';

function job(overrides: Partial<VisionJob> = {}): VisionJob {
  return {
    id: 'job-1',
    userId: 'user-1',
    type: 'cvJob',
    status: 'succeeded',
    imagePath: '/tmp/meal.jpg',
    mealType: 'breakfast',
    predictions: [
      {
        name: 'Kangaroo Fillet (grilled)',
        foodId: 'food-kangaroo-fillet',
        estimatedGrams: 150,
        confidence: 0.9,
        kcal: 177,
        proteinG: 36.9,
        carbsG: 0,
        fatG: 3.3,
        matched: true,
      },
    ],
    ai: {
      provider: 'mock',
      model: 'mock-visionPrimary',
      promptVersion: '1.3.0',
      generatedAt: '2026-10-24T00:00:00.000Z',
      degraded: true,
    },
    aiDegraded: true,
    createdAt: '2026-10-24T00:00:00.000Z',
    ...overrides,
  };
}

function renderAt(path: string, element: ReactElement, state?: { aiDegraded?: boolean }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[{ pathname: path, state }]}>
        <Routes>
          <Route path={path} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  api.mockReset();
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe('degraded meal-photo notice', () => {
  it('shows the notice on analysis and hides fallback foods', async () => {
    api.mockResolvedValue({ job: job() });
    renderAt('/nutrition/analysis/:jobId', <AnalysisResults />);

    expect((await screen.findByTestId('ai-degraded-notice')).textContent).toBe(AI_DEGRADED_NOTICE);
    expect(screen.queryByDisplayValue('Kangaroo Fillet (grilled)')).toBeNull();
    expect(screen.getByText(/No items on the list/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: /looks right, log it/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(sessionStorage.getItem(AI_DEGRADED_STORAGE_KEY)).toBe('1');
  });

  it('keeps a real recognition free of the notice', async () => {
    api.mockResolvedValue({
      job: job({
        aiDegraded: false,
        ai: {
          provider: 'groq',
          model: 'qwen/qwen3.8-27b',
          promptVersion: '1.3.0',
          generatedAt: '2026-10-24T00:00:00.000Z',
          degraded: false,
        },
        predictions: [
          {
            name: 'Chicken Breast (grilled)',
            foodId: 'food-chicken-breast',
            estimatedGrams: 120,
            confidence: 0.9,
            kcal: 198,
            proteinG: 37.2,
            carbsG: 0,
            fatG: 4.3,
            matched: true,
          },
        ],
      }),
    });
    renderAt('/nutrition/analysis/:jobId', <AnalysisResults />);

    expect(await screen.findByDisplayValue('Chicken Breast (grilled)')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('ai-degraded-notice')).toBeNull());
    expect(sessionStorage.getItem(AI_DEGRADED_STORAGE_KEY)).toBeNull();
  });

  it('shows the notice on capture when analysis sent the user back', () => {
    renderAt('/nutrition/capture', <CaptureMeal />, { aiDegraded: true });
    expect(screen.getByTestId('ai-degraded-notice').textContent).toBe(AI_DEGRADED_NOTICE);
  });

  it('shows the notice on capture when the session flag is set', () => {
    sessionStorage.setItem(AI_DEGRADED_STORAGE_KEY, '1');
    renderAt('/nutrition/capture', <CaptureMeal />);
    expect(screen.getByTestId('ai-degraded-notice').textContent).toBe(AI_DEGRADED_NOTICE);
  });
});
