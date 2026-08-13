// @vitest-environment jsdom
/**
 * REGRESSION GUARD — a render throw must degrade to a contained error panel,
 * never a blank page. Before the boundary existed, a single component throw
 * (a cache-shape bug in the workout library) unmounted the entire tree.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Bomb({ defused }: { defused?: boolean }) {
  if (!defused) throw new Error('boom');
  return <div>page content</div>;
}

afterEach(cleanup);

describe('ErrorBoundary', () => {
  it('contains a render throw and shows the error panel', () => {
    // React logs the throw even when a boundary catches it — keep test output clean.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary resetKey="/workouts">
        <Bomb />
      </ErrorBoundary>,
    );
    spy.mockRestore();

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText(/something went wrong/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /try again/i })).toBeDefined();
  });

  it('recovers when the route changes (resetKey)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const view = render(
      <ErrorBoundary resetKey="/workouts">
        <Bomb />
      </ErrorBoundary>,
    );
    spy.mockRestore();
    expect(screen.getByRole('alert')).toBeDefined();

    // Navigating away swaps both the key and the children — the crashed
    // screen must not follow the user to the next tab.
    view.rerender(
      <ErrorBoundary resetKey="/progress">
        <Bomb defused />
      </ErrorBoundary>,
    );

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('page content')).toBeDefined();
  });

  it('renders children untouched when nothing throws', () => {
    render(
      <ErrorBoundary resetKey="/">
        <Bomb defused />
      </ErrorBoundary>,
    );
    expect(screen.getByText('page content')).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
