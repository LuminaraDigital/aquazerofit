// @vitest-environment jsdom
/**
 * Guards the non-shaming contract of the progress surfaces. These are copy and
 * treatment assertions, not rendering trivia: the failure mode they exist to
 * catch (a reintroduced streak reset, a red zero, a "down is bad" colour) is a
 * product-safety regression, not a cosmetic one.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type {
  ConsistencyStatus,
  ProgressInsight,
  ReadinessAssessment,
} from '@aquazerofit/shared';
import { ConsistencyCard } from './ConsistencyCard';
import { ConsistencyChip } from './ConsistencyChip';
import { ReadinessChip } from './ReadinessChip';
import { WeeklyInsightCard } from './WeeklyInsightCard';
import { CONSISTENCY_GRACE_COPY, CONSISTENCY_STATE_COPY } from './consistencyCopy';

afterEach(cleanup);

/** Vocabulary that must never reach a user on these surfaces. */
const SHAMING = /streak|broke|broken|lost|miss(ed|ing)?|fail|fell off|slipped|only \d/i;

function status(overrides: Partial<ConsistencyStatus> = {}): ConsistencyStatus {
  return {
    currentDays: 3,
    bestDays: 12,
    activeDays: 18,
    windowDays: 28,
    graceRemaining: 1,
    state: 'building',
    lastActiveDate: '2026-08-04',
    ...overrides,
  };
}

describe('consistency vocabulary', () => {
  it('has no vocabulary of loss in any state', () => {
    for (const [state, copy] of Object.entries(CONSISTENCY_STATE_COPY)) {
      expect(`${state}: ${copy.label}`).not.toMatch(SHAMING);
      expect(`${state}: ${copy.body}`).not.toMatch(SHAMING);
      expect(copy.icon).not.toBe('local_fire_department');
    }
    expect(CONSISTENCY_GRACE_COPY).not.toMatch(SHAMING);
  });
});

describe('ConsistencyCard', () => {
  it('leads with active days over the window and demotes the current run', () => {
    render(<ConsistencyCard consistency={status()} />);

    expect(screen.getByText('18')).toBeTruthy();
    expect(screen.getByText('of the last 28 days')).toBeTruthy();
    // Current run is present, but only as supporting text.
    expect(screen.getByText('Current run 3 days')).toBeTruthy();
    // Past effort stays visible even though the current run is short.
    expect(screen.getByText('Best so far 12 days')).toBeTruthy();
  });

  it('never renders a bare zero when the window is empty', () => {
    const { container } = render(
      <ConsistencyCard consistency={status({ activeDays: 0, currentDays: 0, state: 'resting' })} />,
    );

    expect(screen.queryByText('0')).toBeNull();
    expect(screen.getByText('Ready when you are')).toBeTruthy();
    // No current-run line at all rather than a run of zero.
    expect(container.textContent).not.toMatch(/current run/i);
    expect(container.textContent).not.toMatch(SHAMING);
  });

  it('reassures rather than warns when grace has absorbed a day', () => {
    const { container } = render(
      <ConsistencyCard consistency={status({ graceRemaining: 0, currentDays: 5 })} />,
    );

    expect(screen.getByText(CONSISTENCY_GRACE_COPY)).toBeTruthy();
    expect(container.querySelectorAll('.text-coral, .text-error')).toHaveLength(0);
  });

  it('welcomes a return without implying the user fell off', () => {
    const { container } = render(
      <ConsistencyCard consistency={status({ state: 'recovering', currentDays: 1 })} />,
    );

    expect(screen.getByText('Back at it')).toBeTruthy();
    expect(container.textContent).not.toMatch(SHAMING);
  });
});

describe('ConsistencyChip', () => {
  it('shows the window figure with a spoken label and no flame', () => {
    const { container } = render(<ConsistencyChip consistency={status()} />);

    expect(screen.getByRole('img', { name: /18 active days in the last 28 days/i })).toBeTruthy();
    expect(screen.getByText('18/28')).toBeTruthy();
    expect(container.textContent).not.toMatch(/local_fire_department/);
  });
});

describe('WeeklyInsightCard', () => {
  const insight: ProgressInsight = {
    id: 'i1',
    userId: 'u1',
    type: 'progressInsight',
    periodStart: '2026-07-27',
    periodDays: 7,
    stats: {
      deltaKg: -0.4,
      weighInsCount: 3,
      streakDays: 3,
      workoutsCompleted: 2,
      avgKcalVsTarget: 1.02,
      waterAdherencePct: 80,
      periodDays: 7,
    },
    changes: [
      { metric: 'weight', direction: 'down', delta: -0.4, label: 'Weight moved 0.4 kg lower.' },
      { metric: 'workouts', direction: 'up', delta: 1, label: 'One more session than last week.' },
    ],
    narrative: 'You logged on most days this week. That is the part that compounds.',
    ai: {
      provider: 'insightBatch',
      model: 'insightBatch',
      promptVersion: '1',
      generatedAt: '2026-08-03T00:00:00.000Z',
    },
    createdAt: '2026-08-03T00:00:00.000Z',
  };

  it('leads with the narrative and treats direction as neutral, not valence', () => {
    const { container } = render(<WeeklyInsightCard insight={insight} />);

    expect(screen.getByText(insight.narrative)).toBeTruthy();
    expect(screen.getByText('Weight moved 0.4 kg lower.')).toBeTruthy();
    // Neither an up nor a down row may be coloured as good or bad.
    expect(container.querySelectorAll('.text-coral, .text-secondary, .text-error')).toHaveLength(0);
  });

  it('stays quiet rather than showing an error when the endpoint is absent', () => {
    const { container } = render(<WeeklyInsightCard insight={null} />);
    expect(container.textContent).toBe('');
  });

  it('adds no footnote to a new user’s encouraging narrative', () => {
    const { container } = render(
      <WeeklyInsightCard
        insight={{
          ...insight,
          changes: [],
          narrative: 'Keep logging — a couple more days and this fills in.',
          ai: { ...insight.ai, model: 'insufficient-data' },
        }}
      />,
    );

    expect(container.textContent).not.toMatch(/premium|personalisation/i);
  });

  it('keeps the insight visible above a free-tier note rather than gating it', () => {
    render(
      <MemoryRouter>
        <WeeklyInsightCard
          insight={{ ...insight, ai: { ...insight.ai, model: 'premium-required-fallback' } }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(insight.narrative)).toBeTruthy();
    expect(screen.getByText('Weight moved 0.4 kg lower.')).toBeTruthy();
    expect(screen.getByText(/comes with premium/i)).toBeTruthy();
  });

  it('offers a quiet route to the consent setting when personalisation is off', () => {
    render(
      <MemoryRouter>
        <WeeklyInsightCard
          insight={{ ...insight, ai: { ...insight.ai, model: 'consent-off-fallback' } }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(insight.narrative)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe(
      '/settings#privacy-consents',
    );
  });
});

describe('ReadinessChip', () => {
  const protect: ReadinessAssessment = {
    mode: 'protect',
    score: 22,
    signals: [{ label: 'Sleep', detail: 'Fewer logged nights than usual.' }],
    headline: 'This week is built lighter, on purpose.',
    volumeMultiplier: 0.6,
    periodDays: 7,
  };

  it('renders protect supportively, with no alert treatment', () => {
    const { container } = render(<ReadinessChip readiness={protect} />);

    expect(screen.getByText('Protect week')).toBeTruthy();
    expect(screen.getByText(protect.headline)).toBeTruthy();
    expect(
      container.querySelectorAll('.text-coral, .text-error, .bg-error, .bg-coral'),
    ).toHaveLength(0);
    expect(container.textContent).not.toMatch(/warning|alert|caution/i);
  });

  it('renders however many signals arrive, without padding the list', () => {
    render(
      <ReadinessChip
        readiness={{
          mode: 'maintain',
          score: 57,
          signals: [{ label: 'History', detail: 'Not enough history yet — starting steady.' }],
          headline: 'Holding this week steady while we learn your rhythm.',
          volumeMultiplier: 1,
          periodDays: 7,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('expands to show its working', () => {
    render(<ReadinessChip readiness={protect} />);

    const toggle = screen.getByRole('button');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Fewer logged nights than usual.')).toBeTruthy();
  });
});
