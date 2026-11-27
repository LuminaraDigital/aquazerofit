/**
 * Shared chrome for the public marketing surface (`/` + dedicated product routes).
 *
 * Uses Corner Card tokens (`rounded-xl` controls, `border-outline/80` >= 3:1
 * WCAG 1.4.11 interactive borders, solid opaque sticky bar with zero text bleed,
 * safe-area top inset, active route `aria-current="page"`, and a zero-re-render
 * `ScrollProgressRail`).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SOURCE_CODE_URL, WELLNESS_DISCLAIMER } from '@aquazerofit/shared';
import { getAttribution } from '../../lib/attribution';
import { ANDROID_PLAY_STORE_URL, isAndroidMobileBrowser } from '../../lib/challenges';
import { trackGrowth } from '../../lib/growth';
import { telegramAppUrl } from '../../lib/telegramLink';
import { ScrollProgressRail } from './motion';

/** In-page sections of the landing route. */
export const NAV_LINKS = [
  { href: '#calculator', label: 'Targets' },
  { href: '#screens', label: 'Screens' },
  { href: '#features', label: 'How it works' },
  { href: '#coach', label: 'Coach' },
  { href: '#safety', label: 'Safety' },
];

/** Dedicated product routes shown on sub-pages and the mobile nav drawer. */
const PRODUCT_ROUTES = [
  { to: '/features', label: 'Features' },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/aqua-coach', label: 'Aqua Coach' },
  { to: '/safety', label: 'Safety' },
  { to: '/google-play', label: 'Android' },
] as const;

const FOOTER_PRODUCT: Array<{ label: string; to?: string; href?: string }> = [
  { label: 'Features', to: '/features' },
  { label: 'How it works', to: '/how-it-works' },
  { label: 'Aqua Coach', to: '/aqua-coach' },
  { label: 'Safety', to: '/safety' },
  { label: 'Android app', to: '/google-play' },
  { label: 'Screens', href: '#screens' },
  { label: 'Sign in', to: '/sign-in' },
];

function sectionHref(href: string, onLanding: boolean): string {
  return onLanding ? href : `/${href}`;
}

const CTA_BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl px-5 min-h-[52px] text-[15px] font-semibold transition-[background-color,border-color,filter,transform] duration-150 ease-out active:scale-[0.97]';

function ctaStyles(variant: 'primary' | 'ghost'): string {
  return variant === 'primary'
    ? 'bg-primary-fixed-dim azf-cta-text hover:brightness-110'
    : 'border border-outline/80 text-on-surface hover:border-primary hover:bg-on-surface/[0.04]';
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

export function TelegramCta({
  children,
  variant = 'primary',
  placement,
  className = '',
}: {
  children?: React.ReactNode;
  variant?: 'primary' | 'ghost';
  placement: string;
  className?: string;
}) {
  return (
    <a
      href={telegramAppUrl(getAttribution())}
      onClick={() => void trackGrowth('telegram_cta_clicked', { placement })}
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

export function PlayStoreBadge({ placement }: { placement: string }) {
  return (
    <a
      href={ANDROID_PLAY_STORE_URL}
      onClick={() => void trackGrowth('play_store_cta_clicked', { placement })}
      rel="noreferrer noopener"
      className="inline-flex shrink-0 rounded-xl transition-transform active:scale-[0.97]"
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
  const { pathname } = useLocation();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const onGooglePlay = pathname === '/google-play';
  const telegramHref = useMemo(() => telegramAppUrl(getAttribution()), []);

  const closeMenu = () => {
    if (detailsRef.current) detailsRef.current.open = false;
    setMenuOpen(false);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (detailsRef.current) detailsRef.current.open = false;
      setMenuOpen(false);
      summaryRef.current?.focus();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (detailsRef.current && e.target instanceof Node && !detailsRef.current.contains(e.target)) {
        detailsRef.current.open = false;
        setMenuOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [menuOpen]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 pt-[env(safe-area-inset-top,0px)]">
      <div className="border-b border-outline-variant/60 bg-surface">
        <nav
          className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-2 px-3 sm:px-8"
          aria-label="Primary"
        >
          <Link to="/" className="flex min-h-[44px] shrink-0 items-center gap-1.5 sm:gap-2">
            <img
              src="/logo.png"
              alt=""
              width={359}
              height={376}
              loading="eager"
              decoding="async"
              className="h-6 w-6 object-contain sm:h-8 sm:w-8"
              aria-hidden="true"
            />
            <span className="font-heading text-[17px] font-bold tracking-[0.02em] text-primary sm:text-[20px]">
              AquaZeroFit
            </span>
          </Link>

          <ul className="hidden items-center gap-6 lg:flex">
            {onLanding
              ? NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <a
                      href={sectionHref(link.href, true)}
                      className="inline-flex min-h-[44px] items-center text-[14px] text-on-surface-variant transition-colors duration-150 hover:text-on-surface"
                    >
                      {link.label}
                    </a>
                  </li>
                ))
              : PRODUCT_ROUTES.map((route) => {
                  const active = pathname === route.to;
                  return (
                    <li key={route.to}>
                      <Link
                        to={route.to}
                        aria-current={active ? 'page' : undefined}
                        className={`inline-flex min-h-[44px] items-center text-[14px] transition-colors duration-150 ${
                          active
                            ? 'font-semibold text-primary'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        {route.label}
                      </Link>
                    </li>
                  );
                })}
          </ul>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <Link
              to="/sign-in"
              className="hidden min-h-[44px] items-center rounded-xl px-3.5 text-[14px] font-semibold text-on-surface-variant transition-colors hover:text-primary sm:inline-flex"
            >
              Sign in
            </Link>

            <a
              href={telegramHref}
              aria-label="Open in Telegram"
              onClick={() => void trackGrowth('telegram_cta_clicked', { placement: 'topbar' })}
              rel="noreferrer noopener"
              className={`inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 text-[13px] font-semibold transition-[background-color,border-color,filter,transform] duration-150 ease-out active:scale-[0.97] sm:px-4 sm:text-[14px] ${
                onGooglePlay
                  ? 'border border-outline/80 text-on-surface hover:border-primary'
                  : 'bg-primary-fixed-dim azf-cta-text hover:brightness-110'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                send
              </span>
              <span>
                <span className="max-[379px]:sr-only">Open in </span>Telegram
              </span>
            </a>

            {/* Mobile route menu (< lg) so phone visitors can reach every product page */}
            <details
              ref={detailsRef}
              onToggle={(e) => setMenuOpen(e.currentTarget.open)}
              className="relative lg:hidden"
            >
              <summary
                ref={summaryRef}
                aria-label="Navigation menu"
                className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-xl border border-outline/80 text-on-surface hover:border-primary [&::-webkit-details-marker]:hidden"
              >
                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                  menu
                </span>
              </summary>
              <div className="absolute right-0 mt-2 w-56 rounded-card border border-outline-variant/80 bg-surface-container p-2">
                <ul className="divide-y divide-outline-variant/40">
                  {PRODUCT_ROUTES.map((route) => {
                    const active = pathname === route.to;
                    return (
                      <li key={route.to}>
                        <Link
                          to={route.to}
                          onClick={closeMenu}
                          aria-current={active ? 'page' : undefined}
                          className={`flex min-h-[44px] items-center justify-between px-3 text-[14px] ${
                            active
                              ? 'font-semibold text-primary'
                              : 'text-on-surface hover:text-primary'
                          }`}
                        >
                          {route.label}
                        </Link>
                      </li>
                    );
                  })}
                  <li>
                    <Link
                      to="/sign-in"
                      onClick={closeMenu}
                      className="flex min-h-[44px] items-center px-3 text-[14px] font-semibold text-on-surface-variant hover:text-primary"
                    >
                      Sign in
                    </Link>
                  </li>
                </ul>
              </div>
            </details>
          </div>
        </nav>
      </div>
      <ScrollProgressRail />
    </header>
  );
}

export function Footer({ onLanding = false }: { onLanding?: boolean }) {
  return (
    <footer className="border-t border-outline-variant/50 pt-12">
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
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
            <span className="font-heading text-lg font-bold tracking-[0.02em] text-primary">
              AquaZeroFit
            </span>
          </div>
          <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-on-surface-variant">
            {WELLNESS_DISCLAIMER}
          </p>
        </div>

        <div>
          <h2 className="stat-label">Product</h2>
          <ul className="mt-2 text-[15px] text-on-surface-variant">
            {FOOTER_PRODUCT.map((item) => (
              <li key={item.label}>
                {item.to || !onLanding ? (
                  <Link
                    to={item.to ?? sectionHref(item.href!, false)}
                    className="inline-flex min-h-[44px] items-center transition-colors duration-150 hover:text-primary"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <a
                    href={item.href}
                    className="inline-flex min-h-[44px] items-center transition-colors duration-150 hover:text-primary"
                  >
                    {item.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="stat-label">Legal</h2>
          <ul className="mt-2 text-[15px] text-on-surface-variant">
            {[
              { to: '/privacy', label: 'Privacy notice' },
              { to: '/google-play/privacy-policy', label: 'Google Play privacy policy' },
              { to: '/terms', label: 'Terms of use' },
              { to: '/refund', label: 'Refunds' },
              { to: '/support', label: 'Support' },
            ].map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="inline-flex min-h-[44px] items-center transition-colors duration-150 hover:text-primary"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="stat-label">Project</h2>
          <ul className="mt-2 text-[15px] text-on-surface-variant">
            <li>
              <a
                href={SOURCE_CODE_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-h-[44px] items-center transition-colors duration-150 hover:text-primary"
              >
                Source code
              </a>
            </li>
            <li>
              <a
                href={`${SOURCE_CODE_URL}/blob/main/LICENSE`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-h-[44px] items-center transition-colors duration-150 hover:text-primary"
              >
                Licence (AGPL v3)
              </a>
            </li>
            <li>
              <a
                href={`${SOURCE_CODE_URL}/blob/main/SECURITY.md`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-h-[44px] items-center transition-colors duration-150 hover:text-primary"
              >
                Report a vulnerability
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-12 flex flex-col gap-3 border-t border-outline-variant/50 py-8 text-[12px] text-on-surface-variant sm:flex-row sm:items-center sm:justify-between">
        <p>Copyright (C) 2026 AquaZero. Free software under the GNU AGPL v3.</p>
        <p>General wellness support only</p>
      </div>
    </footer>
  );
}
