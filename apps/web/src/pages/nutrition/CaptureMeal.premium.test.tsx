// @vitest-environment jsdom
/**
 * A free account that photographs a meal gets the premium refusal and a way
 * to the plan page. Other upload failures stay on the existing toast.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '@/lib/api';

const api = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api };
});

vi.mock('@/lib/compressPhoto', () => ({
  compressPhoto: async (file: File) => file,
}));

import CaptureMeal from './CaptureMeal';

function renderCapture() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CaptureMeal />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function choosePhoto() {
  const input = screen.getByLabelText('Choose a meal photo from your library');
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'lunch.jpg', { type: 'image/jpeg' });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByRole('button', { name: /analyze meal/i });
}

beforeEach(() => {
  api.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('meal photo premium gate', () => {
  it('shows the server refusal and a link to Your plan', async () => {
    api.mockRejectedValue(
      new ApiError(403, {
        code: 'FORBIDDEN',
        message: 'This feature is part of AquaZeroFit Premium.',
      }),
    );
    renderCapture();
    await choosePhoto();
    fireEvent.click(screen.getByRole('button', { name: /analyze meal/i }));

    expect(await screen.findByText('This feature is part of AquaZeroFit Premium.')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Your plan' });
    expect(link.getAttribute('href')).toBe('/plan');
  });

  it('does not offer the plan link for an ordinary upload failure', async () => {
    api.mockRejectedValue(new ApiError(500, { code: 'INTERNAL', message: 'Internal server error' }));
    renderCapture();
    await choosePhoto();
    fireEvent.click(screen.getByRole('button', { name: /analyze meal/i }));

    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: 'Your plan' })).toBeNull();
    expect(screen.queryByText('This feature is part of AquaZeroFit Premium.')).toBeNull();
  });
});
