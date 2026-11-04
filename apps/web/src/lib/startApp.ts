/**
 * Fight Camp `startapp` payloads (AZF-P1 US-C2, US-F3), routed once at launch.
 *
 *   sq_<SQD-XXXXXX>  a squad invite: open its landing, /s/<code>
 *
 * Kept apart from lib/deeplink, whose router only runs on the Nutrition page
 * and splits payloads on underscores, which would break a code in half.
 * Anything that is not one of these leaves the launch exactly as it was.
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { squadCodeSchema } from '@aquazerofit/shared';
import { getTelegramStartParam } from './telegram';

/** The path a Fight Camp start payload opens, or null for any other payload. */
export function fightCampStartPath(startParam: string | null): string | null {
  if (!startParam?.startsWith('sq_')) return null;
  const code = squadCodeSchema.safeParse(startParam.slice(3));
  return code.success ? `/s/${code.data}` : null;
}

export function useFightCampStartApp(): void {
  const navigate = useNavigate();
  const routed = useRef(false);
  useEffect(() => {
    if (routed.current) return;
    routed.current = true;
    const path = fightCampStartPath(getTelegramStartParam());
    if (path) navigate(path, { replace: true });
  }, [navigate]);
}
