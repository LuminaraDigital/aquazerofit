/**
 * AquaZeroFit marketing landing page, served in place at `/` for signed-out
 * browser visitors.
 *
 * Brief
 * - Audience: people who track, or have tried to track, food and training,
 *   arriving cold from a link or the Play listing. Their job here is to pick a
 *   way in: install the Android app, open the Mini App, or sign up on the web.
 * - The one message: your targets are arithmetic you can check, and the app
 *   shows you the working.
 * - Constraints: the brand's own tokens (aqua primary, mint secondary, Barlow
 *   Condensed over DM Sans, a dark ground), a prerendered shell, the
 *   Telegram-first conversion contract in Landing.test.tsx, no invented proof.
 *
 * Direction: precise product clarity on a dark instrument panel. Borrowed
 * moves: the Nutrition Facts label (heavy rules, a big figure, tabular rows),
 * Apple's health pages (one real number set huge, product shown at 1:1), and
 * Linear (surfaces that step up in lightness, hairlines instead of glows).
 *
 * Signature move: the live targets label in the first frame. It runs the
 * shared `computeTargets` and prints its working, so the headline's claim is
 * something the visitor can test before they install anything.
 *
 * Primary action: Telegram, with the browser beside it as the deliberate
 * second path and Google Play leading on Android phones (AppCtas, Chrome.tsx).
 * RequireAuth decides who sees this page; nothing here redirects.
 *
 * Motion budget: one-shot reveals (scale 0.98 and opacity), the screen
 * crossfade, the coach bubbles. No WebGL, no scroll listeners doing layout
 * reads, and everything collapses to static under prefers-reduced-motion.
 */
import { Link } from 'react-router-dom';
import { AQUA_CHARACTER } from '@aquazerofit/shared';
import { useSeo } from '../../lib/seo';
import { AppCtas, Footer, TopBar } from './Chrome';
import { Reveal, useHashScroll } from './motion';
import { TargetsLabel } from './TargetsLabel';
import { CoachDemo, Gallery, Safety, Split, WaysIn } from './LandingSections';

function Hero() {
  return (
    <section className="relative pt-28 pb-20 sm:pt-36 sm:pb-28">
      {/* One quiet light source: the water the product is named for, falling
          from the top edge. It frames the label without being a shape. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] bg-[radial-gradient(60%_60%_at_70%_0%,rgb(var(--azf-primary)/0.10),transparent_70%)]"
        aria-hidden="true"
      />
      <div className="relative mx-auto grid max-w-[1240px] items-start gap-14 px-5 sm:px-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-16">
        <div className="min-w-0 lg:pt-6">
          <Reveal>
            <h1 className="font-heading font-semibold text-on-surface">
              <span className="flex items-center gap-2.5 font-body text-[15px] font-normal text-on-surface-variant">
                <img
                  src={AQUA_CHARACTER.characterUrl}
                  alt=""
                  width={682}
                  height={1024}
                  loading="eager"
                  decoding="async"
                  className="h-8 w-8 rounded-full bg-black object-cover object-top"
                />
                <span>
                  <span className="font-semibold text-on-surface">AquaZeroFit</span> · food,
                  training, coaching
                </span>
              </span>
              {/* Two explicit lines, each unbreakable: the fonts load async,
                  and a wider fallback would otherwise wrap this to three lines
                  and shift the whole hero when Barlow Condensed arrives. */}
              <span className="mt-6 block whitespace-nowrap text-[clamp(3.5rem,2.2rem+6vw,7.25rem)] leading-[0.9] tracking-[-0.025em]">
                Your day,{' '}
                <br />
                <span className="text-primary">measured.</span>
              </span>
            </h1>
          </Reveal>

          <Reveal delay={70}>
            <p className="mt-7 max-w-[30em] text-[18px] leading-relaxed text-on-surface-variant [text-wrap:pretty] sm:text-[20px]">
              Photograph a meal and see it counted. Your calorie, macro and water targets come from
              a published formula you can check yourself, right here. Home training fits your
              equipment, and the coach answers from what you actually logged.
            </p>
          </Reveal>

          <Reveal delay={140}>
            <div className="mt-10">
              {/* The note sits right under the buttons rather than in a FAQ:
                  the visitor choosing between them is exactly the person who
                  needs to know the browser path is a real product. */}
              <AppCtas
                placement="hero"
                note={
                  <p className="-mt-1 max-w-[34em] text-[14px] leading-relaxed text-on-surface-variant">
                    The Mini App opens inside Telegram with no install. Blocked at work? The browser
                    version is the same app, same account.
                  </p>
                }
              />
            </div>
          </Reveal>

          <Reveal delay={200}>
            <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 border-t border-on-surface/10 pt-5 text-[14px] text-on-surface-variant">
              <li>Free to start</li>
              <li>Personalisation is opt-in</li>
              <li>Open source, AGPL v3</li>
              <li>
                <Link
                  to="/sign-in"
                  className="-my-2 inline-block py-2 font-semibold text-on-surface underline decoration-on-surface/30 underline-offset-4 transition-colors duration-150 hover:decoration-primary"
                >
                  Sign in
                </Link>
              </li>
            </ul>
          </Reveal>
        </div>

        <Reveal delay={120} className="min-w-0">
          <TargetsLabel />
        </Reveal>
      </div>
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
    <div className="relative min-h-screen overflow-x-clip bg-surface text-on-surface">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-primary focus:px-4 focus:py-2 focus:text-on-primary"
      >
        Skip to content
      </a>

      <TopBar onLanding />

      <main id="main">
        <Hero />

        <div className="mx-auto max-w-[1240px] space-y-[clamp(5.5rem,3.5rem+6vw,9rem)] px-5 pb-[clamp(5.5rem,3.5rem+6vw,8rem)] sm:px-8">
          <Gallery />
          <Split />
          <CoachDemo />
          <Safety />
          <WaysIn />
        </div>
      </main>

      <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
        <Footer onLanding />
      </div>
    </div>
  );
}
