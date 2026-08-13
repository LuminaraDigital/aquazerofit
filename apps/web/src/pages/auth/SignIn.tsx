/**
 * Sign in / create account — pixel reference:
 * Figma_aquazerofit_wellness_platform/sign_in_to_aquazerofit.
 */
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { loginSchema, passwordSchema, registerSchema } from '@aquazerofit/shared';
import { api, ApiError, tokenStore } from '../../lib/api';
import { getTelegramInitData, haptic, isTMA } from '../../lib/telegram';
import { useAuthActions } from '../../lib/queries';
import { useTelegramAutoLogin } from '../../lib/useTelegramAutoLogin';
import { Chip } from '../../components/ui/Chip';
import { Input } from '../../components/ui/Input';
import { PageSpinner } from '../../components/ui/PageSpinner';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ToastProvider, useToast } from '../../components/ui/Toast';

type Mode = 'signIn' | 'register';

const PASSWORD_RULES = [
  { label: 'At least 12 characters', test: (p: string) => p.length >= 12 },
  { label: 'A lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'An uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'A digit', test: (p: string) => /[0-9]/.test(p) },
];

type FieldErrors = Partial<Record<'email' | 'password' | 'displayName', string>>;

/** Allow only same-origin relative paths after sign-in (blocks open redirects). */
function safeInternalPath(path: string | undefined): string {
  if (!path || typeof path !== 'string') return '/';
  if (!path.startsWith('/') || /^\/\//.test(path)) return '/';
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return '/';
  return path;
}

/** Live requirement checklist shared by register + password-reset forms. */
function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul className="ml-1 space-y-1" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <li
            key={rule.label}
            className={`flex items-center gap-1.5 text-xs transition-colors ${
              met ? 'text-secondary' : 'text-on-surface-variant/70'
            }`}
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">
              {met ? 'check_circle' : 'radio_button_unchecked'}
            </span>
            {rule.label}
            <span className="sr-only">{met ? ' — met' : ' — not met'}</span>
          </li>
        );
      })}
    </ul>
  );
}

function extractServerFieldErrors(details: unknown): FieldErrors {
  const errors: FieldErrors = {};
  if (Array.isArray(details)) {
    for (const issue of details) {
      if (
        typeof issue === 'object' &&
        issue !== null &&
        'path' in issue &&
        'message' in issue &&
        Array.isArray((issue as { path: unknown }).path)
      ) {
        const field = String((issue as { path: unknown[] }).path[0] ?? '');
        if (field === 'email' || field === 'password' || field === 'displayName') {
          errors[field] = String((issue as { message: unknown }).message);
        }
      }
    }
  } else if (typeof details === 'object' && details !== null) {
    for (const key of ['email', 'password', 'displayName'] as const) {
      const value = (details as Record<string, unknown>)[key];
      if (typeof value === 'string') errors[key] = value;
      else if (Array.isArray(value) && typeof value[0] === 'string') errors[key] = value[0];
    }
  }
  return errors;
}

function SignInInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const toast = useToast();
  const { login, register, telegramLogin } = useAuthActions();

  const [mode, setMode] = useState<Mode>(params.get('mode') === 'register' ? 'register' : 'signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [tgLoading, setTgLoading] = useState(false);

  // ---- password reset (backend contract frozen: request → confirm) ----
  // The reset email links to /sign-in?reset=<token>. Arriving that way skips
  // straight to the confirm step with the token filled in — the alternative is
  // asking someone who just clicked a link to copy a UUID out of the mail.
  const resetTokenFromLink = params.get('reset')?.trim() ?? '';
  const [resetOpen, setResetOpen] = useState(resetTokenFromLink !== '');
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>(
    resetTokenFromLink !== '' ? 'confirm' : 'request',
  );
  const [resetEmail, setResetEmail] = useState('');
  const [resetEmailError, setResetEmailError] = useState<string | undefined>(undefined);
  const [resetToken, setResetToken] = useState(resetTokenFromLink);
  const [resetTokenError, setResetTokenError] = useState<string | undefined>(undefined);
  const [resetTokenIsDev, setResetTokenIsDev] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordError, setNewPasswordError] = useState<string | undefined>(undefined);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetNote, setResetNote] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from;
  const isRegister = mode === 'register';

  // Inside Telegram, try signing in silently before showing the form.
  const autoLoginPending = useTelegramAutoLogin();
  if (autoLoginPending) return <PageSpinner />;

  function openReset() {
    setResetOpen(true);
    setResetStep('request');
    setResetEmail(email);
    setResetEmailError(undefined);
    setResetToken('');
    setResetTokenError(undefined);
    setResetTokenIsDev(false);
    setNewPassword('');
    setNewPasswordError(undefined);
    setShowNewPassword(false);
    setResetNote('');
  }

  function closeReset() {
    setResetOpen(false);
  }

  async function onRequestReset(e: FormEvent) {
    e.preventDefault();
    const parsedEmail = loginSchema.shape.email.safeParse(resetEmail.trim());
    if (!parsedEmail.success) {
      setResetEmailError('Enter a valid email address.');
      return;
    }
    setResetEmailError(undefined);
    setResetBusy(true);
    try {
      const res = await api<{ devToken?: string } | undefined>('/auth/password-reset/request', {
        method: 'POST',
        body: { email: parsedEmail.data },
        auth: false,
      });
      // Anti-enumeration copy — shown regardless of whether the account exists.
      setResetNote('If that account exists, reset instructions have been issued.');
      if (res && typeof res.devToken === 'string' && res.devToken.length > 0) {
        setResetToken(res.devToken);
        setResetTokenIsDev(true);
      }
      setResetStep('confirm');
    } catch (err) {
      haptic('error');
      if (err instanceof ApiError && err.code === 'RATE_LIMITED') {
        toast.error('Too many attempts. Please wait a moment and try again.');
      } else if (err instanceof ApiError && err.code === 'VALIDATION_FAILED') {
        setResetEmailError('Enter a valid email address.');
      } else {
        toast.error('Network error. Please check your connection.');
      }
    } finally {
      setResetBusy(false);
    }
  }

  async function onConfirmReset(e: FormEvent) {
    e.preventDefault();
    let hasError = false;
    if (resetToken.trim() === '') {
      setResetTokenError('Enter the reset token you received.');
      hasError = true;
    }
    const parsedPassword = passwordSchema.safeParse(newPassword);
    if (!parsedPassword.success) {
      setNewPasswordError(
        parsedPassword.error.issues[0]?.message ?? 'Password does not meet the requirements.',
      );
      hasError = true;
    }
    if (hasError) return;
    setResetBusy(true);
    try {
      await api<void>('/auth/password-reset/confirm', {
        method: 'POST',
        body: { token: resetToken.trim(), newPassword },
        auth: false,
      });
      haptic('success');
      toast.success('Password updated. Sign in with your new password.');
      closeReset();
    } catch (err) {
      haptic('error');
      if (err instanceof ApiError && err.status === 400) {
        setResetTokenError('That reset token is invalid or has expired. Request a new one.');
      } else if (err instanceof ApiError && err.code === 'RATE_LIMITED') {
        toast.error('Too many attempts. Please wait a moment and try again.');
      } else if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Network error. Please check your connection.');
      }
    } finally {
      setResetBusy(false);
    }
  }

  function switchMode() {
    setMode(isRegister ? 'signIn' : 'register');
    setErrors({});
    setResetOpen(false);
  }

  function validate(): boolean {
    const schema = isRegister ? registerSchema : loginSchema;
    const input = isRegister
      ? { email, password, displayName: displayName.trim() || undefined }
      : { email, password };
    const result = schema.safeParse(input);
    if (result.success) {
      setErrors({});
      return true;
    }
    const next: FieldErrors = {};
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? '');
      if ((field === 'email' || field === 'password' || field === 'displayName') && !next[field]) {
        next[field] = issue.message;
      }
    }
    setErrors(next);
    return false;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = isRegister
        ? await register({ email, password, displayName: displayName.trim() || undefined })
        : await login(email, password);
      haptic('success');
      // Straight into the app whether or not a wellness profile exists — the
      // essentials are asked for by the surfaces that need them, not here.
      navigate(safeInternalPath(from), { replace: true });
    } catch (err) {
      haptic('error');
      if (err instanceof ApiError) {
        if (err.code === 'VALIDATION_FAILED') {
          const fieldErrors = extractServerFieldErrors(err.body.details);
          if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);
          else toast.error(err.message);
        } else if (err.code === 'AUTH_INVALID') {
          toast.error('Incorrect email or password.');
        } else if (err.code === 'CONFLICT') {
          setErrors({ email: 'An account with this email already exists.' });
        } else if (err.code === 'RATE_LIMITED') {
          toast.error('Too many attempts. Please wait a moment and try again.');
        } else {
          toast.error(err.message);
        }
      } else {
        toast.error('Network error. Please check your connection.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onTelegram() {
    const initData = getTelegramInitData();
    if (!initData) return;
    setTgLoading(true);
    try {
      await telegramLogin(initData);
      haptic('success');
      navigate(safeInternalPath(from), { replace: true });
    } catch {
      haptic('error');
      toast.error('Telegram sign-in failed. Please try again.');
    } finally {
      setTgLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#071A2B] text-on-surface">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full" />
        <div className="absolute top-[40%] -right-[10%] w-[50%] h-[50%] bg-secondary/5 blur-[120px] rounded-full" />
      </div>

      <div className="w-full max-w-md mx-auto flex-1 flex flex-col relative z-10">
        {/* Auth header */}
        <header className="w-full px-container-margin py-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="" className="w-8 h-8 object-contain" aria-hidden="true" />
            <h1 className="font-heading font-bold tracking-tight text-2xl text-primary">
              AquaZeroFit
            </h1>
          </div>
          <button
            type="button"
            onClick={switchMode}
            className="text-sm font-medium text-secondary border border-secondary/30 px-4 py-2 rounded-full hover:bg-secondary/10 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
          >
            {isRegister ? 'Sign In' : 'Create Account'}
          </button>
        </header>

        <main className="flex-1 flex items-start justify-center px-container-margin pb-12">
          <div className="w-full glass-card p-card-padding space-y-6">
            {resetOpen ? (
              <>
                <div className="space-y-2">
                  <h2 className="font-heading font-semibold text-[28px] leading-8 text-on-surface">
                    Reset Password
                  </h2>
                  <p className="text-base text-on-surface-variant">
                    {resetStep === 'request'
                      ? 'Enter your account email and we will issue reset instructions.'
                      : 'Enter your reset token and choose a new password.'}
                  </p>
                </div>

                {resetStep === 'request' ? (
                  <form onSubmit={(e) => void onRequestReset(e)} noValidate className="space-y-4">
                    <Input
                      label="Email Address"
                      icon="mail"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      placeholder="name@example.com"
                      value={resetEmail}
                      onChange={(e) => {
                        setResetEmail(e.target.value);
                        if (resetEmailError) setResetEmailError(undefined);
                      }}
                      error={resetEmailError}
                    />
                    <PrimaryButton type="submit" loading={resetBusy}>
                      Send reset instructions
                    </PrimaryButton>
                  </form>
                ) : (
                  <form onSubmit={(e) => void onConfirmReset(e)} noValidate className="space-y-4">
                    {resetNote && (
                      <div
                        role="status"
                        className="flex items-start gap-2 rounded-2xl border border-primary/20 bg-primary/10 p-3"
                      >
                        <span
                          className="material-symbols-outlined text-[20px] text-primary"
                          aria-hidden="true"
                        >
                          info
                        </span>
                        <p className="text-sm text-on-surface-variant">{resetNote}</p>
                      </div>
                    )}
                    {resetTokenIsDev && (
                      <Chip label="Dev mode — token prefilled" tone="green" icon="science" />
                    )}
                    <Input
                      label="Reset Token"
                      icon="key"
                      autoComplete="one-time-code"
                      placeholder="Paste your reset token"
                      value={resetToken}
                      onChange={(e) => {
                        setResetToken(e.target.value);
                        if (resetTokenError) setResetTokenError(undefined);
                      }}
                      error={resetTokenError}
                    />
                    <div className="space-y-2">
                      <Input
                        label="New Password"
                        icon="lock"
                        type={showNewPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="At least 12 characters"
                        value={newPassword}
                        onChange={(e) => {
                          setNewPassword(e.target.value);
                          if (newPasswordError) setNewPasswordError(undefined);
                        }}
                        error={newPasswordError}
                        trailing={
                          <button
                            type="button"
                            onClick={() => setShowNewPassword((v) => !v)}
                            aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                            aria-pressed={showNewPassword}
                            className="ml-2 text-outline hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"
                          >
                            <span className="material-symbols-outlined" aria-hidden="true">
                              {showNewPassword ? 'visibility' : 'visibility_off'}
                            </span>
                          </button>
                        }
                      />
                      <PasswordChecklist password={newPassword} />
                    </div>
                    <PrimaryButton type="submit" loading={resetBusy}>
                      Set new password
                    </PrimaryButton>
                  </form>
                )}

                <button
                  type="button"
                  onClick={closeReset}
                  className="mx-auto flex items-center gap-1 text-sm font-medium text-secondary hover:underline rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    arrow_back
                  </span>
                  Back to sign in
                </button>
              </>
            ) : (
              <>
            <div className="space-y-2">
              <h2 className="font-heading font-semibold text-[28px] leading-8 text-on-surface">
                {isRegister ? 'Create Account' : 'Welcome Back'}
              </h2>
              <p className="text-base text-on-surface-variant">
                {isRegister
                  ? 'Start your aquatic wellness journey today.'
                  : 'Dive back into your fitness metrics.'}
              </p>
            </div>

            <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-4">
              {isRegister && (
                <Input
                  label="Display Name (optional)"
                  icon="badge"
                  autoComplete="nickname"
                  placeholder="How should we call you?"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  error={errors.displayName}
                  maxLength={60}
                />
              )}
              <Input
                label="Email Address"
                icon="mail"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                }}
                error={errors.email}
              />
              <div className="space-y-2">
                <Input
                  label="Password"
                  icon="lock"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  placeholder={isRegister ? 'At least 12 characters' : 'Your password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  error={errors.password}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      className="ml-2 text-outline hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {showPassword ? 'visibility' : 'visibility_off'}
                      </span>
                    </button>
                  }
                />
                {isRegister && <PasswordChecklist password={password} />}
                {!isRegister && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={openReset}
                      className="text-sm font-medium text-primary hover:underline rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}
              </div>

              <PrimaryButton type="submit" loading={submitting}>
                {isRegister ? 'Create Account' : 'Sign In'}
              </PrimaryButton>
            </form>

            {isTMA() && (
              <>
                <div className="relative flex items-center py-1" aria-hidden="true">
                  <div className="flex-grow border-t border-outline-variant" />
                  <span className="flex-shrink mx-4 text-sm text-outline">or</span>
                  <div className="flex-grow border-t border-outline-variant" />
                </div>
                <button
                  type="button"
                  onClick={() => void onTelegram()}
                  disabled={tgLoading}
                  className="w-full min-h-[56px] rounded-2xl border border-outline-variant bg-surface-container-low flex items-center justify-center gap-3 text-sm font-medium text-on-surface hover:bg-surface-container-high transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-primary" aria-hidden="true">
                    send
                  </span>
                  {tgLoading ? 'Connecting…' : 'Continue with Telegram'}
                </button>
              </>
            )}

            <p className="text-center text-sm text-on-surface-variant">
              By continuing, you agree to our terms and acknowledge that AquaZeroFit provides
              general wellness support only.
            </p>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function SignIn() {
  if (tokenStore.isAuthenticated) return <Navigate to="/" replace />;
  return (
    <ToastProvider>
      <SignInInner />
    </ToastProvider>
  );
}
