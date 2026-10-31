// @vitest-environment jsdom
/**
 * Tab and sub-screen changes inside the Mini App must open at the top.
 * The previous screen's scroll offset used to come along for the ride.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { ScrollToTop } from './ScrollToTop';

function Jump() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/progress')}>
      Open progress
    </button>
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Jump />} />
        <Route path="/progress" element={<p>progress page</p>} />
        <Route path="/settings" element={<p>settings page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ScrollToTop', () => {
  it('clears a carried scroll offset when the route changes', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    renderAt('/');
    scrollTo.mockClear();
    document.documentElement.scrollTop = 480;

    fireEvent.click(screen.getByRole('button', { name: 'Open progress' }));

    expect(screen.getByText('progress page')).toBeTruthy();
    expect(document.documentElement.scrollTop).toBe(0);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
  });
});
