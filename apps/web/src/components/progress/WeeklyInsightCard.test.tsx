// @vitest-environment jsdom
/**
 * REGRESSION GUARD — adding an upgrade route gave the premium footnote
 * somewhere to point, and that is exactly the change that tends to turn a
 * footnote into a paywall.
 *
 * The rule this file defends, stated in the component's own header: the weekly
 * insight is never gated, blurred, teased or truncated behind the CTA. A user
 * who cannot pay still gets their full narrative and every "what changed" line.
 * The link is a footnote below the content, and it stays one.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ProgressInsight } from '@aquazerofit/shared';
import { WeeklyInsightCard } from './WeeklyInsightCard';

const NARRATIVE =
  'You logged on five of the last seven days and finished three sessions, which is steady work. ' +
  'Your intake sat close to target across the week. Hydration is the one place with room to move.';

function insightWith(model: string): ProgressInsight {
  return {
    id: 'pi_1',
    userId: 'u_1',
    type: 'progressInsight',
    periodStart: '2026-07-27',
    periodDays: 7,
    stats: {
      deltaKg: -0.4,
      weighInsCount: 3,
      streakDays: 5,
      workoutsCompleted: 3,
      avgKcalVsTarget: 1.02,
      waterAdherencePct: 68,
      periodDays: 7,
    },
    changes: [
      { metric: 'weight', direction: 'down', delta: -0.4, label: 'Weight moved 0.4 kg this week.' },
      { metric: 'workouts', direction: 'up', delta: 1, label: 'One more session than last week.' },
      { metric: 'hydration', direction: 'steady', delta: 0, label: 'Hydration held at 68% of target.' },
    ],
    narrative: NARRATIVE,
    ai: {
      provider: 'deterministic',
      model,
      promptVersion: 'n/a',
      generatedAt: '2026-08-03T06:00:00.000Z',
    },
    createdAt: '2026-08-03T06:00:00.000Z',
  };
}

function renderCard(model: string) {
  return render(
    <MemoryRouter>
      <WeeklyInsightCard insight={insightWith(model)} />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('free tier sees the whole insight, not a teaser', () => {
  it('renders the full narrative and every change when the premium note is unavailable', () => {
    const { container } = renderCard('premium-required-fallback');

    // The narrative in full — not clipped, not summarised, not an excerpt.
    expect(screen.getByText(NARRATIVE)).toBeTruthy();

    for (const change of insightWith('premium-required-fallback').changes) {
      expect(screen.getByText(change.label)).toBeTruthy();
    }
    expect(container.querySelectorAll('li')).toHaveLength(3);

    // No visual gate over the content the user is entitled to.
    expect(container.querySelector('[class*="blur"]')).toBeNull();
    expect(container.querySelector('[class*="line-clamp"]')).toBeNull();
    expect(container.querySelector('[aria-hidden="true"] p')).toBeNull();
  });

  it('links to the plan page from a footnote that sits below the insight', () => {
    const { container } = renderCard('premium-required-fallback');

    const link = screen.getByRole('link', { name: /your plan/i });
    expect(link.getAttribute('href')).toBe('/plan');

    // Footnote, not header: the CTA follows the narrative in document order.
    const narrative = screen.getByText(NARRATIVE);
    expect(
      narrative.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe('other fallback reasons', () => {
  it('sends the consent-off note straight to the consent controls', () => {
    renderCard('consent-off-fallback');

    expect(screen.getByText(NARRATIVE)).toBeTruthy();
    expect(screen.getByRole('link', { name: /settings/i }).getAttribute('href')).toBe(
      '/settings#privacy-consents',
    );
  });

  it('adds no footnote at all on an empty week', () => {
    renderCard('insufficient-data');

    expect(screen.getByText(NARRATIVE)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
