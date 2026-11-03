import { CoachPip } from '@/components/coach/CoachPip';
import { CommandPalette } from '@/components/CommandPalette';
import { useDesktopAmbient } from '@/lib/useDesktopAmbient';

/**
 * Desktop-only ambient layer (AQF-27): keyboard meal logging and the
 * always-on-top coach HUD. Mobile and Telegram surfaces stay unchanged.
 */
export function DesktopAmbient() {
  const desktop = useDesktopAmbient();
  if (!desktop) return null;
  return (
    <>
      <CommandPalette />
      <CoachPip />
    </>
  );
}
