// @vitest-environment jsdom
/**
 * Gift a Round in the Mini App (AZF-P1 US-G1, §6.1): hidden wherever it
 * cannot work, a fixed price stated before paying, and the recipient's note.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { FightCampStatus, SquadMemberView } from '@aquazerofit/shared';
import { campWith, recordWith, renderWithClient } from './testUtils';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  canPayWithStars: vi.fn(() => true),
  openStarsInvoice: vi.fn(async () => 'paid' as const),
}));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  api: mocks.api,
}));
vi.mock('@/lib/telegram', async (original) => ({
  ...(await original<typeof import('@/lib/telegram')>()),
  canPayWithStars: mocks.canPayWithStars,
  openStarsInvoice: mocks.openStarsInvoice,
}));

import { GiftButton, GiftReceived, useGiftPrice } from './Gift';
import { ApiError } from '@/lib/api';

afterEach(() => {
  cleanup();
  mocks.api.mockReset();
  mocks.openStarsInvoice.mockClear();
  mocks.canPayWithStars.mockReturnValue(true);
});

const RIZAL: SquadMemberView = {
  ref: 'm_bbbbbbbbbbbb',
  displayName: 'Rizal',
  isMe: false,
  role: 'member',
  beltTier: 'white',
  weekActiveDays: 4,
  cheeredToday: false,
  welcome: false,
};

function serveCamp(gifting: FightCampStatus['gifting'], invoice?: () => unknown) {
  mocks.api.mockImplementation(async (path: string) => {
    if (path === '/fight-record') return { fightRecord: recordWith(), fightCamp: campWith({ gifting }) };
    if (path === '/gifts/premium/invoice') return invoice ? invoice() : { invoiceLink: 'https://t.me/$gift' };
    return null;
  });
}

function PriceProbe() {
  const price = useGiftPrice();
  return <p>{price === null ? 'no gifting' : `price ${price}`}</p>;
}

describe('useGiftPrice', () => {
  it('offers gifting only with the part on and a client that can pay in Stars', async () => {
    serveCamp({ stars: 150, received: null });
    renderWithClient(<PriceProbe />);
    expect(await screen.findByText('price 150')).toBeTruthy();
    cleanup();

    mocks.canPayWithStars.mockReturnValue(false);
    renderWithClient(<PriceProbe />);
    await waitFor(() => expect(mocks.api).toHaveBeenCalled());
    expect(await screen.findByText('no gifting')).toBeTruthy();
    cleanup();

    mocks.canPayWithStars.mockReturnValue(true);
    serveCamp(null);
    renderWithClient(<PriceProbe />);
    expect(await screen.findByText('no gifting')).toBeTruthy();
  });
});

describe('GiftButton', () => {
  it('states the fixed price and what they get, then pays through a Stars invoice', async () => {
    serveCamp({ stars: 150, received: null });
    renderWithClient(<GiftButton member={RIZAL} stars={150} />);
    fireEvent.click(screen.getByRole('button', { name: 'Gift Rizal a week of Premium' }));
    expect(screen.getByText('7 days of Premium, from when you pay')).toBeTruthy();
    expect(screen.getByText('150 Stars')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Gift terms' }).getAttribute('href')).toBe('/terms#gifts');
    fireEvent.click(screen.getByRole('button', { name: 'Gift for 150 Stars' }));
    await waitFor(() => expect(mocks.openStarsInvoice).toHaveBeenCalledWith('https://t.me/$gift'));
    expect(mocks.api).toHaveBeenCalledWith('/gifts/premium/invoice', { method: 'POST', body: { to: RIZAL.ref } });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Gift for 150 Stars' })).toBeNull());
  });

  it('says why when the server refuses', async () => {
    serveCamp({ stars: 150, received: null }, () => {
      throw new ApiError(409, {
        code: 'CONFLICT',
        message: 'They already have Premium, so a gift would not add anything right now.',
        details: { reason: 'recipient_has_premium' },
      });
    });
    renderWithClient(<GiftButton member={RIZAL} stars={150} />);
    fireEvent.click(screen.getByRole('button', { name: 'Gift Rizal a week of Premium' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gift for 150 Stars' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/already have Premium/);
    expect(mocks.openStarsInvoice).not.toHaveBeenCalled();
  });
});

describe('GiftReceived', () => {
  it('tells the recipient who gifted them the week', async () => {
    serveCamp({ stars: 150, received: { fromName: 'Mia', grantedAt: '2026-10-29T09:00:00.000Z' } });
    renderWithClient(<GiftReceived />);
    expect((await screen.findByText(/gifted you a week of Premium/)).textContent).toBe('Mia gifted you a week of Premium.');
  });
});
