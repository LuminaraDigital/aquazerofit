/**
 * AquaZeroFit marketing landing page — the web front door, served in place at
 * `/` for signed-out browser visitors.
 *
 * Its single job is conversion into Telegram, where the product actually
 * lives. The web is marketing; Telegram is the app. So the primary CTA leaves
 * this origin, and the browser sign-up sits beside it as the deliberate
 * second path for anyone whose network blocks Telegram — see BrowserPath.
 *
 * There are no auth or Telegram redirects in here any more. RequireAuth
 * decides who sees this page (signed-out, not in Telegram, at `/`) and this
 * component trusts that decision — a second copy of the rule inside a page
 * rendered *at* `/` could only ever redirect `/` to `/`.
 *
 * Motion budget: one WebGL draw call (HeroOrb), CSS transforms driven by
 * custom properties, and IntersectionObserver reveals. No animation library,
 * no 3D library, no scroll listeners doing layout reads - and every effect
 * collapses to a static page under prefers-reduced-motion.
 *
 * Header and footer live in Chrome.tsx, shared with /features.
 */
import { Link } from 'react-router-dom';
import { useSeo } from '../../lib/seo';
import { AppBackground } from '../../components/layout/AppBackground';
import { Footer, TelegramCta, TopBar, WebFallbackLink } from './Chrome';
import { HeroOrb } from './HeroOrb';
import { PhoneShowcase } from './PhoneShowcase';
import { Reveal, useHashScroll } from './motion';
import { AkinStage } from '../../components/brand/AkinStage';
import { AQUA_CHARACTER } from '@aquazerofit/shared';
import {
  CoachDemo,
  Features,
  Gallery,
  HowItWorks,
  Marquee,
  Platform,
  Safety,
  Stats,
} from './LandingSections';

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-28 pb-16 sm:pt-36 sm:pb-24">
      <div className="lp-floor" aria-hidden="true" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-5 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <Reveal>
            <div className="mb-6 max-w-[13.5rem]">
              <AkinStage size="hero" priority />
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/90">
              <span className="h-1.5 w-1.5 rounded-full bg-secondary shadow-[0_0_10px_#45dfa4]" />
              {AQUA_CHARACTER.tagline}
            </span>
          </Reveal>

          <Reveal delay={90}>
            <h1 className="mt-6 font-heading text-[44px] font-semibold leading-[1.02] tracking-tight text-on-surface sm:text-[64px]">
              AquaZeroFit
              <br />
              <span className="lp-gradient-text">Your day, measured.</span>
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-on-surface-variant/75 sm:text-lg">
              Photograph a meal and see it counted. Get calorie, macro and hydration targets you
              could recompute by hand, home training that fits your equipment, and {AQUA_CHARACTER.title}{' '}
              answering from your actual day - inside boundaries it will not cross.
            </p>
          </Reveal>

          <Reveal delay={230}>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <TelegramCta placement="hero" />
              <WebFallbackLink placement="hero" />
            </div>
            {/* Named right under the CTA rather than buried in a FAQ. The
                visitor deciding between these two buttons is exactly the
                person who needs to know the second one is a real product and
                not a demo. */}
            <p className="mt-3 text-[12px] leading-relaxed text-on-surface-variant/60">
              No install — the Mini App opens inside Telegram. Blocked at work?
              The browser version is the same app, same account.
            </p>
          </Reveal>

          <Reveal delay={300}>
            <p className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-on-surface-variant/70">
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
                  lock
                </span>
                Personalisation is opt-in
              </span>
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
                  code
                </span>
                Open source (AGPL v3)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
                  bolt
                </span>
                Free to start
              </span>
            </p>
          </Reveal>
        </div>

        {/* 3D showcase: raymarched orb behind a CSS-3D device */}
        <div className="relative">
          {/* Offset from the device's centre so the drop's lit rim clears the
              phone instead of hiding entirely behind it. */}
          <HeroOrb className="pointer-events-none absolute left-[58%] top-[38%] h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 sm:h-[660px] sm:w-[660px]" />
          <div
            className="lp-orbit pointer-events-none absolute left-1/2 top-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/10 sm:h-[460px] sm:w-[460px]"
            aria-hidden="true"
          />
          <div
            className="lp-orbit-reverse pointer-events-none absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-secondary/10 sm:h-[360px] sm:w-[360px]"
            aria-hidden="true"
          />
          <Reveal delay={200}>
            <div className="relative py-6">
              <PhoneShowcase />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden">
      <Reveal>
        <div className="lp-card relative px-6 py-16 text-center sm:px-16 sm:py-20">
          <div
            className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(47,217,244,0.22),transparent_65%)] blur-2xl"
            aria-hidden="true"
          />
          <h2 className="relative font-heading text-3xl font-semibold leading-tight text-on-surface sm:text-[44px]">
            Start with one honest number
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-on-surface-variant/75 sm:text-base">
            Open the Mini App, answer a few questions, and see your targets computed from your
            own figures. Everything after that is just logging your day.
          </p>
          <div className="relative mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <TelegramCta placement="final" />
            <WebFallbackLink placement="final" />
          </div>
          <p className="relative mt-5 text-[12px] text-on-surface-variant/60">
            Already have an account?{' '}
            <Link to="/sign-in" className="text-primary transition-colors hover:text-secondary">
              Sign in
            </Link>
          </p>
        </div>
      </Reveal>
    </section>
  );
}

export default function Landing() {
  /* Title, description, canonical and OG tags for `/`. The prerendered shell
     already carries them for the first paint; this keeps them right after a
     client-side navigation back here from another marketing route. */
  useSeo('/');
  /* Honours `/#screens` arriving from another marketing page. */
  useHashScroll();

  return (
    <div className="relative min-h-screen bg-surface text-on-surface">
      <AppBackground />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-primary focus:px-4 focus:py-2 focus:text-[#001f25]"
      >
        Skip to content
      </a>

      <div className="azf-content">
        <TopBar onLanding />

        <main id="main">
          <Hero />

          <Marquee />

          <div className="mx-auto max-w-6xl space-y-24 px-5 py-24 sm:space-y-32 sm:py-32">
            <Stats />
            <Features />
            <Gallery />
            <HowItWorks />
            <CoachDemo />
            <Safety />
            <Platform />
            <FinalCta />
          </div>
        </main>

        <div className="mx-auto max-w-6xl px-5">
          <Footer onLanding />
        </div>
      </div>
    </div>
  );
}
