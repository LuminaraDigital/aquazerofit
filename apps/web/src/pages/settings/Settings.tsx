/**
 * Profile & Settings — pixel reference:
 * Figma_aquazerofit_wellness_platform/settings_profile.
 */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ALLERGENS,
  DIETARY_PREFERENCES,
  RANGES,
  SOURCE_CODE_URL,
  WELLNESS_DISCLAIMER,
  profileSchema,
  setCredentialsSchema,
  type Allergen,
  type DietaryPreference,
  type ProfileInput,
  type PublicUser,
  type WellnessProfile,
} from '@aquazerofit/shared';
import { api, ApiError } from '../../lib/api';
import {
  cmToFtIn,
  displayToKg,
  formatHeight,
  formatMonthYear,
  formatWeight,
  ftInToCm,
  kgToDisplay,
  todayLocalDate,
  weightUnit,
} from '../../lib/format';
import { getTelegramInitData, haptic, isTMA } from '../../lib/telegram';
import {
  useAuthActions,
  useConsents,
  useLinkTelegram,
  useMe,
  useProfile,
  useSetCredentials,
  useUpdateConsents,
  useUpdateMe,
  useUpdateProfile,
} from '../../lib/queries';
import { AppHeader } from '../../components/ui/AppHeader';
import { BottomNav } from '../../components/ui/BottomNav';
import { Chip } from '../../components/ui/Chip';
import { ErrorState } from '../../components/ui/ErrorState';
import { Input } from '../../components/ui/Input';
import { PageSpinner } from '../../components/ui/PageSpinner';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { SecondaryButton } from '../../components/ui/SecondaryButton';
import { useToast } from '../../components/ui/Toast';
import { SegmentedOptions, Switch, UnitToggle } from '../../components/ui/fields';
import { TargetsNotSetCard, setupHref } from '../auth/SetupPrompt';
import { useHashTarget } from './useHashTarget';

const APP_VERSION = 'v1.0.0';

/**
 * Deep-link target for the AI personalisation consent. Other surfaces link to
 * `/settings#privacy-consents`; the string is exported so a rename cannot
 * quietly break them.
 */
export const PRIVACY_CONSENTS_ANCHOR = 'privacy-consents';

const DIETARY_LABELS: Record<DietaryPreference, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  pescatarian: 'Pescatarian',
  halal: 'Halal',
  kosher: 'Kosher',
  glutenFree: 'Gluten-free',
  dairyFree: 'Dairy-free',
  lowCarb: 'Low carb',
  highProtein: 'High protein',
};

const ALLERGEN_LABELS: Record<Allergen, string> = {
  peanuts: 'Peanuts',
  treeNuts: 'Tree nuts',
  milk: 'Milk',
  eggs: 'Eggs',
  fish: 'Fish',
  shellfish: 'Shellfish',
  soy: 'Soy',
  wheat: 'Wheat',
  sesame: 'Sesame',
};

const GOAL_LABELS = { lose: 'Lose weight', maintain: 'Maintain', gain: 'Gain muscle' } as const;
const ACTIVITY_LABELS = {
  sedentary: 'Sedentary',
  light: 'Lightly active',
  moderate: 'Moderately active',
  active: 'Active',
  veryActive: 'Very active',
} as const;
const EXPERIENCE_LABELS = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
} as const;

function toProfileInput(p: WellnessProfile): ProfileInput {
  return {
    weightKg: p.weightKg,
    heightCm: p.heightCm,
    age: p.age,
    sex: p.sex,
    goal: p.goal,
    activityLevel: p.activityLevel,
    exerciseExperience: p.exerciseExperience,
    dietaryPreferences: p.dietaryPreferences,
    allergies: p.allergies,
    equipment: p.equipment,
    unitPreference: p.unitPreference,
    ...(p.targetWeightKg != null ? { targetWeightKg: p.targetWeightKg } : {}),
  };
}

export default function Settings() {
  const navigate = useNavigate();
  const toast = useToast();
  const { logout } = useAuthActions();
  const { data: profile, isLoading, isError, refetch } = useProfile();
  const { data: consents } = useConsents();
  // Identity comes from GET /me; the localStorage snapshot only seeds the
  // first paint (placeholderData inside useMe).
  const { data: user } = useMe();
  const updateProfile = useUpdateProfile();
  const updateConsents = useUpdateConsents();
  const updateMe = useUpdateMe();

  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  // Before the early returns: the section this targets only renders once the
  // profile query resolves, and the hook is built to wait for it.
  useHashTarget(PRIVACY_CONSENTS_ANCHOR);

  if (isLoading) return <PageSpinner />;

  // Three states, and only one of them is a failure:
  //   profile        — the full page
  //   profile null   — a signed-in account that has not set targets up yet.
  //                    Since the profile gate was removed this is a supported,
  //                    first-class state, not an error.
  //   isError        — the request actually failed.
  // Neither of the latter two may short-circuit the page: sign-out, consents,
  // data export and account deletion are the user's rights, and gating them
  // behind "have you entered your height" would strand people with no way to
  // leave or to exercise them. So the failure is scoped to the one section
  // that genuinely depends on the profile, and everything else renders.
  const profileUnavailable = isError && !profile;

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'AquaZeroFit member';
  const initial = displayName.charAt(0).toUpperCase();

  async function saveProfile(patch: Partial<ProfileInput>, successMessage: string) {
    if (!profile) return;
    try {
      await updateProfile.mutateAsync({ ...toProfileInput(profile), ...patch });
      haptic('success');
      toast.success(successMessage);
    } catch {
      haptic('error');
      toast.error('Could not save changes. Please try again.');
    }
  }

  async function toggleConsent(
    key: 'wellnessDataProcessing' | 'aiPersonalisation' | 'anonymisedAnalytics' | 'reminders',
    value: boolean,
  ) {
    if (!consents) return;
    try {
      await updateConsents.mutateAsync({
        wellnessDataProcessing: consents.wellnessDataProcessing,
        aiPersonalisation: consents.aiPersonalisation,
        anonymisedAnalytics: consents.anonymisedAnalytics,
        reminders: consents.reminders,
        [key]: value,
      });
      toast.success('Consent updated.');
    } catch {
      toast.error('Could not update consent.');
    }
  }

  function openNameEditor() {
    setNameDraft(user?.displayName ?? '');
    setEditingName(true);
  }

  async function saveName() {
    const trimmed = nameDraft.trim();
    if (trimmed.length < 1 || trimmed.length > 60) {
      toast.error('Please use a name between 1 and 60 characters.');
      return;
    }
    try {
      await updateMe.mutateAsync({ displayName: trimmed });
      haptic('success');
      toast.success('Name updated.');
      setEditingName(false);
    } catch {
      haptic('error');
      toast.error('Could not update your name. Please try again.');
    }
  }

  async function onExport() {
    setExporting(true);
    try {
      const data = await api<unknown>('/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `aquazerofit-export-${todayLocalDate()}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success('Your data export has been downloaded.');
    } catch {
      toast.error('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  async function onSignOut() {
    await logout();
    navigate('/welcome', { replace: true });
  }

  async function onDeleteAccount() {
    setDeleting(true);
    try {
      await api<void>('/me', { method: 'DELETE' });
      toast.success('Account deletion requested.');
      await logout();
      navigate('/welcome', { replace: true });
    } catch {
      toast.error('Could not delete your account. Please try again.');
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="max-w-md mx-auto min-h-screen relative safe-bottom">
      <AppHeader back title="Profile & Settings" />

      <main className="pt-6 px-container-margin space-y-section-gap">
        {/* Identity hero */}
        <section className="flex flex-col items-center text-center">
          <div className="relative mb-4">
            <div className="w-24 h-24 rounded-full border-4 border-secondary p-1">
              <div
                className="w-full h-full rounded-full cta-gradient flex items-center justify-center"
                aria-hidden="true"
              >
                <span className="font-heading font-bold text-4xl text-[#001f25]">{initial}</span>
              </div>
            </div>
            <div
              className="absolute bottom-0 right-0 bg-secondary text-on-secondary p-1 rounded-full shadow-lg"
              aria-hidden="true"
            >
              <span className="material-symbols-outlined text-[18px]">verified</span>
            </div>
          </div>
          {editingName ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveName();
              }}
              className="w-full max-w-xs space-y-3"
            >
              <Input
                label="Display name"
                icon="badge"
                autoComplete="nickname"
                maxLength={60}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
              />
              <div className="flex gap-3">
                <SecondaryButton
                  onClick={() => setEditingName(false)}
                  disabled={updateMe.isPending}
                  className="min-h-[44px]"
                >
                  Cancel
                </SecondaryButton>
                <PrimaryButton type="submit" loading={updateMe.isPending} className="min-h-[44px]">
                  Save
                </PrimaryButton>
              </div>
            </form>
          ) : (
            <div className="flex items-center gap-1.5">
              <h2 className="font-heading font-semibold text-[22px] leading-7 text-on-surface">
                {displayName}
              </h2>
              <button
                type="button"
                onClick={openNameEditor}
                aria-label="Edit name"
                className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                  edit
                </span>
              </button>
            </div>
          )}
          <p className="text-sm text-on-surface-variant">
            {user?.createdAt ? `Member since ${formatMonthYear(user.createdAt)}` : user?.email ?? ''}
          </p>
        </section>

        {/* Wellness disclaimer */}
        <section>
          <div className="glass-card p-card-padding border-l-4 border-l-secondary flex gap-4">
            <span className="material-symbols-outlined text-secondary shrink-0" aria-hidden="true">
              info
            </span>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-secondary uppercase tracking-wider">
                Wellness Disclaimer
              </h3>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                {WELLNESS_DISCLAIMER}
              </p>
            </div>
          </div>
        </section>

        {/* Wellness profile — the only section that needs the profile */}
        <section>
          <h3 className="font-heading font-semibold uppercase tracking-wide text-xl text-primary mb-3 px-2">
            Wellness Profile
          </h3>
          {profile ? (
            <ProfileSummaryCard
              profile={profile}
              saving={updateProfile.isPending}
              onSave={(patch) => void saveProfile(patch, 'Profile updated — targets recomputed.')}
            />
          ) : profileUnavailable ? (
            <ErrorState
              message="We could not load your wellness profile."
              retry={() => void refetch()}
            />
          ) : (
            // Shared with the first-run home so both surfaces make the same
            // promise about what is missing and how long it takes to supply.
            <TargetsNotSetCard returnTo="/settings" />
          )}
        </section>

        {/* Preferences */}
        <section>
          <h3 className="font-heading font-semibold uppercase tracking-wide text-xl text-primary mb-3 px-2">
            Preferences
          </h3>
          <div className="glass-card overflow-hidden">
            {/*
              Units, diet and allergies are stored *on* the wellness profile, so
              without one there is nothing to write to. They are hidden rather
              than shown broken — an allergen chip that silently fails to save
              would be the worst kind of lie for this particular field. The
              notifications link below is profile-independent and always shows.
            */}
            {profile ? (
              <ProfilePreferenceRows profile={profile} onSave={saveProfile} />
            ) : (
              <p className="p-4 text-sm text-on-surface-variant border-b border-outline-variant/50">
                Units, dietary preferences and allergies are part of your wellness profile.{' '}
                <Link
                  to={setupHref('/settings')}
                  className="text-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"
                >
                  Set it up
                </Link>{' '}
                to choose them.
              </p>
            )}
            <Link
              to="/settings/notifications"
              className="flex items-center justify-between p-4 hover:bg-surface-container-high transition-colors group focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
            >
              <div className="flex items-center gap-3">
                <span
                  className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors"
                  aria-hidden="true"
                >
                  notifications_active
                </span>
                <span className="text-base">Notifications & reminders</span>
              </div>
              <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">
                chevron_right
              </span>
            </Link>
          </div>
        </section>

        {/* Account access — how this account signs in on each surface */}
        {user && <AccountAccessSection user={user} />}

        {/*
          Privacy & consents — deep-link target. scroll-mt clears the sticky
          AppHeader (56px + breathing room) so the heading is not parked under
          it, and tabIndex makes the section a programmatic focus target so
          the arrival is announced rather than only drawn.
        */}
        <section
          id={PRIVACY_CONSENTS_ANCHOR}
          tabIndex={-1}
          aria-labelledby="privacy-consents-heading"
          className="scroll-mt-24 rounded-card outline-none"
        >
          <h3
            id="privacy-consents-heading"
            className="font-heading font-semibold uppercase tracking-wide text-xl text-primary mb-3 px-2"
          >
            Privacy & Consents
          </h3>
          <div className="glass-card overflow-hidden">
            {consents ? (
              (
                [
                  {
                    key: 'wellnessDataProcessing',
                    label: 'Wellness data processing',
                    body: 'Required for target computation.',
                    checked: consents.wellnessDataProcessing,
                  },
                  {
                    key: 'aiPersonalisation',
                    label: 'AI personalisation',
                    body: 'Personalised coach, meals and plans.',
                    checked: consents.aiPersonalisation,
                  },
                  {
                    key: 'anonymisedAnalytics',
                    label: 'Anonymised analytics',
                    body: 'Help improve the product.',
                    checked: consents.anonymisedAnalytics,
                  },
                  {
                    key: 'reminders',
                    label: 'Reminders',
                    body: 'Master switch for all reminders.',
                    checked: consents.reminders,
                  },
                ] as const
              ).map((row, i, arr) => (
                <div
                  key={row.key}
                  className={`flex items-center justify-between p-4 gap-3 ${
                    i < arr.length - 1 ? 'border-b border-outline-variant/50' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <span className="block text-base">{row.label}</span>
                    <span className="block text-xs text-on-surface-variant">{row.body}</span>
                  </div>
                  <Switch
                    checked={row.checked}
                    label={row.label}
                    onChange={(v) => void toggleConsent(row.key, v)}
                  />
                </div>
              ))
            ) : (
              <p className="p-4 text-sm text-on-surface-variant">Loading consent state…</p>
            )}
            <Link
              to="/settings/memory"
              className="flex items-center justify-between p-4 border-t border-outline-variant/50 hover:bg-surface-container-high transition-colors group focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors"
                  aria-hidden="true"
                >
                  psychology
                </span>
                <div className="min-w-0">
                  <span className="block text-base">What your coach remembers</span>
                  <span className="block text-xs text-on-surface-variant">
                    Review, add or delete coach memories.
                  </span>
                </div>
              </div>
              <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">
                chevron_right
              </span>
            </Link>
            <Link
              to="/challenges"
              className="flex items-center justify-between p-4 border-t border-outline-variant/50 hover:bg-surface-container-high transition-colors group focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors"
                  aria-hidden="true"
                >
                  groups
                </span>
                <div className="min-w-0">
                  <span className="block text-base">Buddy huddles</span>
                  <span className="block text-xs text-on-surface-variant">
                    Invite friends to private accountability challenges.
                  </span>
                </div>
              </div>
              <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">
                chevron_right
              </span>
            </Link>
            <button
              type="button"
              onClick={() => void onExport()}
              disabled={exporting}
              className="w-full flex items-center justify-between p-4 border-t border-outline-variant/50 hover:bg-surface-container-high transition-colors text-left disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">
                  download
                </span>
                <span className="text-base">{exporting ? 'Preparing export…' : 'Export my data (JSON)'}</span>
              </div>
              <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">
                chevron_right
              </span>
            </button>
          </div>
        </section>

        {/* Danger zone */}
        <section>
          <h3 className="font-heading font-semibold uppercase tracking-wide text-xl text-coral mb-3 px-2">
            Danger Zone
          </h3>
          <div className="glass-card border-coral/40 p-card-padding space-y-3">
            <p className="text-xs text-on-surface-variant">
              Deleting your account removes your profile, logs and plans after a short grace
              period. This cannot be undone.
            </p>
            <SecondaryButton
              onClick={() => setConfirmDelete(true)}
              className="border-coral text-coral hover:bg-coral/10 min-h-[48px]"
            >
              Delete my account
            </SecondaryButton>
          </div>
        </section>

        {/* Sign out + footer */}
        <div className="pt-2 flex flex-col items-center gap-6 pb-4">
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="text-error font-heading font-semibold uppercase tracking-wider text-lg flex items-center gap-2 hover:opacity-80 transition-opacity active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-error rounded-lg px-2 py-1"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              logout
            </span>
            Sign Out
          </button>
          <div className="text-center space-y-1">
            <p className="text-xs text-on-surface-variant/40">AquaZeroFit {APP_VERSION}</p>
            {/*
              AGPL-3.0 §13: users interacting with this instance over a network must be
              offered its corresponding source. This link is a licence obligation, not a
              credit — do not remove it, and repoint it if you deploy modified source.
            */}
            <p className="text-[10px] text-on-surface-variant/40">
              Free software under{' '}
              <a
                href={`${SOURCE_CODE_URL}/blob/main/LICENSE`}
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:text-on-surface-variant/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"
              >
                AGPL-3.0-or-later
              </a>
              {' · '}
              <a
                href={SOURCE_CODE_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:text-on-surface-variant/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"
              >
                Source code
              </a>
            </p>
            <p className="text-[10px] text-on-surface-variant/40 max-w-xs mx-auto leading-relaxed">
              {WELLNESS_DISCLAIMER}
            </p>
          </div>
        </div>
      </main>

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center px-container-margin bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
        >
          <div className="glass-card w-full max-w-sm p-card-padding space-y-4">
            <h4 id="delete-dialog-title" className="font-heading font-semibold uppercase tracking-wide text-xl text-coral">
              Delete account?
            </h4>
            <p className="text-sm text-on-surface-variant">
              Your profile, meal logs, weight history and training plans will be permanently
              removed after the grace period. Consider exporting your data first.
            </p>
            <div className="space-y-2">
              <PrimaryButton
                onClick={() => void onDeleteAccount()}
                loading={deleting}
                className="!bg-none bg-error-container text-on-error-container"
              >
                Yes, delete my account
              </PrimaryButton>
              <SecondaryButton onClick={() => setConfirmDelete(false)} disabled={deleting}>
                Cancel
              </SecondaryButton>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

// ---------- Account access (email + password / Telegram link) ----------

/**
 * One account, two ways in: email + password (any browser) and Telegram
 * (inside the Mini App). Each row states which of the two this account has
 * and offers the missing one — but only where it can actually be completed:
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
function AccountAccessSection({ user }: { user: PublicUser }) {
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
      toast.success('Email & password set — you can now sign in on the web.');
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
      toast.success('Telegram linked — the Mini App now signs into this account.');
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
                    ? 'Not set — needed to sign in from any browser'
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
                AquaZeroFit in any browser — your data stays on this one account.
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
                  ? 'Connected — the Mini App signs straight into this account'
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

// ---------- Preferences that live on the profile ----------

/**
 * Units, dietary preferences and allergies are fields *of* the wellness
 * profile, so an account that has not set one up has nothing to write them to.
 * They are split out here so the Preferences card can drop them wholesale
 * rather than render controls whose saves cannot land — for allergens in
 * particular, a chip that appears to stick but silently fails would be the
 * worst possible failure mode.
 */
function ProfilePreferenceRows({
  profile,
  onSave,
}: {
  profile: WellnessProfile;
  onSave: (patch: Partial<ProfileInput>, successMessage: string) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between p-4 border-b border-outline-variant/50 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">
            straighten
          </span>
          <span className="text-base">Units</span>
        </div>
        <UnitToggle
          value={profile.unitPreference}
          onChange={(unit) => onSave({ unitPreference: unit }, 'Units updated.')}
        />
      </div>
      <div className="p-4 border-b border-outline-variant/50 space-y-2">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">
            restaurant_menu
          </span>
          <span className="text-base">Dietary preferences</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {DIETARY_PREFERENCES.map((pref) => (
            <Chip
              key={pref}
              label={DIETARY_LABELS[pref]}
              tone="green"
              active={profile.dietaryPreferences.includes(pref)}
              onClick={() =>
                onSave(
                  {
                    dietaryPreferences: profile.dietaryPreferences.includes(pref)
                      ? profile.dietaryPreferences.filter((p) => p !== pref)
                      : [...profile.dietaryPreferences, pref],
                  },
                  'Dietary preferences updated.',
                )
              }
            />
          ))}
        </div>
      </div>
      <div className="p-4 border-b border-outline-variant/50 space-y-2">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">
            warning
          </span>
          <span className="text-base">Allergies</span>
        </div>
        <p className="text-xs text-on-surface-variant">
          Selected allergens are strictly excluded from every suggestion.
        </p>
        <div className="flex flex-wrap gap-2">
          {ALLERGENS.map((allergen) => (
            <Chip
              key={allergen}
              label={ALLERGEN_LABELS[allergen]}
              tone="coral"
              active={profile.allergies.includes(allergen)}
              onClick={() =>
                onSave(
                  {
                    allergies: profile.allergies.includes(allergen)
                      ? profile.allergies.filter((a) => a !== allergen)
                      : [...profile.allergies, allergen],
                  },
                  'Allergies updated.',
                )
              }
            />
          ))}
        </div>
      </div>
    </>
  );
}

// ---------- Profile summary + inline editor ----------

function ProfileSummaryCard({
  profile,
  saving,
  onSave,
}: {
  profile: WellnessProfile;
  saving: boolean;
  onSave: (patch: Partial<ProfileInput>) => void;
}) {
  const [editing, setEditing] = useState(false);

  const rows = [
    { icon: 'cake', label: 'Age', value: `${profile.age}` },
    {
      icon: 'person',
      label: 'Sex',
      value:
        profile.sex === 'unspecified' ? 'Not specified' : profile.sex === 'male' ? 'Male' : 'Female',
    },
    { icon: 'height', label: 'Height', value: formatHeight(profile.heightCm, profile.unitPreference) },
    { icon: 'monitor_weight', label: 'Weight', value: formatWeight(profile.weightKg, profile.unitPreference) },
    { icon: 'flag', label: 'Goal', value: GOAL_LABELS[profile.goal] },
    { icon: 'directions_run', label: 'Activity', value: ACTIVITY_LABELS[profile.activityLevel] },
    { icon: 'fitness_center', label: 'Experience', value: EXPERIENCE_LABELS[profile.exerciseExperience] },
  ];

  if (!editing) {
    return (
      <div className="glass-card overflow-hidden">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between p-4 border-b border-outline-variant/50"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">
                {row.icon}
              </span>
              <span className="text-base">{row.label}</span>
            </div>
            <span className="text-sm text-on-surface-variant tabular-nums">{row.value}</span>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full flex items-center justify-center gap-2 p-4 text-primary hover:bg-surface-container-high transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            edit
          </span>
          <span className="text-sm font-medium uppercase tracking-wider">Edit biometric data</span>
        </button>
      </div>
    );
  }

  return (
    <ProfileEditor
      profile={profile}
      saving={saving}
      onCancel={() => setEditing(false)}
      onSave={(patch) => {
        onSave(patch);
        setEditing(false);
      }}
    />
  );
}

function ProfileEditor({
  profile,
  saving,
  onCancel,
  onSave,
}: {
  profile: WellnessProfile;
  saving: boolean;
  onCancel: () => void;
  onSave: (patch: Partial<ProfileInput>) => void;
}) {
  const unit = profile.unitPreference;
  const { ft, inches } = cmToFtIn(profile.heightCm);
  const [age, setAge] = useState(String(profile.age));
  const [sex, setSex] = useState(profile.sex);
  const [heightCm, setHeightCm] = useState(String(profile.heightCm));
  const [heightFt, setHeightFt] = useState(String(ft));
  const [heightIn, setHeightIn] = useState(String(inches));
  const [weight, setWeight] = useState(String(kgToDisplay(profile.weightKg, unit)));
  const [goal, setGoal] = useState(profile.goal);
  const [activityLevel, setActivityLevel] = useState(profile.activityLevel);
  const [experience, setExperience] = useState(profile.exerciseExperience);
  const [error, setError] = useState<string | null>(null);

  function save() {
    const resolvedHeight =
      unit === 'imperial' ? ftInToCm(Number(heightFt) || 0, Number(heightIn) || 0) : Number(heightCm) || 0;
    const resolvedWeight = Math.round(displayToKg(Number(weight) || 0, unit) * 10) / 10;
    const patch: Partial<ProfileInput> = {
      age: Number(age),
      sex,
      heightCm: resolvedHeight,
      weightKg: resolvedWeight,
      goal,
      activityLevel,
      exerciseExperience: experience,
    };
    const check = profileSchema.safeParse({
      weightKg: resolvedWeight,
      heightCm: resolvedHeight,
      age: Number(age),
      sex,
      goal,
      activityLevel,
      exerciseExperience: experience,
      dietaryPreferences: profile.dietaryPreferences,
      allergies: profile.allergies,
      equipment: profile.equipment,
      unitPreference: unit,
    });
    if (!check.success) {
      setError(check.error.issues[0]?.message ?? 'Please review your details.');
      return;
    }
    setError(null);
    onSave(patch);
  }

  return (
    <div className="glass-card p-card-padding space-y-4">
      <Input
        label="Age"
        icon="cake"
        type="number"
        inputMode="numeric"
        min={RANGES.age.min}
        max={RANGES.age.max}
        value={age}
        onChange={(e) => setAge(e.target.value)}
      />
      <SegmentedOptions
        label="Sex"
        value={sex}
        onChange={setSex}
        options={[
          { value: 'female', label: 'Female' },
          { value: 'male', label: 'Male' },
          { value: 'unspecified', label: 'Prefer not to say' },
        ]}
      />
      {unit === 'metric' ? (
        <Input
          label="Height (cm)"
          icon="height"
          type="number"
          inputMode="decimal"
          value={heightCm}
          onChange={(e) => setHeightCm(e.target.value)}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Height (ft)"
            icon="height"
            type="number"
            inputMode="numeric"
            value={heightFt}
            onChange={(e) => setHeightFt(e.target.value)}
          />
          <Input
            label="Height (in)"
            type="number"
            inputMode="numeric"
            value={heightIn}
            onChange={(e) => setHeightIn(e.target.value)}
          />
        </div>
      )}
      <Input
        label={`Weight (${weightUnit(unit)})`}
        icon="monitor_weight"
        type="number"
        inputMode="decimal"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
      />
      <SegmentedOptions
        label="Goal"
        value={goal}
        onChange={setGoal}
        options={[
          { value: 'lose', label: 'Lose weight' },
          { value: 'maintain', label: 'Maintain' },
          { value: 'gain', label: 'Gain muscle' },
        ]}
      />
      <SegmentedOptions
        label="Activity level"
        value={activityLevel}
        onChange={setActivityLevel}
        options={[
          { value: 'sedentary', label: 'Sedentary' },
          { value: 'light', label: 'Light' },
          { value: 'moderate', label: 'Moderate' },
          { value: 'active', label: 'Active' },
          { value: 'veryActive', label: 'Very active' },
        ]}
      />
      <SegmentedOptions
        label="Exercise experience"
        value={experience}
        onChange={setExperience}
        options={[
          { value: 'beginner', label: 'Beginner' },
          { value: 'intermediate', label: 'Intermediate' },
          { value: 'advanced', label: 'Advanced' },
        ]}
      />
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-tertiary-container">
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            error
          </span>
          {error}
        </p>
      )}
      <div className="flex gap-3 pt-1">
        <SecondaryButton onClick={onCancel} disabled={saving} className="min-h-[48px]">
          Cancel
        </SecondaryButton>
        <PrimaryButton onClick={save} loading={saving} className="min-h-[48px]">
          Save
        </PrimaryButton>
      </div>
    </div>
  );
}
