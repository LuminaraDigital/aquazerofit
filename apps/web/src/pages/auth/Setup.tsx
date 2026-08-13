/**
 * Wellness essentials — the one form the product still insists on, and only at
 * the moment a target is actually wanted.
 *
 * Scope is set by the target calculator, not by what would be nice to know:
 * Mifflin-St Jeor needs weight, height and age (sex shifts the offset and has a
 * documented neutral value), the activity factor needs activity level, and the
 * goal adjustment needs the goal. Six controls, one screen. Everything the old
 * four-step wizard also demanded — training experience, equipment, dietary
 * preferences, allergies, a target weight — feeds personalisation rather than
 * arithmetic, so it is written at its conservative value here (bodyweight-only,
 * beginner progression, no declared exclusions) and edited later in Settings,
 * where those fields already live.
 */
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RANGES, profileSchema, type ProfileInput } from '@aquazerofit/shared';
import {
  cmToFtIn,
  displayToKg,
  ftInToCm,
  kgToDisplay,
  weightUnit,
  formatKcal,
  formatMl,
} from '../../lib/format';
import { haptic } from '../../lib/telegram';
import { useTargets, useUpdateConsents, useUpdateProfile } from '../../lib/queries';
import { useProfileGate } from '../../components/layout/RequireAuth';
import { Input } from '../../components/ui/Input';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { SecondaryButton } from '../../components/ui/SecondaryButton';
import { RingProgress } from '../../components/ui/RingProgress';
import { PageSpinner } from '../../components/ui/PageSpinner';
import { useToast } from '../../components/ui/Toast';
import { OptionCardGroup, SegmentedOptions, UnitToggle } from '../../components/ui/fields';

type ActivityLevel = ProfileInput['activityLevel'];

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: 'sedentary', label: 'Sedentary', hint: 'Desk-bound, little exercise.' },
  { value: 'light', label: 'Light', hint: 'Light exercise 1–3 days a week.' },
  { value: 'moderate', label: 'Moderate', hint: 'Exercise 3–5 days a week.' },
  { value: 'active', label: 'Active', hint: 'Hard exercise 6–7 days a week.' },
  { value: 'veryActive', label: 'Very active', hint: 'Physical job or twice-daily training.' },
];

interface FormState {
  unit: 'metric' | 'imperial';
  age: string;
  sex: 'male' | 'female' | 'unspecified';
  heightCm: string;
  heightFt: string;
  heightIn: string;
  weight: string;
  goal: 'lose' | 'maintain' | 'gain' | null;
  activityLevel: ActivityLevel | null;
  consentWellness: boolean;
  consentAi: boolean;
  consentAnalytics: boolean;
  consentReminders: boolean;
}

const EMPTY: FormState = {
  unit: 'metric',
  age: '',
  sex: 'unspecified',
  heightCm: '',
  heightFt: '',
  heightIn: '',
  weight: '',
  goal: null,
  activityLevel: null,
  consentWellness: false,
  consentAi: true,
  consentAnalytics: true,
  consentReminders: true,
};

function resolveHeightCm(s: FormState): number {
  if (s.unit === 'imperial') {
    return ftInToCm(Number(s.heightFt) || 0, Number(s.heightIn) || 0);
  }
  return Number(s.heightCm) || 0;
}

function resolveWeightKg(s: FormState): number {
  return Math.round(displayToKg(Number(s.weight) || 0, s.unit) * 10) / 10;
}

/** Same-origin relative paths only — the `next` parameter is user-controllable. */
function safeNext(path: string | null): string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return '/';
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return '/';
  return path;
}

export default function Setup() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const toast = useToast();
  const { profile, refetchProfile } = useProfileGate();
  const updateProfile = useUpdateProfile();
  const updateConsents = useUpdateConsents();

  const next = safeNext(params.get('next'));
  // Consents are collected once, with the first profile. Re-running the form
  // later must not quietly reset choices the user has since changed.
  const isFirstSetup = profile === null;

  const [phase, setPhase] = useState<'form' | 'reveal'>('form');
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<FormState>(() => {
    if (!profile) return EMPTY;
    const { ft, inches } = cmToFtIn(profile.heightCm);
    return {
      ...EMPTY,
      unit: profile.unitPreference,
      age: String(profile.age),
      sex: profile.sex,
      heightCm: String(profile.heightCm),
      heightFt: String(ft),
      heightIn: String(inches),
      weight: String(kgToDisplay(profile.weightKg, profile.unitPreference)),
      goal: profile.goal,
      activityLevel: profile.activityLevel,
    };
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  function validate(): string | null {
    const age = Number(state.age);
    if (!Number.isInteger(age) || age < RANGES.age.min || age > RANGES.age.max) {
      return `Age must be between ${RANGES.age.min} and ${RANGES.age.max}.`;
    }
    const heightCm = resolveHeightCm(state);
    if (heightCm < RANGES.heightCm.min || heightCm > RANGES.heightCm.max) {
      return state.unit === 'imperial'
        ? "Height must be between 3'4\" and 8'2\"."
        : `Height must be between ${RANGES.heightCm.min} and ${RANGES.heightCm.max} cm.`;
    }
    const weightKg = resolveWeightKg(state);
    if (weightKg < RANGES.weightKg.min || weightKg > RANGES.weightKg.max) {
      return `Weight must be between ${kgToDisplay(RANGES.weightKg.min, state.unit)} and ${kgToDisplay(RANGES.weightKg.max, state.unit)} ${weightUnit(state.unit)}.`;
    }
    if (!state.goal) return 'Pick the goal that fits you best.';
    if (!state.activityLevel) return 'Select your typical activity level.';
    if (isFirstSetup && !state.consentWellness) {
      return 'The wellness data consent is required so we can compute your targets.';
    }
    return null;
  }

  async function submit() {
    const problem = validate();
    setError(problem);
    if (problem) {
      haptic('error');
      return;
    }
    const input: ProfileInput = {
      age: Number(state.age),
      sex: state.sex,
      heightCm: resolveHeightCm(state),
      weightKg: resolveWeightKg(state),
      goal: state.goal ?? 'maintain',
      activityLevel: state.activityLevel ?? 'moderate',
      unitPreference: state.unit,
      // Deferred personalisation: keep whatever the account already has,
      // otherwise the most conservative value. None of these change a target.
      exerciseExperience: profile?.exerciseExperience ?? 'beginner',
      equipment: profile?.equipment ?? ['none'],
      dietaryPreferences: profile?.dietaryPreferences ?? [],
      allergies: profile?.allergies ?? [],
      ...(profile?.targetWeightKg != null ? { targetWeightKg: profile.targetWeightKg } : {}),
    };
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please review your details.');
      return;
    }
    try {
      await updateProfile.mutateAsync(parsed.data);
      if (isFirstSetup) {
        await updateConsents.mutateAsync({
          wellnessDataProcessing: state.consentWellness,
          aiPersonalisation: state.consentAi,
          anonymisedAnalytics: state.consentAnalytics,
          reminders: state.consentReminders,
        });
      }
      refetchProfile();
      haptic('success');
      setPhase('reveal');
    } catch {
      haptic('error');
      toast.error('We could not save your details. Please try again.');
    }
  }

  if (phase === 'reveal') {
    return <TargetsReveal onDone={() => navigate(next, { replace: true })} />;
  }

  const activityHint = ACTIVITY_OPTIONS.find((o) => o.value === state.activityLevel)?.hint;

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col px-container-margin pt-8 pb-10">
      <h1 className="font-heading font-semibold uppercase tracking-wide text-[28px] leading-8 text-on-surface mb-1">
        Your daily targets
      </h1>
      <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">
        Six answers is everything the calculator needs. Nothing here is a guess — your
        calories, macros and water come straight out of these numbers.
      </p>

      <div className="flex-1 space-y-6">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-on-surface-variant ml-1">Units</span>
          <UnitToggle value={state.unit} onChange={(unit) => set('unit', unit)} />
        </div>

        <Input
          label="Age"
          icon="cake"
          type="number"
          inputMode="numeric"
          min={RANGES.age.min}
          max={RANGES.age.max}
          placeholder="e.g. 28"
          value={state.age}
          onChange={(e) => set('age', e.target.value)}
        />

        {state.unit === 'metric' ? (
          <Input
            label="Height (cm)"
            icon="height"
            type="number"
            inputMode="decimal"
            min={RANGES.heightCm.min}
            max={RANGES.heightCm.max}
            placeholder="e.g. 175"
            value={state.heightCm}
            onChange={(e) => set('heightCm', e.target.value)}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Height (ft)"
              icon="height"
              type="number"
              inputMode="numeric"
              min={3}
              max={8}
              placeholder="5"
              value={state.heightFt}
              onChange={(e) => set('heightFt', e.target.value)}
            />
            <Input
              label="Height (in)"
              type="number"
              inputMode="numeric"
              min={0}
              max={11}
              placeholder="10"
              value={state.heightIn}
              onChange={(e) => set('heightIn', e.target.value)}
            />
          </div>
        )}

        <Input
          label={`Weight (${weightUnit(state.unit)})`}
          icon="monitor_weight"
          type="number"
          inputMode="decimal"
          placeholder={state.unit === 'imperial' ? 'e.g. 165' : 'e.g. 75'}
          value={state.weight}
          onChange={(e) => set('weight', e.target.value)}
        />

        <SegmentedOptions
          label="Sex (used only for the calorie formula)"
          value={state.sex}
          onChange={(sex) => set('sex', sex)}
          options={[
            { value: 'female', label: 'Female' },
            { value: 'male', label: 'Male' },
            { value: 'unspecified', label: 'Prefer not to say' },
          ]}
        />

        <OptionCardGroup
          label="Goal"
          value={state.goal}
          onChange={(goal) => set('goal', goal)}
          options={[
            {
              value: 'lose',
              title: 'Lose weight',
              body: 'A sustainable calorie deficit — never below safe floors.',
              icon: 'trending_down',
            },
            {
              value: 'maintain',
              title: 'Maintain',
              body: 'Hold steady and build healthy habits.',
              icon: 'balance',
            },
            {
              value: 'gain',
              title: 'Gain muscle',
              body: 'A gentle surplus with protein to build strength.',
              icon: 'trending_up',
            },
          ]}
        />

        <div className="space-y-2">
          <SegmentedOptions
            label="Typical activity"
            value={state.activityLevel}
            onChange={(v) => set('activityLevel', v)}
            options={ACTIVITY_OPTIONS.map(({ value, label }) => ({ value, label }))}
          />
          {activityHint && (
            <p className="text-xs text-on-surface-variant ml-1">{activityHint}</p>
          )}
        </div>

        {isFirstSetup && (
          <fieldset className="glass-card p-card-padding space-y-4">
            <legend className="sr-only">Consent choices</legend>
            <ConsentCheckbox
              checked={state.consentWellness}
              onChange={(v) => set('consentWellness', v)}
              title="Wellness data processing (required)"
              body="Allow AquaZeroFit to process your biometric and log data to compute calorie and macro targets."
            />
            <ConsentCheckbox
              checked={state.consentAi}
              onChange={(v) => set('consentAi', v)}
              title="AI personalisation"
              body="Use your data to personalise coach answers, meal ideas and training plans."
            />
            <ConsentCheckbox
              checked={state.consentAnalytics}
              onChange={(v) => set('consentAnalytics', v)}
              title="Anonymised analytics"
              body="Help improve the product with anonymised usage statistics."
            />
            <ConsentCheckbox
              checked={state.consentReminders}
              onChange={(v) => set('consentReminders', v)}
              title="Reminders"
              body="Allow meal, water, workout and weigh-in reminders (configurable later)."
            />
          </fieldset>
        )}

        {error && (
          <p role="alert" className="flex items-center gap-1.5 text-sm text-tertiary-container">
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              error
            </span>
            {error}
          </p>
        )}
      </div>

      <div className="mt-8 space-y-3">
        <PrimaryButton
          onClick={() => void submit()}
          loading={updateProfile.isPending || updateConsents.isPending}
        >
          Show my targets
        </PrimaryButton>
        <SecondaryButton onClick={() => navigate(next, { replace: true })} className="min-h-[48px]">
          Not now
        </SecondaryButton>
      </div>
    </div>
  );
}

function ConsentCheckbox({
  checked,
  onChange,
  title,
  body,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  title: string;
  body: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-5 h-5 shrink-0 rounded border-outline-variant bg-surface-container-lowest text-secondary-container accent-[#00bd85] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      />
      <span>
        <span className="block text-sm font-medium text-on-surface">{title}</span>
        <span className="block text-xs text-on-surface-variant mt-0.5">{body}</span>
      </span>
    </label>
  );
}

/**
 * The payoff screen. Kept from the original wizard — seeing the numbers appear
 * is the moment the six questions justify themselves — and it now also names
 * where the deferred parts of the profile are picked up.
 */
function TargetsReveal({ onDone }: { onDone: () => void }) {
  const { data: targets, isLoading } = useTargets();

  if (isLoading || !targets) return <PageSpinner />;

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col px-container-margin pt-10 pb-10">
      <div className="text-center mb-8">
        <span
          className="material-symbols-outlined text-secondary text-5xl mb-3 inline-block"
          style={{ fontVariationSettings: "'FILL' 1" }}
          aria-hidden="true"
        >
          verified
        </span>
        <h1 className="font-heading font-semibold uppercase tracking-wide text-[28px] leading-8 text-on-surface">
          Your daily targets
        </h1>
        <p className="text-sm text-on-surface-variant mt-2">
          Computed from your details with the Mifflin-St Jeor formula. They adapt as you log.
        </p>
      </div>

      <div className="flex justify-center mb-6">
        <RingProgress
          value={targets.kcalTarget}
          target={targets.kcalTarget}
          size={180}
          strokeWidth={10}
          tone="aqua"
          label={formatKcal(targets.kcalTarget)}
          sublabel="kcal / day"
        />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="flex flex-col items-center gap-1">
          <RingProgress
            value={targets.proteinG}
            target={targets.proteinG}
            size={88}
            strokeWidth={6}
            tone="green"
            label={`${Math.round(targets.proteinG)}g`}
          />
          <span className="text-xs text-on-surface-variant">Protein</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <RingProgress
            value={targets.carbsG}
            target={targets.carbsG}
            size={88}
            strokeWidth={6}
            tone="aqua"
            label={`${Math.round(targets.carbsG)}g`}
          />
          <span className="text-xs text-on-surface-variant">Carbs</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <RingProgress
            value={targets.fatG}
            target={targets.fatG}
            size={88}
            strokeWidth={6}
            tone="coral"
            label={`${Math.round(targets.fatG)}g`}
          />
          <span className="text-xs text-on-surface-variant">Fat</span>
        </div>
      </div>

      <div className="glass-card p-4 flex items-center gap-3 mb-4">
        <span className="material-symbols-outlined text-primary" aria-hidden="true">
          water_drop
        </span>
        <span className="text-sm text-on-surface">
          Daily water target:{' '}
          <span className="tabular-nums font-bold">{formatMl(targets.waterMl)}</span>
        </span>
      </div>

      {targets.clamped && (
        <div
          role="note"
          className="glass-card border-l-4 border-l-secondary p-4 flex gap-3 mb-4"
        >
          <span className="material-symbols-outlined text-secondary shrink-0" aria-hidden="true">
            info
          </span>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            We adjusted your calorie target to a safe minimum
            {targets.clampReason ? ` (${targets.clampReason})` : ''}. Slower, sustainable progress
            protects your health — AquaZeroFit never recommends eating below this floor.
          </p>
        </div>
      )}

      <p className="text-xs text-on-surface-variant/70 leading-relaxed mb-4">
        Allergies, dietary preferences, home equipment and training experience live in
        Settings — add them whenever you like and the plans and meal ideas will follow.
      </p>

      <div className="mt-auto">
        <PrimaryButton onClick={onDone}>Continue</PrimaryButton>
      </div>
    </div>
  );
}
