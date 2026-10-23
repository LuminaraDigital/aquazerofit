import { useState, type FormEvent } from 'react';
import { setCredentialsSchema, type PublicUser } from '@aquazerofit/shared';
import { ApiError } from '../../lib/api';
import { getTelegramInitData, haptic, isTMA } from '../../lib/telegram';
import { useLinkTelegram, useSetCredentials } from '../../lib/queries';
import { Input } from '../../components/ui/Input';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { SecondaryButton } from '../../components/ui/SecondaryButton';
import { useToast } from '../../components/ui/Toast';

/**
 * One account, two ways in: email + password (any browser) and Telegram
 * (inside the Mini App). Each row states which of the two this account has
 * and offers the missing one, but only where it can actually be completed:
 *
 *   - a Telegram-provisioned account (no credentials record) is offered the
 *     set-email-and-password form anywhere, because that flow needs nothing
 *     from the host;
 *   - linking Telegram needs the signed launch data, which only exists inside
 *     the Mini App, so outside it the row explains instead of offering a
 *     button that cannot work.
 *
 * `hasPassword === false` (not falsy): a stale localStorage snapshot from
 * before the field existed reads as undefined, and offering "set a password"
 * to an account that already has one would only bounce off the server's
 * CONFLICT. The form waits for the server to actually say the password is
 * missing.
 */
export function AccountAccessSection({ user }: { user: PublicUser }) {
  const toast = useToast();
  const setCredentials = useSetCredentials();
  const linkTelegram = useLinkTelegram();
  const [formOpen, setFormOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const needsCredentials = user.hasPassword === false;
  const inTelegram = isTMA();

  async function submitCredentials(e: FormEvent) {
    e.preventDefault();
    const check = setCredentialsSchema.safeParse({ email: email.trim(), password });
    if (!check.success) {
      setError(check.error.issues[0]?.message ?? 'Please review your details.');
      return;
    }
    setError(null);
    try {
      await setCredentials.mutateAsync(check.data);
      haptic('success');
      toast.success('Email & password set - you can now sign in on the web.');
      setFormOpen(false);
      setPassword('');
    } catch (err) {
      haptic('error');
      toast.error(
        err instanceof ApiError && err.message
          ? err.message
          : 'Could not set your email & password. Please try again.',
      );
    }
  }

  async function onLinkTelegram() {
    const initData = getTelegramInitData();
    if (!initData) {
      toast.error('Telegram launch data is unavailable. Please reopen the Mini App.');
      return;
    }
    try {
      await linkTelegram.mutateAsync(initData);
      haptic('success');
      toast.success('Telegram linked - the Mini App now signs into this account.');
    } catch (err) {
      haptic('error');
      toast.error(
        err instanceof ApiError && err.message
          ? err.message
          : 'Could not link Telegram. Please try again.',
      );
    }
  }

  return (
    <section aria-labelledby="account-access-heading">
      <h3
        id="account-access-heading"
        className="font-heading font-semibold uppercase tracking-wide text-xl text-primary mb-3 px-2"
      >
        Account Access
      </h3>
      <div className="glass-card overflow-hidden">
        {/* Email sign-in row */}
        <div className="p-4 border-b border-outline-variant/50 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">
                mail
              </span>
              <div className="min-w-0">
                <span className="block text-base">Email sign-in</span>
                <span className="block text-xs text-on-surface-variant truncate">
                  {needsCredentials
                    ? 'Not set - needed to sign in from any browser'
                    : user.email}
                </span>
              </div>
            </div>
            {needsCredentials && !formOpen && (
              <SecondaryButton onClick={() => setFormOpen(true)} className="shrink-0 min-h-[44px]">
                Set up
              </SecondaryButton>
            )}
          </div>
          {needsCredentials && formOpen && (
            <form onSubmit={(e) => void submitCredentials(e)} className="space-y-3">
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Your account was created through Telegram. Add an email and password to use
                AquaZeroFit in any browser - your data stays on this one account.
              </p>
              <Input
                label="Email"
                icon="mail"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                label="Password"
                icon="lock"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-on-surface-variant">
                At least 12 characters, with an uppercase letter, a lowercase letter and a digit.
              </p>
              {error && (
                <p role="alert" className="flex items-center gap-1.5 text-sm text-tertiary-container">
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    error
                  </span>
                  {error}
                </p>
              )}
              <div className="flex gap-3">
                <SecondaryButton
                  onClick={() => setFormOpen(false)}
                  disabled={setCredentials.isPending}
                  className="min-h-[44px]"
                >
                  Cancel
                </SecondaryButton>
                <PrimaryButton
                  type="submit"
                  loading={setCredentials.isPending}
                  className="min-h-[44px]"
                >
                  Save
                </PrimaryButton>
              </div>
            </form>
          )}
        </div>

        {/* Telegram row */}
        <div className="p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">
              send
            </span>
            <div className="min-w-0">
              <span className="block text-base">Telegram</span>
              <span className="block text-xs text-on-surface-variant">
                {user.telegramLinked
                  ? 'Connected - the Mini App signs straight into this account'
                  : inTelegram
                    ? 'Link this Telegram to sign in automatically here'
                    : 'Open the Mini App inside Telegram and sign in with your email to link it'}
              </span>
            </div>
          </div>
          {user.telegramLinked ? (
            <span
              className="material-symbols-outlined text-secondary shrink-0"
              aria-hidden="true"
            >
              check_circle
            </span>
          ) : inTelegram ? (
            <SecondaryButton
              onClick={() => void onLinkTelegram()}
              disabled={linkTelegram.isPending}
              className="shrink-0 min-h-[44px]"
            >
              {linkTelegram.isPending ? 'Linking…' : 'Link'}
            </SecondaryButton>
          ) : null}
        </div>
      </div>
    </section>
  );
}
