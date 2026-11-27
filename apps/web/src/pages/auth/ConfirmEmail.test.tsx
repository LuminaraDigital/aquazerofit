// @vitest-environment jsdom
/**
 * The page the confirmation mail links to. It spends a single-use token, so
 * it must post exactly once, and it must tell the person what happened in
 * each case the API can answer.
 */
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => vi.fn());
vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api')>()),
  api,
}));
vi.mock('../../lib/seo', () => ({ useNoIndex: () => undefined }));

import { ApiError } from '../../lib/api';
import ConfirmEmail from './ConfirmEmail';

function renderAt(url: string) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[url]}>
        <ConfirmEmail />
      </MemoryRouter>
    </StrictMode>,
  );
}

afterEach(() => {
  cleanup();
  api.mockReset();
});

describe('ConfirmEmail', () => {
  it('posts the token once and confirms', async () => {
    api.mockResolvedValue({ message: 'ok' });
    renderAt('/confirm-email?token=tok-123456789');

    expect(await screen.findByText('Email confirmed')).toBeTruthy();
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith('/auth/email-confirm', {
      method: 'POST',
      body: { token: 'tok-123456789' },
      auth: false,
    });
  });

  it('explains an address someone else now holds', async () => {
    api.mockRejectedValue(new ApiError(409, { code: 'CONFLICT', message: 'taken' }));
    renderAt('/confirm-email?token=tok-123456789');
    expect(await screen.findByText(/already used by another account/)).toBeTruthy();
  });

  it('explains a used or expired link', async () => {
    api.mockRejectedValue(new ApiError(400, { code: 'VALIDATION_FAILED', message: 'expired' }));
    renderAt('/confirm-email?token=tok-123456789');
    expect(await screen.findByText(/invalid or has expired/)).toBeTruthy();
  });

  it('sends nothing without a token', () => {
    renderAt('/confirm-email');
    expect(screen.getByText(/invalid or has expired/)).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
  });
});
