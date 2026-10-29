import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps Tab inside `containerRef` while `active`, restores focus on teardown,
 * and calls `onEscape` when Escape is pressed.
 *
 * `onEscape` is read through a ref rather than listed as a dependency. Most
 * callers pass an inline arrow, which is a new function on every render; as
 * a dependency it re-ran the trap on each keystroke in a field inside the
 * dialog, pulling focus back to the first control (and closing a phone's
 * keyboard) after a single character.
 */
export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onEscape: () => void,
): void {
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const escape = useRef(onEscape);
  escape.current = onEscape;

  useEffect(() => {
    if (!active) return;

    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const panel = containerRef.current;
    const focusables = () =>
      panel ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];

    const first = focusables()[0];
    (first ?? panel)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        escape.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const nodes = focusables();
      if (nodes.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const firstNode = nodes[0]!;
      const lastNode = nodes[nodes.length - 1]!;
      if (e.shiftKey && document.activeElement === firstNode) {
        e.preventDefault();
        lastNode.focus();
      } else if (!e.shiftKey && document.activeElement === lastNode) {
        e.preventDefault();
        firstNode.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previouslyFocused.current?.focus();
    };
  }, [active, containerRef]);
}
