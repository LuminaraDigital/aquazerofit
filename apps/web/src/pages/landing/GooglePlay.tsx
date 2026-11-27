/**
 * /google-play — Flagship Native Android Hardware Launch Page.
 *
 * Distinct architecture: single dramatic 3D hero Android phone paired with a
 * ruled native spec strip (zero 320px phone-fan clipping, zero duplication
 * with `/how-it-works` or `/` Gallery), followed by a 3-up horizontal hardware
 * gallery of real Android captures and the Play Store Data Safety summary.
 */
import { Link } from 'react-router-dom';
import { WELLNESS_DISCLAIMER } from '@aquazerofit/shared';
import { PlayStoreBadge } from './Chrome';
import { DeviceFrame, type ScreenshotId } from './PhoneShowcase';
import { MarketingPage, PageCta, PageHero } from './Page';
import { Reveal } from './motion';
import { ArenaGridCanvas } from './scene/ArenaGridCanvas';

const NATIVE_SCREENS: ReadonlyArray<{
  id: ScreenshotId;
  title: string;
  body: string;
  caption: string;
  alt: string;
}> = [
  {
    id: 'dashboard',
    title: 'Track the full day',
    body: 'Meals, water, workouts and progress in one native Jetpack Compose view, with targets computed from your own profile.',
    caption: 'Corner Card UI',
    alt: 'Android app Home dashboard showing 2,382 kcal remaining, protein, carbs and fat against target, and daily checklist.',
  },
  {
    id: 'capture-meal',
    title: 'Log meals faster',
    body: 'Photograph a plate, scan a barcode or search the corpus natively. Nothing reaches your log until you confirm it.',
    caption: 'Camera & barcode',
    alt: 'Android app meal capture viewfinder with framing brackets and meal-type selector.',
  },
  {
    id: 'coach',
    title: 'Coaching with context',
    body: 'Aqua Coach and adaptive training plans respond to what you actually logged, with clinical boundaries always on screen.',
    caption: '28 fighter personas',
    alt: 'Android app Coach Akin chat screen displaying contextual advice under the persistent wellness disclaimer.',
  },
];

const NATIVE_SPECS = [
  ['UI Framework', 'Jetpack Compose'],
  ['Package ID', 'fit.aquazero.app'],
  ['Sync', 'Same account as web & Telegram'],
  ['Privacy', 'No ads · no data sale'],
] as const;

const PRIVACY_POINTS = [
  'No advertising and no sale of personal data',
  'Meal photos are private and deleted within a day of analysis',
  'AI personalisation stays off until you consent',
];

export default function GooglePlayPage() {
  return (
    <MarketingPage path="/google-play">
      <PageHero
        crumb="Google Play app"
        kicker="Native Android · fit.aquazero.app"
        title={
          <>
            Your wellness coach,
            <br />
            now on Google Play.
          </>
        }
        lead="AquaZeroFit for Android is on Google Play: meal logging by photograph, barcode or search, targets computed from your own profile, home training and Aqua Coach, on the same account as the Mini App and the web."
        primary={
          <span className="self-start">
            <PlayStoreBadge placement="google-play-hero" />
          </span>
        }
        secondary={{ to: '/google-play/privacy-policy', label: 'Read the app privacy policy' }}
        backdrop={<ArenaGridCanvas variant="stage" />}
        aside={
          <div className="mx-auto w-[250px] sm:w-[276px]">
            <DeviceFrame
              id="dashboard"
              alt="AquaZeroFit Android app dashboard showing remaining calories, macros, and daily checklist"
              priority
              maxTilt={6}
              caption="Release build capture"
            />
          </div>
        }
      >
        {/* Ruled native hardware spec strip */}
        <dl className="mt-10 grid gap-x-8 gap-y-4 border-y border-outline-variant/60 py-5 sm:grid-cols-2 lg:grid-cols-4">
          {NATIVE_SPECS.map(([label, value]) => (
            <div key={label}>
              <dt className="stat-label">{label}</dt>
              <dd className="mt-1 text-[15px] font-semibold text-on-surface">{value}</dd>
            </div>
          ))}
        </dl>
      </PageHero>

      <div className="mx-auto max-w-[1200px] space-y-24 px-5 pb-24 sm:space-y-28 sm:px-8 sm:pb-32">
        {/* 3-Up Native Hardware Gallery */}
        <section aria-labelledby="android-features">
          <Reveal className="max-w-2xl">
            <p className="stat-label text-primary">Native Experience</p>
            <h2
              id="android-features"
              className="mt-2 font-heading text-[34px] font-semibold leading-[1.04] text-on-surface sm:text-[44px]"
            >
              The same tools, as a native app.
            </h2>
            <p className="mt-3.5 text-[16px] leading-relaxed text-on-surface-variant">
              The Android app connects to the same AquaZeroFit service as the Mini App, with native
              camera speed and your privacy choices kept in plain sight.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
            {NATIVE_SCREENS.map((item, idx) => (
              <Reveal key={item.id} delay={idx * 60} className="flex flex-col">
                <div className="mx-auto w-[240px] sm:w-[258px] md:w-full md:max-w-[270px]">
                  <DeviceFrame
                    id={item.id}
                    alt={item.alt}
                    maxTilt={5}
                    caption={item.caption}
                  />
                </div>
                <h3 className="mt-6 font-heading text-[24px] font-semibold leading-tight text-on-surface">
                  {item.title}
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-on-surface-variant">
                  {item.body}
                </p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Data safety & Play privacy */}
        <section aria-labelledby="android-privacy">
          <Reveal>
            <div className="lp-panel grid gap-8 p-6 sm:p-9 lg:grid-cols-[1fr_0.85fr] lg:items-center">
              <div>
                <p className="stat-label text-primary">Play Data Safety</p>
                <h2
                  id="android-privacy"
                  className="mt-2 font-heading text-[28px] font-semibold leading-tight text-on-surface sm:text-[34px]"
                >
                  Read what the app collects before it reaches your phone.
                </h2>
                <p className="mt-3.5 max-w-xl text-[15.5px] leading-relaxed text-on-surface-variant">
                  The policy covers account data, wellness and meal logs, meal photographs, AI
                  processing, retention, deletion and your rights. It applies to the Android app and
                  the AquaZeroFit service it connects to.
                </p>
                <Link
                  to="/google-play/privacy-policy"
                  className="mt-5 inline-flex min-h-[44px] items-center gap-2 text-[15px] font-semibold text-primary transition-colors hover:text-on-surface"
                >
                  Read the Google Play privacy policy
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                    arrow_forward
                  </span>
                </Link>
              </div>
              <ul className="space-y-3">
                {PRIVACY_POINTS.map((item) => (
                  <li key={item} className="flex gap-3 rounded-xl border border-outline-variant/60 bg-surface p-4">
                    <span className="material-symbols-outlined shrink-0 text-[20px] text-secondary" aria-hidden="true">
                      check_circle
                    </span>
                    <span className="text-[14.5px] leading-relaxed text-on-surface">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </section>

        <PageCta
          title="Get AquaZeroFit on Google Play."
          lead="Not on Android? The same account works in the Telegram Mini App and in any browser."
          disclaimer={WELLNESS_DISCLAIMER}
        >
          <PlayStoreBadge placement="google-play-final" />
        </PageCta>
      </div>
    </MarketingPage>
  );
}
