/**
 * Welcome / onboarding carousel - pixel reference:
 * Figma_aquazerofit_wellness_platform/welcome_to_aquazerofit.
 *
 * Refined: layered gradient background with caustic light, tighter
 * typography, staggered entrance, and a distinctive wave divider.
 */
import { useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { tokenStore } from '../../lib/api';
import { getTelegramInitData, haptic, isTMA } from '../../lib/telegram';
import { useAuthActions } from '../../lib/queries';
import { useTelegramAutoLogin } from '../../lib/useTelegramAutoLogin';
import { PageSpinner } from '../../components/ui/PageSpinner';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { SecondaryButton } from '../../components/ui/SecondaryButton';
import { ToastProvider, useToast } from '../../components/ui/Toast';
import { AppBackground } from '../../components/layout/AppBackground';
import { fetchPriorityHigh } from '../../lib/fetchPriority';

const SLIDES = [
  {
    title: 'Your AI wellness coach',
    subtitle: 'Nutrition, weight, and home training - powered by personalized data.',
    icon: null,
    glow: 'bg-primary/15',
  },
  {
    title: 'Hydration & nutrition paths',
    subtitle: 'AI-driven plans that adapt to your daily performance and metabolic rhythm.',
    icon: 'water_drop',
    glow: 'bg-secondary/15',
  },
  {
    title: 'Progress with precision',
    subtitle: 'Real-time tracking with intuitive visual data and motivational insights.',
    icon: 'monitoring',
    glow: 'bg-tertiary/10',
  },
];

function WelcomeInner() {
  const navigate = useNavigate();
  const toast = useToast();
  const { telegramLogin } = useAuthActions();
  const carouselRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [tgLoading, setTgLoading] = useState(false);

  const autoLoginPending = useTelegramAutoLogin();
  if (autoLoginPending) return <PageSpinner />;

  function onScroll() {
    const el = carouselRef.current;
    if (!el) return;
    setActive(Math.round(el.scrollLeft / el.offsetWidth));
  }

  async function onTelegram() {
    const initData = getTelegramInitData();
    if (!initData) return;
    setTgLoading(true);
    try {
      await telegramLogin(initData);
      haptic('success');
      // The Mini App's whole point is arriving with nothing to fill in — a new
      // account lands on the first-run home, not on a form.
      navigate('/', { replace: true });
    } catch {
      haptic('error');
      toast.error('Telegram sign-in failed. Please try again.');
    } finally {
      setTgLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface text-on-surface overflow-hidden">
      {/* Background atmosphere - WebGL aurora + hatch + vignette */}
      <AppBackground />

      <main className="relative z-10 flex-1 flex flex-col max-w-md w-full mx-auto px-container-margin pt-10 pb-8">
        {/* Brand header */}
        <div className="flex justify-center mb-section-gap reveal">
          <div className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt=""
              width={359}
              height={376}
              loading="eager"
              decoding="async"
              className="w-9 h-9 object-contain"
              aria-hidden="true"
            />
            <span className="font-heading font-extrabold tracking-tight text-2xl text-primary">
              AquaZeroFit
            </span>
          </div>
        </div>

        {/* Carousel */}
        <div className="flex-1 flex flex-col justify-center">
          <div
            ref={carouselRef}
            onScroll={onScroll}
            className="flex overflow-x-auto w-full snap-x snap-mandatory no-scrollbar"
            aria-roledescription="carousel"
            aria-label="AquaZeroFit highlights"
          >
            {SLIDES.map((slide, i) => (
              <div
                key={slide.title}
                className="w-full shrink-0 snap-center flex flex-col items-center text-center px-2"
                role="group"
                aria-roledescription="slide"
                aria-label={`Slide ${i + 1} of ${SLIDES.length}`}
              >
                <div className="w-48 h-48 mb-7 relative">
                  <div className={`absolute inset-0 ${slide.glow} rounded-full blur-3xl`} aria-hidden="true" />
                  {slide.icon ? (
                    <div className="relative z-10 w-full h-full flex items-center justify-center">
                      <span
                        className="material-symbols-outlined text-primary"
                        style={{ fontSize: '96px', fontVariationSettings: "'FILL' 1" }}
                        aria-hidden="true"
                      >
                        {slide.icon}
                      </span>
                    </div>
                  ) : (
                    // Only the first slide carries the logo, and that slide is
                    // what the carousel opens on — this is the LCP element.
                    <img
                      src="/logo.png"
                      alt="AquaZeroFit logo"
                      width={359}
                      height={376}
                      loading="eager"
                      decoding="async"
                      {...fetchPriorityHigh()}
                      className="relative z-10 w-full h-full object-contain"
                    />
                  )}
                </div>
                <h1 className="font-heading font-semibold text-[26px] leading-[1.2] text-on-surface mb-3 max-w-xs mx-auto tracking-tight">
                  {slide.title}
                </h1>
                <p className="text-on-surface-variant/70 text-[15px] max-w-xs leading-relaxed">
                  {slide.subtitle}
                </p>
              </div>
            ))}
          </div>

          {/* Indicator dots - asymmetric active width */}
          <div className="flex justify-center gap-1.5 mt-7" aria-hidden="true">
            {SLIDES.map((slide, i) => (
              <div
                key={slide.title}
                className={`h-1 rounded-full transition-all duration-300 ${
                  i === active ? 'w-7 bg-primary' : 'w-1.5 bg-outline-variant/50'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-section-gap space-y-3 reveal reveal-3">
          <PrimaryButton onClick={() => navigate('/sign-in?mode=register')}>
            Get Started
          </PrimaryButton>
          <SecondaryButton onClick={() => navigate('/sign-in')}>
            I already have an account
          </SecondaryButton>
          {isTMA() && (
            <SecondaryButton onClick={() => void onTelegram()} loading={tgLoading}>
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                send
              </span>
              Continue with Telegram
            </SecondaryButton>
          )}
          <p className="text-center text-[11px] text-on-surface-variant/40 uppercase tracking-widest pt-1">
            General wellness support only
          </p>
        </div>
      </main>
    </div>
  );
}

export default function Welcome() {
  if (tokenStore.isAuthenticated) return <Navigate to="/" replace />;
  return (
    <ToastProvider>
      <WelcomeInner />
    </ToastProvider>
  );
}