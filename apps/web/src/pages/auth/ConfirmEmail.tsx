/**
 * /confirm-email?token=… — the link in the mail POST /me/credentials sends.
 *
 * A Telegram account that adds an email sign-in no longer gets it straight
 * away: the address and password attach only when this link is opened, which
 * proves the mailbox. The page posts the token once and reports the outcome.
 *
 * Public (outside RequireAuth): the mail is often opened on another device,
 * with no session, and the token is the proof anyway.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useNoIndex } from '../../lib/seo';

type Outcome = { state: 'working' } | { state: 'done' } | { state: 'failed'; message: string };

const EXPIRED = 'This link is invalid or has expired. Add your email again in Settings to get a new one.';

function failureMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) {
    return 'This email is already used by another account. Sign in with it, or add a different email in Settings.';
  }
  if (err instanceof ApiError && err.status === 400) return EXPIRED;
  return 'Could not confirm your email right now. Please open the link again in a moment.';
}

export default function ConfirmEmail() {
  useNoIndex();
  const [params] = useSearchParams();
  const token = params.get('token')?.trim() ?? '';
  const [outcome, setOutcome] = useState<Outcome>(
    token ? { state: 'working' } : { state: 'failed', message: EXPIRED },
  );
  // The token is single-use: a second POST (StrictMode, a re-render) would
  // report a failure for a link that just worked.
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    api<{ message: string }>('/auth/email-confirm', { method: 'POST', body: { token }, auth: false })
      .then(() => setOutcome({ state: 'done' }))
      .catch((err: unknown) => setOutcome({ state: 'failed', message: failureMessage(err) }));
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-container-margin py-8">
      <div className="w-full max-w-sm space-y-4 text-center">
        {outcome.state === 'working' && (
          <>
            <h1 className="font-heading text-xl text-on-surface">Confirming your email</h1>
            <p className="text-sm text-on-surface-variant" role="status">
              One moment…
            </p>
          </>
        )}
        {outcome.state === 'done' && (
          <>
            <h1 className="font-heading text-xl text-on-surface">Email confirmed</h1>
            <p className="text-sm text-on-surface-variant" role="status">
              You can now sign in with this email and your password in any browser. Telegram still works too.
            </p>
            <Link to="/sign-in" className="inline-block text-sm font-medium text-primary underline">
              Sign in
            </Link>
          </>
        )}
        {outcome.state === 'failed' && (
          <>
            <h1 className="font-heading text-xl text-on-surface">Email not confirmed</h1>
            <p className="text-sm text-on-surface-variant" role="alert">
              {outcome.message}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
