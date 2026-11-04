import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * First-launch brand intro: a 14-second montage that ends on the wordmark,
 * shown once per browser on the front door (`/`), which is also where a
 * Telegram Mini App launch lands. Deep links, legal pages and the Android
 * captcha WebView never see it. Automated browsers and reduced-motion users
 * skip it entirely, and a video that has not started within a few seconds is
 * abandoned rather than holding the app behind a loading screen.
 *
 * The video is silent by design: autoplay is only allowed muted, so a
 * soundtrack would be one nobody hears.
 */

export const INTRO_SEEN_KEY = 'azf_intro_seen_v1';
const START_TIMEOUT_MS = 4000;
const EXIT_MS = 300;

interface IntroEnv {
  pathname: string;
  seen: boolean;
  automated: boolean;
  reducedMotion: boolean;
}

export function shouldPlayIntro({ pathname, seen, automated, reducedMotion }: IntroEnv): boolean {
  return pathname === '/' && !seen && !automated && !reducedMotion;
}

function readEnv(pathname: string): IntroEnv {
  let seen = true;
  try {
    seen = localStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    // storage blocked: treat as seen rather than replaying on every launch
  }
  const media = typeof window.matchMedia === 'function' ? window.matchMedia : null;
  return {
    pathname,
    seen,
    automated: navigator.webdriver === true,
    // No matchMedia (jsdom) reads as reduced motion, so tests never mount it.
    reducedMotion: !media || media('(prefers-reduced-motion: reduce)').matches,
  };
}

function markSeen(): void {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    // nothing to do; the intro simply plays again next time
  }
}

export function IntroVideo() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(() => shouldPlayIntro(readEnv(pathname)));
  const [playing, setPlaying] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const [src] = useState(() =>
    window.matchMedia?.('(min-aspect-ratio: 1/1)').matches ? '/intro/intro-169.mp4' : '/intro/intro-916.mp4',
  );

  const close = () => {
    if (leaving) return;
    markSeen();
    setLeaving(true);
    window.setTimeout(() => setOpen(false), EXIT_MS);
  };

  useEffect(() => {
    if (!open) return;
    skipRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open || playing) return;
    const t = window.setTimeout(close, START_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [open, playing]);

  if (!open) return null;

  const onTime = () => {
    const v = videoRef.current;
    if (v?.duration && barRef.current) barRef.current.style.transform = `scaleX(${v.currentTime / v.duration})`;
  };

  return (
    <div
      role="dialog"
      aria-label="AquaZero intro"
      className={`fixed inset-0 z-[100] transition-opacity ease-in ${playing ? 'bg-black' : 'bg-white'}`}
      style={{ opacity: leaving ? 0 : 1, transitionDuration: `${EXIT_MS}ms` }}
    >
      {/* Loading state: the mark on the same white the video fades in from and ends on. */}
      <img
        src="/logo.png"
        alt=""
        className={`absolute left-1/2 top-1/2 w-24 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-200 ${
          playing ? 'opacity-0' : 'animate-pulse'
        }`}
      />
      <video
        ref={videoRef}
        src={src}
        className="absolute inset-0 h-full w-full object-contain"
        style={{ opacity: playing ? 1 : 0 }}
        autoPlay
        muted
        playsInline
        preload="auto"
        onPlaying={() => setPlaying(true)}
        onTimeUpdate={onTime}
        onEnded={close}
        onError={close}
      />
      <div className="absolute inset-x-0 bottom-0 h-1 bg-white/15">
        <div ref={barRef} className="h-full origin-left bg-primary" style={{ transform: 'scaleX(0)' }} />
      </div>
      <button
        ref={skipRef}
        type="button"
        onClick={close}
        className="absolute right-4 rounded-full bg-black/55 px-5 py-2.5 font-heading text-base font-semibold uppercase tracking-wide text-white backdrop-blur-sm transition-transform duration-100 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
      >
        Skip
      </button>
    </div>
  );
}
