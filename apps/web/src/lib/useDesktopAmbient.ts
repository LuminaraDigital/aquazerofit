import { useEffect, useState } from 'react';

/** Desktop with a precise pointer: the ambient coach and command palette lane. */
function matchDesktopAmbient(): boolean {
  if (typeof window === 'undefined') return false;
  if (/Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent)) return false;
  return window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches;
}

/**
 * True on a wide, pointer-driven surface (AQF-27 desktop lane).
 * Mobile web and Telegram Mini App surfaces stay on the tap-first flow.
 */
export function useDesktopAmbient(): boolean {
  const [desktop, setDesktop] = useState(matchDesktopAmbient);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px) and (pointer: fine)');
    const update = () => setDesktop(matchDesktopAmbient());
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return desktop;
}

/** Document Picture-in-Picture is structurally desktop-only (Chrome 130+, Firefox 151+). */
export function supportsDocumentPictureInPicture(): boolean {
  return typeof window !== 'undefined' && 'documentPictureInPicture' in window;
}
