/**
 * /r/:code: a Share Kit link (AZF-P1 US-F3).
 *
 * The browser is handed straight to the API, which records that the link was
 * opened and redirects to the landing page with `?ref=sh_<code>`, where the
 * existing first-touch attribution picks it up. Nothing renders but a short
 * holding state; a code that is not one goes home.
 */
import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { shareCodeSchema } from '@aquazerofit/shared';
import { API_BASE } from '@/lib/api';

export default function ShareLanding() {
  const { code = '' } = useParams();
  const valid = shareCodeSchema.safeParse(code);
  useEffect(() => {
    if (valid.success) window.location.replace(`${API_BASE}/share/r/${valid.data}`);
  }, [valid.success, valid.data]);
  if (!valid.success) return <Navigate to="/" replace />;
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <p className="text-sm text-on-surface-variant" role="status">
        Opening AquaZeroFit…
      </p>
    </main>
  );
}
