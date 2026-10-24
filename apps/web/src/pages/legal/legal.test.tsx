// @vitest-environment jsdom
/**
 * These pages make binding statements, so the assertions here are about
 * honesty rather than layout:
 *
 *  - while operator details are missing, every page must SAY it is a draft,
 *    because a legal document that looks finished and is not is the worst
 *    possible failure mode for this file;
 *  - the retention periods quoted must match the constants the server enforces;
 *  - the disclosures the project's own privacy review made mandatory before
 *    launch (the Open Food Facts barcode transfer) must be present;
 *  - every recipient the code sends data to is named, with the country, as
 *    the Australian Privacy Principles require.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  DEFAULT_SUPPORT_EMAIL,
  FREE_TIER_DAILY_CREDITS,
  MEMORY_REJECTED_RETENTION_DAYS,
  PREMIUM_TIER_DAILY_CREDITS,
  RANGES,
} from '@aquazerofit/shared';

const mocks = vi.hoisted(() => ({ isTMA: vi.fn(() => false) }));
vi.mock('../../lib/telegram', () => ({ isTMA: mocks.isTMA }));

import PrivacyPage from './Privacy';
import GooglePlayPrivacyPage from './GooglePlayPrivacy';
import TermsPage from './Terms';
import SupportPage from './Support';
import AccountDeletionPage from './AccountDeletion';
import RefundPage from './Refund';
import { isPublished, OPERATOR } from './operator';
import { marketingRoute } from '../../lib/site';

function renderAt(path: string, element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={element} />
        <Route path="/welcome" element={<p>mini app welcome</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.isTMA.mockReturnValue(false);
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => null,
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('legal pages', () => {
  it('declare themselves a draft until every operator fact is supplied', () => {
    // Guard the guard: if this ever fails, the pages are publishable and the
    // draft assertions below need revisiting deliberately, not deleted.
    expect(isPublished()).toBe(false);

    for (const [path, element] of [
      ['/privacy', <PrivacyPage key="p" />],
      ['/google-play/privacy-policy', <GooglePlayPrivacyPage key="gp" />],
      ['/terms', <TermsPage key="t" />],
      ['/refund', <RefundPage key="r" />],
      ['/support', <SupportPage key="s" />],
      ['/account/deletion', <AccountDeletionPage key="d" />],
    ] as const) {
      renderAt(path, element);
      expect(screen.getByText(/draft: not yet in force/i)).toBeTruthy();
      cleanup();
    }
  });

  it('marks a missing operator fact visibly rather than leaving a blank', () => {
    // Retargeted when the nine facts already in force on the live deployment
    // were ported into OPERATOR. The guarantee is unchanged - an unsupplied
    // fact must render as a conspicuous marker rather than a silent gap that
    // reads like a finished sentence - but it now has to be asserted against a
    // field that is genuinely still null, or it proves nothing.
    expect(OPERATOR.aiProvidersVerifiedOn).toBeNull();
    renderAt('/privacy', <PrivacyPage />);

    expect(screen.getAllByText(/\[date provider terms last verified\]/i).length).toBeGreaterThan(0);
  });

  it('renders the supplied operator facts, so the notice reads as prose', () => {
    // This is the reason the file exists: a build from this repo must reproduce
    // the notice actually in force at https://aquazerofit.com, which is the
    // privacy policy URL submitted to Google Play. If these revert to
    // placeholders, that URL starts serving a draft.
    renderAt('/privacy', <PrivacyPage />);

    expect(screen.getAllByText(/LUMINARA DIGITAL PTY LTD/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\[operator legal name\]/i)).toBeNull();
  });
});

describe('privacy notice', () => {
  it('quotes retention periods the server actually enforces', () => {
    renderAt('/privacy', <PrivacyPage />);

    expect(screen.getByText(`${MEMORY_REJECTED_RETENTION_DAYS} days, then erased.`)).toBeTruthy();
    expect(screen.getByText(/24 hours after the analysis finishes/i)).toBeTruthy();
    expect(screen.getByText(/30 days, then purged automatically/i)).toBeTruthy();
  });

  it('discloses the Open Food Facts barcode transfer', () => {
    // Required before launch by docs/research/security-privacy-review.md §6.
    renderAt('/privacy', <PrivacyPage />);

    expect(screen.getAllByText(/Open Food Facts/).length).toBeGreaterThan(0);
    expect(screen.getByText(/scanned that product/i)).toBeTruthy();
  });

  it('states the minimum age the profile accepts', () => {
    renderAt('/privacy', <PrivacyPage />);

    expect(
      screen.getByText(new RegExp(`accepts ages from\\s+${RANGES.age.min}`, 'i')),
    ).toBeTruthy();
  });

  it('names the hosting the API actually runs on', () => {
    // deploy/cloudrun/service.yaml: Cloud Run and Cloud SQL in
    // australia-southeast1. The live build still said Replit in the US.
    renderAt('/privacy', <PrivacyPage />);

    expect(screen.getAllByText(/Australia \(Google Cloud, Sydney\)/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Replit/)).toBeNull();
  });

  it('lists every outbound integration with what reaches it and where', () => {
    // One row per integration the code calls out to. A provider wired into
    // the API or the Android build without a row here is an undisclosed
    // recipient.
    renderAt('/privacy', <PrivacyPage />);
    const table = screen.getByRole('table', { name: 'Third parties' });

    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Recipient', 'Why', 'What reaches them', 'Where processed']);
    for (const recipient of [
      'Google Cloud',
      'Cloudflare',
      OPERATOR.aiProviders?.join(', ') ?? '',
      'Resend',
      'Stripe',
      'Google Play',
      'Firebase (Google)',
      'Telegram',
      'Open Food Facts',
    ]) {
      const row = within(table).getByRole('rowheader', { name: recipient }).closest('tr');
      expect(row?.querySelectorAll('td')).toHaveLength(3);
    }
  });

  it('states the APP 8 overseas disclosure, naming the countries', () => {
    const { container } = renderAt('/privacy', <PrivacyPage />);
    const overseas = container.querySelector('section#overseas') as HTMLElement;

    expect(within(overseas).getByText(/Australian Privacy Principle 8/)).toBeTruthy();
    expect(within(overseas).getByText(/Privacy Act 1988/)).toBeTruthy();
    for (const country of ['United States', 'Japan', 'France']) {
      expect(within(overseas).getByText(new RegExp(`^${country}:`))).toBeTruthy();
    }
  });

  it('gives the OAIC complaint path and the response time', () => {
    renderAt('/privacy', <PrivacyPage />);

    expect(screen.getByText(/Office of the Australian Information Commissioner/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'oaic.gov.au' }).getAttribute('href')).toBe(
      'https://www.oaic.gov.au',
    );
    expect(screen.getAllByText(/within 30 days/).length).toBeGreaterThan(0);
  });

  it('points at the export that exists instead of denying there is one', () => {
    renderAt('/privacy', <PrivacyPage />);

    expect(screen.getByText(/Settings → Export my data \(JSON\)/)).toBeTruthy();
    expect(screen.queryByText(/no automated export/i)).toBeNull();
  });
});

/**
 * Play Console declares /google-play/privacy-policy as the listing's policy
 * URL. It must stay crawlable and must carry the same disclosures as /privacy,
 * not a lighter copy of them.
 */
describe('Google Play privacy policy', () => {
  it('is published at the URL declared in Play Console', () => {
    expect(marketingRoute('/google-play/privacy-policy')?.title).toMatch(/google play privacy policy/i);
  });

  it('frames itself for the Play listing', () => {
    renderAt('/google-play/privacy-policy', <GooglePlayPrivacyPage />);

    expect(screen.getByRole('heading', { level: 1, name: /google play privacy policy/i })).toBeTruthy();
    expect(screen.getByText(/privacy policy for the Google Play listing/i)).toBeTruthy();
  });

  it('carries the same disclosures as the privacy notice', () => {
    renderAt('/google-play/privacy-policy', <GooglePlayPrivacyPage />);

    expect(screen.getByText(`${MEMORY_REJECTED_RETENTION_DAYS} days, then erased.`)).toBeTruthy();
    expect(screen.getByText(/24 hours after the analysis finishes/i)).toBeTruthy();
    expect(screen.getAllByText(/Open Food Facts/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Australian Privacy Principle 8/)).toBeTruthy();
    expect(screen.getAllByText(/LUMINARA DIGITAL PTY LTD/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\[operator legal name\]/i)).toBeNull();
  });
});

/**
 * Play requires a public URL where an account can be deleted without the app
 * installed, and requires it to state what deletion actually does. These
 * assertions are against the semantics in apps/api/src/modules/me/service.ts -
 * two steps, a 30-day grace period, an anonymised remainder - because a page
 * that describes a different flow than the code runs is the failure mode this
 * requirement exists to prevent.
 */
describe('account deletion page', () => {
  it('gives the in-app route and the browser route', () => {
    renderAt('/account/deletion', <AccountDeletionPage />);

    expect(screen.getAllByText(/Settings/).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: /deleting from a browser/i })).toBeTruthy();
  });

  it('describes the two-step deletion and the grace period the server enforces', () => {
    renderAt('/account/deletion', <AccountDeletionPage />);

    expect(screen.getByText(/30-day grace period starts/i)).toBeTruthy();
    expect(screen.getByText(/erased immediately/i)).toBeTruthy();
    expect(screen.getByText(/every six hours/i)).toBeTruthy();
  });

  it('says what survives deletion, and links the retention table', () => {
    const { container } = renderAt('/account/deletion', <AccountDeletionPage />);

    expect(screen.getAllByText(/anonymised/i).length).toBeGreaterThan(0);
    expect(container.querySelector('a[href="/privacy#retention"]')).toBeTruthy();
  });

  it('offers the export before the irreversible step', () => {
    renderAt('/account/deletion', <AccountDeletionPage />);

    expect(screen.getByText(/Export my data/)).toBeTruthy();
  });
});

describe('terms of use', () => {
  it('separates the software licence from the service terms', () => {
    renderAt('/terms', <TermsPage />);

    expect(screen.getByText(/governs the/i)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /the software licence/i })).toBeTruthy();
  });

  it('describes the payments the code actually takes', () => {
    renderAt('/terms', <TermsPage />);

    expect(screen.getByText(/subscription billed by Stripe/i)).toBeTruthy();
    expect(screen.getByText(/sold in Telegram Stars/i)).toBeTruthy();
    expect(screen.getAllByText(/\/paysupport/).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /refund page/i }).getAttribute('href')).toBe('/refund');
    expect(screen.getAllByText(DEFAULT_SUPPORT_EMAIL).length).toBeGreaterThan(0);
    expect(
      screen.getByText(new RegExp(`${PREMIUM_TIER_DAILY_CREDITS} credits each day`, 'i')),
    ).toBeTruthy();
    expect(
      screen.getByText(new RegExp(`${FREE_TIER_DAILY_CREDITS} credits each day`, 'i')),
    ).toBeTruthy();
    // The price lives on Stripe's price object, and there is no Customer Portal
    // session in the billing code. Neither belongs in the terms.
    expect(screen.queryByText(/9\.99/)).toBeNull();
    expect(screen.queryByText(/customer portal/i)).toBeNull();
    expect(screen.queryByText(/no payment provider/i)).toBeNull();
    expect(screen.queryByText(/credits are not sold/i)).toBeNull();
  });
});

describe('refund page', () => {
  it('is a real page, with the support email and /paysupport', () => {
    renderAt('/refund', <RefundPage />);

    expect(screen.getByRole('heading', { level: 1, name: /^refunds$/i })).toBeTruthy();
    expect(screen.getAllByText(DEFAULT_SUPPORT_EMAIL).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\/paysupport/).length).toBeGreaterThan(0);
    expect(screen.getByText(/sold in Telegram Stars/i)).toBeTruthy();
    expect(screen.getByText('A Stars refund is done by support on request.')).toBeTruthy();
    expect(screen.getByText(/subscription billed by Stripe/i)).toBeTruthy();
    expect(screen.queryByText(/full refund/i)).toBeNull();
    expect(screen.queryByText(/14 days/i)).toBeNull();
    expect(screen.queryByText(/customer portal/i)).toBeNull();
  });

  it('is a route in the app, so /refund does not fall through to the home page', async () => {
    const { default: App } = await import('../../App');
    render(
      <MemoryRouter initialEntries={['/refund']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { level: 1, name: /^refunds$/i })).toBeTruthy();
  });

  it('is listed for the prerendered shell, at the slashless path', () => {
    expect(marketingRoute('/refund')?.path).toBe('/refund');
    expect(marketingRoute('/refund')?.summary).toContain(DEFAULT_SUPPORT_EMAIL);
    expect(marketingRoute('/refund/')?.path).toBe('/refund');
  });
});

describe('support page', () => {
  it('leads with the crisis signpost', () => {
    const { container } = renderAt('/support', <SupportPage />);

    const sections = [...container.querySelectorAll('main section[id]')].map((s) => s.id);
    expect(sections[0]).toBe('urgent');
    expect(screen.getByText(/contact Lifeline/i)).toBeTruthy();
  });

  it('sends a Telegram Mini App visitor to the welcome carousel', () => {
    mocks.isTMA.mockReturnValue(true);
    renderAt('/support', <SupportPage />);

    expect(screen.getByText('mini app welcome')).toBeTruthy();
  });
});
