// @vitest-environment jsdom
/**
 * These pages make binding statements, so the assertions here are about
 * honesty rather than layout:
 *
 *  - the documents are published: no page carries the draft banner or a
 *    bracketed placeholder, because https://aquazerofit.com/privacy and
 *    /google-play/privacy-policy are declared in Play Console;
 *  - the draft machinery still works, so a fact that goes back to null is
 *    marked conspicuously instead of leaving a blank that reads as finished;
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
vi.mock('../../lib/telegram', () => ({ isTMA: mocks.isTMA, getTelegramStartParam: () => null }));

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
  const ALL_PAGES = () =>
    [
      ['/privacy', <PrivacyPage key="p" />],
      ['/google-play/privacy-policy', <GooglePlayPrivacyPage key="gp" />],
      ['/terms', <TermsPage key="t" />],
      ['/refund', <RefundPage key="r" />],
      ['/support', <SupportPage key="s" />],
      ['/account/deletion', <AccountDeletionPage key="d" />],
    ] as const;

  it('are published: no draft banner and no bracketed placeholder on any page', () => {
    expect(isPublished()).toBe(true);

    for (const [path, element] of ALL_PAGES()) {
      const { container } = renderAt(path, element);
      expect(screen.queryByText(/draft: not yet in force/i), path).toBeNull();
      // A Fact with no value renders as "[hint]". Any bracketed lower-case
      // phrase in the text is one of those, or a hand-written placeholder.
      expect(container.textContent?.match(/\[[a-z][a-z ,]*\]/g) ?? [], path).toEqual([]);
      expect(container.textContent, path).not.toMatch(/relied upon|legal review|working draft/i);
      cleanup();
    }
  });

  it('falls back to the draft banner and a visible marker if a fact is ever removed', () => {
    // Guard the guard. The pages are published, but a fact reverting to null
    // must still render as a conspicuous marker under the draft banner rather
    // than a silent gap that reads like a finished sentence.
    const saved = OPERATOR.aiProvidersVerifiedOn;
    OPERATOR.aiProvidersVerifiedOn = null;
    try {
      expect(isPublished()).toBe(false);
      renderAt('/privacy', <PrivacyPage />);
      expect(screen.getByText(/draft: not yet in force/i)).toBeTruthy();
      expect(screen.getAllByText(/\[date provider terms last verified\]/i).length).toBeGreaterThan(0);
    } finally {
      OPERATOR.aiProvidersVerifiedOn = saved;
    }
    expect(isPublished()).toBe(true);
  });

  it('states when the AI providers\' terms were last verified', () => {
    renderAt('/privacy', <PrivacyPage />);

    expect(OPERATOR.aiProvidersVerifiedOn).toBe('4 November 2026');
    expect(screen.getByText(/last verified those terms on/i).textContent).toContain(
      '4 November 2026',
    );
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
    // Backups and request logs: the production region, australia-southeast1
    // (cloudbuild.yaml _REGION, deploy/cloudrun/service.yaml Cloud SQL
    // instance). Three places in the notice state it.
    expect(OPERATOR.backupRegion).toMatch(/australia-southeast1/);
    expect(screen.getAllByText(/australia-southeast1/, { exact: false })).toHaveLength(3);
    expect(screen.queryByText(/\[backup and log locations\]/)).toBeNull();
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
      'Google Fonts',
      'Telegram',
      'Open Food Facts',
    ]) {
      const row = within(table).getByRole('rowheader', { name: recipient }).closest('tr');
      expect(row?.querySelectorAll('td')).toHaveLength(3);
    }
    const firebase = within(table).getByRole('rowheader', { name: 'Firebase (Google)' });
    expect(firebase.closest('tr')?.textContent).toMatch(/email address and password/);
    // Four columns overflow at 320px; the card scrolls, so it must take focus.
    expect(table.closest('[role="region"]')?.getAttribute('tabindex')).toBe('0');
  });

  it('discloses the Health Connect reads and the microphone, as Play requires', () => {
    // HealthConnectManager.permissions: READ_STEPS, READ_HEART_RATE,
    // READ_SLEEP, READ_TOTAL_CALORIES_BURNED. Play's Health Connect review
    // checks the privacy policy names them and states Limited Use.
    renderAt('/google-play/privacy-policy', <GooglePlayPrivacyPage />);
    const hc = screen.getByText(/Health Connect, if you connect it/).textContent ?? '';
    for (const type of ['steps', 'heart rate', 'sleep', 'total calories burned']) {
      expect(hc).toContain(type);
    }
    expect(hc).toMatch(/not sent to our servers, not shared with anyone/);
    expect(screen.getByText(/Limited Use requirements/)).toBeTruthy();
    // createSpeechRecognizer, not createOnDeviceSpeechRecognizer: the policy
    // must not claim the audio stays on the device.
    expect(screen.getByText(/may process the audio off the device/)).toBeTruthy();
    expect(screen.getByText(/We never record, receive or store audio/)).toBeTruthy();
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
    // The response time is the operator's commitment, rendered from OPERATOR,
    // never a figure written into the page.
    expect(OPERATOR.privacyResponseTime).toBe('within 30 days');
    expect(screen.getAllByText(/within 30 days/, { exact: false })).toHaveLength(2);
    expect(screen.queryByText(/\[privacy response time\]/)).toBeNull();
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

  it('is prerendered with its substance visible without JavaScript', () => {
    // Play Console declares this URL, and Google's check may not run the SPA.
    // The prerendered shell's <noscript> carries the steps, the timeline and
    // what is erased and kept; this keeps that copy agreeing with the page.
    const route = marketingRoute('/account/deletion');
    expect(route?.noscriptSections?.length).toBeGreaterThan(0);
    const noscript = route!.noscriptSections!.flatMap((section) => section.items).join('\n');
    expect(noscript).toMatch(/Settings, choose “Delete account”, and confirm/);
    expect(noscript).toMatch(/any web browser, without the app installed/);
    expect(noscript).toMatch(/erased automatically after 30 days/);
    expect(noscript).toContain(OPERATOR.privacyEmail!);

    const { container } = renderAt('/account/deletion', <AccountDeletionPage />);
    const page = container.textContent ?? '';
    for (const sentence of [
      'Your account is flagged and erased automatically after 30 days. Confirming a second time within that window erases it immediately.',
      'Signing in on the web or in the Android app cancels a pending deletion. Opening the Telegram Mini App does not.',
      'Deletion removes your profile, logs, plans, coach conversations, remembered facts and any meal photographs still on disk.',
      'Credit and security-audit records survive, with your identity stripped out of them.',
      'Your account record, sign-in credentials and any linked Telegram identity.',
    ]) {
      expect(noscript).toContain(sentence);
      expect(page).toContain(sentence);
    }
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
