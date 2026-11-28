/**
 * AquaZeroFit marketing landing page, served in place at `/` for signed-out
 * browser visitors.
 *
 * Preserves the high-trust hero conversion anchor (Barlow Condensed scoreboard
 * headline, Telegram/Browser/Google Play CTAs, live Mifflin-St Jeor
 * TargetsLabel fitting cleanly above the fold) paired with a quiet 3D
 * architectural arena grid, an accessible native `<dialog>` 14s brand reel,
 * tactile 3D captures, interactive meal trace, 6-fighter Corner Stage, and the
 * 5-Belt Fight Record ladder.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AQUA_CHARACTER } from '@aquazerofit/shared';
import { useSeo } from '../../lib/seo';
import { AppCtas, Footer, TopBar } from './Chrome';
import { prefersReducedMotion, useHashScroll } from './motion';
import { TargetsLabel } from './TargetsLabel';
import { CoachDemo, Gallery, Safety, Split, WaysIn } from './LandingSections';
import { ArenaGridCanvas } from './scene/ArenaGridCanvas';

function IntroReelDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduced = prefersReducedMotion();
  const src =
    typeof window !== 'undefined' && window.innerHeight > window.innerWidth
      ? '/intro/intro-916.mp4'
      : '/intro/intro-169.mp4';

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const video = videoRef.current;

    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    closeBtnRef.current?.focus();

    return () => {
      if (video && typeof video.pause === 'function') {
        try {
          video.pause();
        } catch {
          // jsdom / detached media element
        }
      }
      if (dialog.open) {
        if (typeof dialog.close === 'function') dialog.close();
        else dialog.removeAttribute('open');
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-label="AquaZeroFit 14-second brand reel"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      className="m-auto w-[min(92vw,56rem)] rounded-card border border-outline/70 bg-surface-container-lowest p-0 text-on-surface backdrop:bg-black/85"
    >
      <div className="flex items-center justify-between border-b border-outline-variant/60 px-4 py-3">
        <span className="stat-label text-primary">AquaZeroFit · 14s Brand Reel</span>
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-outline/80 px-3.5 text-[13px] font-semibold text-on-surface transition-colors hover:border-primary hover:text-primary"
        >
          Close
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
            close
          </span>
        </button>
      </div>
      <video
        ref={videoRef}
        src={src}
        className="max-h-[75dvh] w-full bg-black object-contain"
        controls
        autoPlay={!reduced}
        muted
        playsInline
      />
    </dialog>
  );
}

function Hero({
  onOpenReel,
  reelTriggerRef,
}: {
  onOpenReel: () => void;
  reelTriggerRef: React.RefObject<HTMLButtonElement>;
}) {
  return (
    <section className="relative overflow-hidden pt-24 pb-16 sm:pt-28 sm:pb-20">
      <ArenaGridCanvas variant="hero" />

      <div className="relative mx-auto grid max-w-[1240px] items-start gap-10 px-5 sm:px-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-14">
        <div className="min-w-0 lg:pt-4">
          <h1 className="font-heading font-semibold text-on-surface">
            <span className="flex items-center gap-2.5 font-body text-[15px] font-normal text-on-surface-variant">
              <img
                src={AQUA_CHARACTER.characterUrl}
                alt=""
                width={682}
                height={1024}
                loading="eager"
                decoding="async"
                className="h-8 w-8 rounded-full border border-primary/40 bg-black object-cover object-top"
              />
              <span>
                <span className="font-semibold text-on-surface">AquaZeroFit</span> · food,
                training, coaching
              </span>{' '}
            </span>
            <span className="mt-5 block text-[clamp(2.85rem,1.9rem+5.8vw,7rem)] leading-[0.9] tracking-[-0.025em]">
              Your day,{' '}
              <br />
              <span className="text-primary">measured.</span>
            </span>
          </h1>

          <p className="mt-6 max-w-[30em] text-[17px] leading-relaxed text-on-surface-variant [text-wrap:pretty] sm:text-[19px]">
            Photograph a meal and see it counted. Your calorie, macro and water targets come from
            a published formula you can check yourself, right here. Home training fits your
            equipment, and your fighter coach answers from what you actually logged.
          </p>

          <div className="mt-8">
            <AppCtas
              placement="hero"
              note={
                <p className="-mt-1 max-w-[34em] text-[13.5px] leading-relaxed text-on-surface-variant">
                  Start in the browser, or install the Android app from Google Play. The same
                  account also opens in Telegram.
                </p>
              }
            />
          </div>

          <ul className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-outline-variant/60 pt-3 text-[14px] text-on-surface-variant">
            <li className="py-2">Free to start</li>
            <li className="py-2">28 fighter coaches</li>
            <li className="py-2">Open source, AGPL v3</li>
            <li>
              <button
                ref={reelTriggerRef}
                type="button"
                onClick={onOpenReel}
                className="inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-primary transition-colors hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  play_circle
                </span>
                14s reel
              </button>
            </li>
            <li>
              <Link
                to="/sign-in"
                className="inline-flex min-h-[44px] items-center font-semibold text-on-surface underline decoration-outline underline-offset-4 transition-colors duration-150 hover:decoration-primary"
              >
                Sign in
              </Link>
            </li>
          </ul>
        </div>

        <div className="min-w-0">
          <TargetsLabel />
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  useSeo('/');
  useHashScroll();
  const [reelOpen, setReelOpen] = useState(false);
  const reelTriggerRef = useRef<HTMLButtonElement>(null);

  const closeReel = () => {
    setReelOpen(false);
    requestAnimationFrame(() => reelTriggerRef.current?.focus());
  };

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
        <Hero onOpenReel={() => setReelOpen(true)} reelTriggerRef={reelTriggerRef} />

        <div className="mx-auto max-w-[1240px] space-y-[clamp(5rem,3.5rem+5.5vw,8.5rem)] px-5 pb-[clamp(5rem,3.5rem+5.5vw,7.5rem)] sm:px-8">
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

      <IntroReelDialog open={reelOpen} onClose={closeReel} />
    </div>
  );
}
