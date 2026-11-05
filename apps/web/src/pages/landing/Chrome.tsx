/**
 * Shared chrome for the public marketing surface (landing page + /features).
 *
 * Kept in one place deliberately: the moment a second marketing route exists,
 * a copied header and footer start drifting - different nav items, a stale
 * copyright line, one CTA updated and the other not. Both pages render these.
 */
import { Link } from 'react-router-dom';
import { SOURCE_CODE_URL, WELLNESS_DISCLAIMER } from '@aquazerofit/shared';
import { getAttribution } from '../../lib/attribution';
import { ANDROID_PLAY_STORE_URL, isAndroidMobileBrowser } from '../../lib/challenges';
import { trackGrowth } from '../../lib/growth';
import { telegramAppUrl } from '../../lib/telegramLink';
import { useScrollProgress } from './motion';

/** In-page sections of the landing route. */
export const NAV_LINKS = [
  { href: '#calculator', label: 'Targets' },
  { href: '#screens', label: 'Screens' },
  { href: '#features', label: 'How it works' },
  { href: '#coach', label: 'Coach' },
  { href: '#safety', label: 'Safety' },
];

/**
 * Footer "Product" column. Listed explicitly rather than derived from
 * NAV_LINKS: some entries are dedicated routes and some are sections of the
 * landing page, and a filter that silently decides which is which is how one
 * ends up linking a page to its own summary.
 */
const FOOTER_PRODUCT: Array<{ label: string; to?: string; href?: string }> = [
  { label: 'Features', to: '/features' },
  { label: 'How it works', to: '/how-it-works' },
  { label: 'Aqua Coach', to: '/aqua-coach' },
  { label: 'Safety', to: '/safety' },
  { label: 'Android app', to: '/google-play' },
  { label: 'Screens', href: '#screens' },
  { label: 'Sign in', to: '/sign-in' },
];

/**
 * Anchors only resolve on the landing route itself; from any other page they
 * have to travel there first.
 *
 * The target is `/`, which now serves the marketing page in place for
 * signed-out web visitors. It used to be `/landing`, because `/` redirected
 * there and a <Navigate> drops the fragment - everyone clicking "Safety" from
 * /features arrived at the top of the page instead. Serving marketing at `/`
 * removed the redirect, and with it that bug.
 */
function sectionHref(href: string, onLanding: boolean): string {
  return onLanding ? href : `/${href}`;
}

const CTA_BASE =
  'inline-flex items-center justify-center gap-2 rounded-[14px] px-6 min-h-[52px] text-[15px] font-semibold transition-[background-color,border-color,transform] duration-150 ease-out active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

function ctaStyles(variant: 'primary' | 'ghost'): string {
  return variant === 'primary'
    ? 'bg-primary text-on-primary hover:bg-[rgb(170_241_255)]'
    : 'border border-on-surface/20 text-on-surface hover:border-on-surface/40 hover:bg-on-surface/[0.04]';
}

export function CtaButton({
  to,
  children,
  variant = 'primary',
  onClick,
}: {
  to: string;
  children: React.ReactNode;
  variant?: 'primary' | 'ghost';
  onClick?: () => void;
}) {
  return (
    <Link to={to} onClick={onClick} className={`${CTA_BASE} ${ctaStyles(variant)}`}>
      {children}
    </Link>
  );
}

/**
 * The conversion button: hand the visitor to the Mini App.
 *
 * A plain `<a>` rather than a router Link, because the destination is another
 * origin entirely - this is the one control on the marketing site whose job is
 * to leave it.
 *
 * The href is built at render from stored attribution, so whatever brought the
 * visitor here (a ref code, a UTM campaign, a huddle invite) is encoded into
 * the deep link and survives into the Mini App. Without that the landing page
 * would convert people into untracked direct traffic and appear, in the
 * numbers, to convert nobody.
 */
export function TelegramCta({
  children,
  variant = 'primary',
  placement,
  className = '',
}: {
  children?: React.ReactNode;
  variant?: 'primary' | 'ghost';
  /** Which CTA on the page this is - the only way to tell them apart later. */
  placement: string;
  className?: string;
}) {
  return (
    <a
      href={telegramAppUrl(getAttribution())}
      onClick={() => void trackGrowth('telegram_cta_clicked', { placement })}
      /* No `target="_blank"`: on mobile the link hands off to the Telegram app
         and a new tab would leave a dead one behind; on desktop t.me handles
         its own handoff. `rel` is still set because the destination is
         cross-origin. */
      rel="noreferrer noopener"
      data-variant={variant}
      className={`${CTA_BASE} ${ctaStyles(variant)} ${className}`}
    >
      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
        send
      </span>
      {children ?? 'Open in Telegram'}
    </a>
  );
}

/**
 * The Google Play listing, shown as Google's own "Get it on Google Play" badge.
 * Google's brand rules require the official artwork unaltered; the file in
 * public/ is that badge with only its transparent margin trimmed, so it sits on
 * the same 52px line as the other calls to action.
 */
export function PlayStoreBadge({ placement }: { placement: string }) {
  return (
    <a
      href={ANDROID_PLAY_STORE_URL}
      onClick={() => void trackGrowth('play_store_cta_clicked', { placement })}
      rel="noreferrer noopener"
      className="inline-flex shrink-0 rounded-[9px] transition-transform active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <img
        src="/google-play-badge.png"
        alt="Get it on Google Play"
        width={564}
        height={168}
        decoding="async"
        className="h-[52px] w-auto"
      />
    </a>
  );
}

/**
 * The hero and closing calls to action on the landing page. Telegram leads for
 * everyone except visitors already on an Android phone, for whom the native
 * app is the shorter path, so the Play badge moves in front and Telegram steps
 * down to the outlined style. `note` sits under the buttons it explains.
 */
export function AppCtas({
  placement,
  centered = false,
  note,
}: {
  placement: string;
  centered?: boolean;
  note?: React.ReactNode;
}) {
  const android = isAndroidMobileBrowser();
  const badge = <PlayStoreBadge placement={placement} />;
  return (
    <div className={`flex flex-col gap-4 ${centered ? 'items-center' : 'items-start'}`}>
      {android && badge}
      <div className={`flex w-full flex-col gap-3 sm:flex-row ${centered ? 'sm:justify-center' : ''}`}>
        <TelegramCta placement={placement} variant={android ? 'ghost' : 'primary'} />
        <WebFallbackLink placement={placement} />
      </div>
      {note}
      {!android && badge}
    </div>
  );
}

/**
 * The browser path, for the segment whose network or workplace blocks
 * Telegram. It is a real, complete route into the same product - not a
 * consolation prize - and it is tracked separately so that segment shows up in
 * the funnel instead of bouncing silently.
 */
export function WebFallbackLink({
  children,
  placement,
  variant = 'ghost',
}: {
  children?: React.ReactNode;
  placement: string;
  variant?: 'primary' | 'ghost';
}) {
  return (
    <CtaButton
      to="/sign-in?mode=register"
      variant={variant}
      onClick={() => void trackGrowth('web_fallback_clicked', { placement })}
    >
      {children ?? 'Use it in your browser'}
    </CtaButton>
  );
}

export function TopBar({ onLanding = false }: { onLanding?: boolean }) {
  const progress = useScrollProgress();

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="glass-blur border-b border-on-surface/[0.06]">
        <nav
          className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-5 sm:px-8"
          aria-label="Primary"
        >
          <Link to="/" className="flex min-h-[44px] items-center gap-2.5">
            {/* Fixed top bar - in the viewport from the first paint. */}
            <img
              src="/logo.png"
              alt=""
              width={359}
              height={376}
              loading="eager"
              decoding="async"
              className="h-8 w-8 object-contain"
              aria-hidden="true"
            />
            <span className="font-heading text-lg font-extrabold tracking-tight text-primary">
              AquaZeroFit
            </span>
          </Link>

          <ul className="hidden items-center gap-7 lg:flex">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={sectionHref(link.href, onLanding)}
                  className="inline-block py-3 text-sm text-on-surface-variant transition-colors duration-150 hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <Link
              to="/sign-in"
              className="hidden rounded-xl px-4 py-2 text-sm font-semibold text-on-surface-variant transition-colors hover:text-primary sm:inline-flex focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Sign in
            </Link>
            <a
              href={telegramAppUrl(getAttribution())}
              onClick={() => void trackGrowth('telegram_cta_clicked', { placement: 'topbar' })}
              rel="noreferrer noopener"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[12px] bg-primary px-4 text-[14px] font-semibold text-on-primary transition-[background-color,transform] duration-150 ease-out hover:bg-[rgb(170_241_255)] active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                send
              </span>
              Open in Telegram
            </a>
          </div>
        </nav>
      </div>
      {/* Reading progress */}
      <div
        className="h-px origin-left bg-primary/70"
        style={{ transform: `scaleX(${progress})` }}
        aria-hidden="true"
      />
    </header>
  );
}

export function Footer({ onLanding = false }: { onLanding?: boolean }) {
  return (
    <footer className="border-t border-white/5 pt-12">
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            {/* Footer sits below a long landing page - defer it. */}
            <img
              src="/logo.png"
              alt=""
              width={359}
              height={376}
              loading="lazy"
              decoding="async"
              className="h-8 w-8 object-contain"
              aria-hidden="true"
            />
            <span className="font-heading text-lg font-extrabold tracking-tight text-primary">
              AquaZeroFit
            </span>
          </div>
          <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-on-surface-variant">
            {WELLNESS_DISCLAIMER}
          </p>
        </div>

        <div>
          <h2 className="text-[13px] font-semibold text-on-surface">
            Product
          </h2>
          <ul className="mt-2 text-[15px] text-on-surface-variant">
            {FOOTER_PRODUCT.map((item) => (
              <li key={item.label}>
                {item.to ? (
                  <Link to={item.to} className="inline-block py-1.5 transition-colors duration-150 hover:text-primary">
                    {item.label}
                  </Link>
                ) : (
                  <a
                    href={sectionHref(item.href!, onLanding)}
                    className="inline-block py-1.5 transition-colors duration-150 hover:text-primary"
                  >
                    {item.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-[13px] font-semibold text-on-surface">
            Legal
          </h2>
          <ul className="mt-2 text-[15px] text-on-surface-variant">
            {[
              { to: '/privacy', label: 'Privacy notice' },
              { to: '/google-play/privacy-policy', label: 'Google Play privacy policy' },
              { to: '/terms', label: 'Terms of use' },
              { to: '/refund', label: 'Refunds' },
              { to: '/support', label: 'Support' },
            ].map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="inline-block py-1.5 transition-colors duration-150 hover:text-primary">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-[13px] font-semibold text-on-surface">
            Project
          </h2>
          <ul className="mt-2 text-[15px] text-on-surface-variant">
            <li>
              <a
                href={SOURCE_CODE_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-block py-1.5 transition-colors duration-150 hover:text-primary"
              >
                Source code
              </a>
            </li>
            <li>
              <a
                href={`${SOURCE_CODE_URL}/blob/main/LICENSE`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-block py-1.5 transition-colors duration-150 hover:text-primary"
              >
                Licence (AGPL v3)
              </a>
            </li>
            <li>
              <a
                href={`${SOURCE_CODE_URL}/blob/main/SECURITY.md`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-block py-1.5 transition-colors duration-150 hover:text-primary"
              >
                Report a vulnerability
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-12 flex flex-col gap-3 border-t border-white/5 py-8 text-[12px] text-on-surface-variant sm:flex-row sm:items-center sm:justify-between">
        <p>Copyright (C) 2026 AquaZero. Free software under the GNU AGPL v3.</p>
        <p>General wellness support only</p>
      </div>
    </footer>
  );
}
