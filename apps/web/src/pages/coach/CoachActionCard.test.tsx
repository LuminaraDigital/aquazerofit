// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoachActionCard } from './CoachActionCard';
import { CoachConsentCard } from './CoachConsentCard';
import type { ChatActionDraft, CoachAction } from '@aquazerofit/shared';

afterEach(cleanup);

const draftOf = (action: CoachAction): ChatActionDraft => ({
  id: 'cad_1',
  userId: 'usr_1',
  type: 'chatActionDraft',
  sessionId: 'cs_1',
  action,
  sourceText: '',
  localDate: '2026-10-30',
  status: 'proposed',
  loggedId: null,
  createdAt: '2026-10-30T00:00:00.000Z',
  updatedAt: '2026-10-30T00:00:00.000Z',
});

describe('CoachActionCard', () => {
  it('says what a rebuild replaces and costs before the user commits', () => {
    render(
      <CoachActionCard
        draft={draftOf({ kind: 'rebuildPlan', daysPerWeek: 4, focus: 'weightLoss' })}
        pending={false}
        onConfirm={() => undefined}
        onDismiss={() => undefined}
      />,
    );
    expect(screen.getByText(/4 days a week, weight loss focus/)).toBeTruthy();
    expect(screen.getByText(/replaces your current plan and uses up to 5 credits/)).toBeTruthy();
  });

  it('says the app picks the replacement', () => {
    render(
      <CoachActionCard
        draft={draftOf({ kind: 'swapExercise', sessionId: 's', exerciseId: 'e', exerciseName: 'Squat' })}
        pending={false}
        onConfirm={() => undefined}
        onDismiss={() => undefined}
      />,
    );
    expect(screen.getByText(/We choose a replacement/)).toBeTruthy();
  });

  it('confirms and dismisses separately', () => {
    const onConfirm = vi.fn();
    const onDismiss = vi.fn();
    render(
      <CoachActionCard
        draft={draftOf({ kind: 'logWater', amountMl: 500 })}
        pending={false}
        onConfirm={onConfirm}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByText('Not this'));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Log it'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe('CoachConsentCard', () => {
  it('asks first and leaves the decision to the user', () => {
    const onAllow = vi.fn();
    const onDecline = vi.fn();
    render(<CoachConsentCard coachName="Akin" pending={false} onAllow={onAllow} onDecline={onDecline} />);

    expect(screen.getByText(/sent to our AI providers/)).toBeTruthy();
    expect(onAllow).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Not now'));
    expect(onDecline).toHaveBeenCalledOnce();
    expect(onAllow).not.toHaveBeenCalled();
  });
});
