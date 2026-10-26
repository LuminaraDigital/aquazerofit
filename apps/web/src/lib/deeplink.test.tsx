// @vitest-environment jsdom
/**
 * Launch deep links. `startapp=plan` and `startapp=upgrade` have to open the
 * plan screen: that is the only way a Telegram Mini App smoke can reach Stars
 * checkout without depending on a weekly-insight card that empty Progress
 * does not render. Attribution payloads must keep launching on Home.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  startParam: null as string | null,
}));

vi.mock('@/lib/telegram', () => ({
  getTelegramStartParam: () => mocks.startParam,
}));

import { handleDeepLink, useDeepLinkRouter } from './deeplink';

function LaunchListener() {
  const navigate = useNavigate();
  useDeepLinkRouter((path) => navigate(path, { replace: true }));
  return null;
}

function renderLaunch(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/"
          element={
            <>
              <LaunchListener />
              <p>home</p>
            </>
          }
        />
        <Route path="/plan" element={<p>plan page</p>} />
        <Route path="/nutrition" element={<p>nutrition page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  mocks.startParam = null;
  window.history.replaceState({}, '', '/');
});

describe('plan launch actions', () => {
  it('routes startapp=plan to /plan', () => {
    const navigate = vi.fn();
    expect(handleDeepLink('plan', navigate)).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/plan');
  });

  it('routes startapp=upgrade to /plan', () => {
    const navigate = vi.fn();
    expect(handleDeepLink('upgrade', navigate)).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/plan');
  });

  it('treats Plan and UPGRADE as the same destination', () => {
    const navigate = vi.fn();
    expect(handleDeepLink('Plan', navigate)).toBe(true);
    expect(handleDeepLink('UPGRADE', navigate)).toBe(true);
    expect(navigate).toHaveBeenNthCalledWith(1, '/plan');
    expect(navigate).toHaveBeenNthCalledWith(2, '/plan');
  });

  it('leaves an attribution payload on its current screen', () => {
    const navigate = vi.fn();
    expect(handleDeepLink('r-abc__c-HELLO', navigate)).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('still routes an existing nutrition action', () => {
    const navigate = vi.fn();
    expect(handleDeepLink('log_meal_breakfast', navigate)).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/nutrition?action=add_meal&meal=breakfast');
  });
});

describe('launch listener', () => {
  it('opens /plan from a Telegram start_param of plan', async () => {
    mocks.startParam = 'plan';
    renderLaunch();
    await waitFor(() => expect(screen.getByText('plan page')).toBeTruthy());
  });

  it('opens /plan from a Telegram start_param of upgrade', async () => {
    mocks.startParam = 'upgrade';
    renderLaunch();
    await waitFor(() => expect(screen.getByText('plan page')).toBeTruthy());
  });

  it('opens /plan from a page URL of ?startapp=plan when Telegram has no payload', async () => {
    window.history.replaceState({}, '', '/?startapp=plan');
    renderLaunch();
    await waitFor(() => expect(screen.getByText('plan page')).toBeTruthy());
  });

  it('stays on home when the launch carried no plan action', async () => {
    mocks.startParam = 'r-abc';
    renderLaunch();
    await waitFor(() => expect(screen.getByText('home')).toBeTruthy());
    expect(screen.queryByText('plan page')).toBeNull();
  });
});
