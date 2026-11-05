/**
 * /google-play — public page for the Android app.
 *
 * The app is live on Google Play, so the Play badge is this page's primary
 * action in place of Telegram, which stays available in the closing block.
 *
 * Every claim in the privacy panel is a summary of /privacy, which the Play
 * policy at /google-play/privacy-policy renders verbatim; change them together.
 */
import { Link } from 'react-router-dom';
import { WELLNESS_DISCLAIMER } from '@aquazerofit/shared';
import { PlayStoreBadge } from './Chrome';
import { MarketingPage, PageCta, PageHero } from './Page';
import { Reveal } from './motion';

const FEATURES = [
  {
    icon: 'track_changes',
    title: 'Track the full day',
    body: 'Meals, water, workouts and progress in one daily view, with targets computed from your own profile.',
  },
  {
    icon: 'photo_camera',
    title: 'Log meals faster',
    body: 'Photograph a meal, scan a barcode or search. Nothing is added to your log until you confirm it.',
  },
  {
    icon: 'auto_awesome',
    title: 'Coaching with context',
    body: 'Aqua Coach and adaptive plans respond to what you have actually logged, with safety boundaries built in.',
  },
];

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
        title={
          <>
            Your wellness coach,
            <br />
            <span className="lp-gradient-text">now on Google Play.</span>
          </>
        }
        lead="AquaZeroFit for Android is on Google Play: meal logging by photograph, barcode or search, targets computed from your own profile, home training and Aqua Coach, on the same account as the Mini App and the web."
        primary={
          <span className="self-start">
            <PlayStoreBadge placement="google-play-hero" />
          </span>
        }
        secondary={{ to: '/google-play/privacy-policy', label: 'Read the app privacy policy' }}
      />

      <div className="mx-auto max-w-6xl space-y-20 px-5 pb-24 sm:space-y-28 sm:pb-32">
        <section aria-labelledby="android-features">
          <Reveal className="max-w-2xl">
            <h2
              id="android-features"
              className="font-heading text-3xl font-semibold leading-[1.1] text-on-surface sm:text-[42px]"
            >
              The same tools, as a native app.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-on-surface-variant/75 sm:text-base">
              The Android app connects to the same AquaZeroFit service as the Mini App, with your
              privacy choices and data controls kept in view.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {FEATURES.map((feature, index) => (
              <Reveal key={feature.title} delay={index * 80}>
                <div className="lp-card h-full p-6">
                  <span className="material-symbols-outlined text-[26px] text-primary" aria-hidden="true">
                    {feature.icon}
                  </span>
                  <h3 className="mt-5 font-heading text-xl font-semibold text-on-surface">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-on-surface-variant/75">{feature.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section aria-labelledby="android-privacy">
          <Reveal>
            <div className="lp-card grid gap-8 p-6 sm:p-9 lg:grid-cols-[1fr_0.85fr] lg:items-center">
              <div>
                <h2 id="android-privacy" className="font-heading text-2xl font-semibold text-on-surface sm:text-3xl">
                  Read what the app collects before it reaches your phone.
                </h2>
                <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-on-surface-variant/75">
                  The policy covers account data, wellness and meal logs, meal photographs, AI
                  processing, retention, deletion and your rights. It applies to the Android app and
                  the AquaZeroFit service it connects to.
                </p>
                <Link
                  to="/google-play/privacy-policy"
                  className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                >
                  Read the Google Play privacy policy
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                    arrow_forward
                  </span>
                </Link>
              </div>
              <ul className="space-y-3">
                {PRIVACY_POINTS.map((item) => (
                  <li key={item} className="flex gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <span className="material-symbols-outlined shrink-0 text-[20px] text-secondary" aria-hidden="true">
                      check_circle
                    </span>
                    <span className="text-sm leading-relaxed text-on-surface-variant/80">{item}</span>
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
          <div className="mt-7 flex justify-center">
            <PlayStoreBadge placement="google-play-final" />
          </div>
        </PageCta>
      </div>
    </MarketingPage>
  );
}
