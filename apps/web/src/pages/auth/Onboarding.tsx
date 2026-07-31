/**
 * 4-step onboarding wizard (no Figma mock — built in the Modern Aquatic
 * Wellness design language). Ends with a computed-targets reveal screen.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ALLERGENS,
  DIETARY_PREFERENCES,
  EQUIPMENT,
  RANGES,
  profileSchema,
  type Allergen,
  type DietaryPreference,
  type Equipment,
  type ProfileInput,
} from '@aquazerofit/shared';
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
import { EQUIPMENT_ICONS, EQUIPMENT_LABELS } from '../../lib/equipmentMeta';
import { useTargets, useUpdateConsents, useUpdateProfile } from '../../lib/queries';
import { useProfileGate } from '../../components/layout/RequireAuth';
import { Input } from '../../components/ui/Input';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { SecondaryButton } from '../../components/ui/SecondaryButton';
import { RingProgress } from '../../components/ui/RingProgress';
import { PageSpinner } from '../../components/ui/PageSpinner';
import { Chip } from '../../components/ui/Chip';
import { useToast } from '../../components/ui/Toast';
import { OptionCardGroup, SegmentedOptions, UnitToggle } from '../../components/ui/fields';

const STEP_TITLES = ['The Basics', 'Your Goal', 'Lifestyle', 'Nutrition & Consent'];

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

interface WizardState {
  unit: 'metric' | 'imperial';
  age: string;
  sex: 'male' | 'female' | 'unspecified';
  heightCm: string; // metric entry
  heightFt: string; // imperial entry
  heightIn: string;
  weight: string; // in display unit
  goal: 'lose' | 'maintain' | 'gain' | null;
  targetWeightKg: number | null;
  activityLevel: ProfileInput['activityLevel'] | null;
  exerciseExperience: ProfileInput['exerciseExperience'] | null;
  equipment: Equipment[];
  dietaryPreferences: DietaryPreference[];
  allergies: Allergen[];
  consentWellness: boolean;
  consentAi: boolean;
  consentAnalytics: boolean;
  consentReminders: boolean;
}

const INITIAL: WizardState = {
  unit: 'metric',
  age: '',
  sex: 'unspecified',
  heightCm: '',
  heightFt: '',
  heightIn: '',
  weight: '',
  goal: null,
  targetWeightKg: null,
  activityLevel: null,
  exerciseExperience: null,
  equipment: [],
  dietaryPreferences: [],
  allergies: [],
  consentWellness: false,
  consentAi: true,
  consentAnalytics: true,
  consentReminders: true,
};

function resolveHeightCm(s: WizardState): number {
  if (s.unit === 'imperial') {
    return ftInToCm(Number(s.heightFt) || 0, Number(s.heightIn) || 0);
  }
  return Number(s.heightCm) || 0;
}

function resolveWeightKg(s: WizardState): number {
  const value = Number(s.weight) || 0;
  return Math.round(displayToKg(value, s.unit) * 10) / 10;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const toast = useToast();
  const { profile, refetchProfile } = useProfileGate();
  const updateProfile = useUpdateProfile();
  const updateConsents = useUpdateConsents();

  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<'wizard' | 'reveal'>('wizard');
  const [stepError, setStepError] = useState<string | null>(null);
  const [state, setState] = useState<WizardState>(() => {
    if (!profile) return INITIAL;
    // Re-running onboarding with an existing profile: prefill.
    const { ft, inches } = cmToFtIn(profile.heightCm);
    return {
      unit: profile.unitPreference,
      age: String(profile.age),
      sex: profile.sex,
      heightCm: String(profile.heightCm),
      heightFt: String(ft),
      heightIn: String(inches),
      weight: String(kgToDisplay(profile.weightKg, profile.unitPreference)),
      goal: profile.goal,
      targetWeightKg: profile.targetWeightKg ?? null,
      activityLevel: profile.activityLevel,
      exerciseExperience: profile.exerciseExperience,
      equipment: profile.equipment,
      dietaryPreferences: profile.dietaryPreferences,
      allergies: profile.allergies,
      consentWellness: false,
      consentAi: true,
      consentAnalytics: true,
      consentReminders: true,
    };
  });

  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  function validateStep(): string | null {
    if (step === 0) {
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
      return null;
    }
    if (step === 1) {
      if (!state.goal) return 'Pick the goal that fits you best.';
      if (state.goal !== 'maintain' && state.targetWeightKg == null) {
        return 'Set your target weight with the slider.';
      }
      return null;
    }
    if (step === 2) {
      if (!state.activityLevel) return 'Select your typical activity level.';
      if (!state.exerciseExperience) return 'Select your exercise experience.';
      return null;
    }
    if (step === 3) {
      if (!state.consentWellness) {
        return 'The wellness data consent is required so we can compute your targets.';
      }
      return null;
    }
    return null;
  }

  function next() {
    const error = validateStep();
    setStepError(error);
    if (error) {
      haptic('error');
      return;
    }
    haptic('light');
    if (step === 1 && state.goal === 'maintain') {
      // Clear stale target weight when switching to maintain.
      set('targetWeightKg', null);
    }
    setStep((s) => Math.min(3, s + 1));
  }

  function back() {
    setStepError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  async function submit() {
    const error = validateStep();
    setStepError(error);
    if (error) {
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
      exerciseExperience: state.exerciseExperience ?? 'beginner',
      dietaryPreferences: state.dietaryPreferences,
      allergies: state.allergies,
      equipment: state.equipment.length > 0 ? state.equipment : ['none'],
      unitPreference: state.unit,
      ...(state.goal !== 'maintain' && state.targetWeightKg != null
        ? { targetWeightKg: state.targetWeightKg }
        : {}),
    };
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) {
      setStepError(parsed.error.issues[0]?.message ?? 'Please review your details.');
      return;
    }
    try {
      await updateProfile.mutateAsync(parsed.data);
      await updateConsents.mutateAsync({
        wellnessDataProcessing: state.consentWellness,
        aiPersonalisation: state.consentAi,
        anonymisedAnalytics: state.consentAnalytics,
        reminders: state.consentReminders,
      });
      refetchProfile();
      haptic('success');
      setPhase('reveal');
    } catch {
      haptic('error');
      toast.error('We could not save your profile. Please try again.');
    }
  }

  if (phase === 'reveal') {
    return <TargetsReveal onDone={() => navigate('/', { replace: true })} />;
  }

  const weightKg = resolveWeightKg(state);
  const sliderMin =
    state.goal === 'gain' ? weightKg : Math.max(RANGES.weightKg.min, weightKg - 40);
  const sliderMax =
    state.goal === 'gain' ? Math.min(RANGES.weightKg.max, weightKg + 40) : weightKg;

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col px-container-margin pt-8 pb-10">
      {/* Progress indicator */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase tracking-widest text-on-surface-variant">
            Step {step + 1} of 4
          </span>
          <span className="text-xs text-on-surface-variant">{STEP_TITLES[step]}</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={step + 1}
          aria-valuemin={1}
          aria-valuemax={4}
          aria-label={`Onboarding step ${step + 1} of 4: ${STEP_TITLES[step]}`}
          className="flex gap-1.5"
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-primary' : 'bg-surface-container-highest'
              }`}
            />
          ))}
        </div>
      </div>

      <h1 className="font-heading font-semibold uppercase tracking-wide text-[28px] leading-8 text-on-surface mb-1">
        {STEP_TITLES[step]}
      </h1>
      <p className="text-sm text-on-surface-variant mb-6">
        {step === 0 && 'Tell us about yourself so we can personalise your targets.'}
        {step === 1 && 'What are you working towards?'}
        {step === 2 && 'How active are you, and what do you train with?'}
        {step === 3 && 'Food preferences, allergies and your consent choices.'}
      </p>

      <div className="flex-1 space-y-6">
        {step === 0 && (
          <>
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
            <SegmentedOptions
              label="Sex (used for calorie formulas)"
              value={state.sex}
              onChange={(sex) => set('sex', sex)}
              options={[
                { value: 'female', label: 'Female' },
                { value: 'male', label: 'Male' },
                { value: 'unspecified', label: 'Prefer not to say' },
              ]}
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
          </>
        )}

        {step === 1 && (
          <>
            <OptionCardGroup
              label="Goal"
              value={state.goal}
              onChange={(goal) => {
                set('goal', goal);
                if (goal !== 'maintain' && state.targetWeightKg == null) {
                  const w = resolveWeightKg(state);
                  set('targetWeightKg', goal === 'lose' ? Math.max(RANGES.weightKg.min, w - 5) : Math.min(RANGES.weightKg.max, w + 5));
                }
              }}
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
            {state.goal && state.goal !== 'maintain' && (
              <div className="glass-card p-card-padding space-y-3">
                <div className="flex items-baseline justify-between">
                  <label htmlFor="target-weight" className="text-sm font-medium text-on-surface-variant">
                    Target weight
                  </label>
                  <span className="tabular-nums font-body font-bold text-xl text-primary">
                    {kgToDisplay(state.targetWeightKg ?? weightKg, state.unit)}{' '}
                    <span className="text-sm font-medium text-on-surface-variant">
                      {weightUnit(state.unit)}
                    </span>
                  </span>
                </div>
                <input
                  id="target-weight"
                  type="range"
                  min={sliderMin}
                  max={sliderMax}
                  step={0.5}
                  value={state.targetWeightKg ?? weightKg}
                  onChange={(e) => set('targetWeightKg', Number(e.target.value))}
                  className="w-full accent-[#2fd9f4] h-2 cursor-pointer"
                  aria-valuetext={`${kgToDisplay(state.targetWeightKg ?? weightKg, state.unit)} ${weightUnit(state.unit)}`}
                />
                <div className="flex justify-between text-xs text-on-surface-variant" aria-hidden="true">
                  <span>
                    {kgToDisplay(sliderMin, state.unit)} {weightUnit(state.unit)}
                  </span>
                  <span>
                    {kgToDisplay(sliderMax, state.unit)} {weightUnit(state.unit)}
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <OptionCardGroup
              label="Activity level"
              value={state.activityLevel}
              onChange={(v) => set('activityLevel', v)}
              options={[
                { value: 'sedentary', title: 'Sedentary', body: 'Desk-bound, little exercise.', icon: 'chair' },
                { value: 'light', title: 'Lightly active', body: 'Light exercise 1–3 days a week.', icon: 'directions_walk' },
                { value: 'moderate', title: 'Moderately active', body: 'Exercise 3–5 days a week.', icon: 'directions_run' },
                { value: 'active', title: 'Active', body: 'Hard exercise 6–7 days a week.', icon: 'sprint' },
                { value: 'veryActive', title: 'Very active', body: 'Physical job or twice-daily training.', icon: 'bolt' },
              ]}
            />
            <SegmentedOptions
              label="Exercise experience"
              value={state.exerciseExperience}
              onChange={(v) => set('exerciseExperience', v)}
              options={[
                { value: 'beginner', label: 'Beginner' },
                { value: 'intermediate', label: 'Intermediate' },
                { value: 'advanced', label: 'Advanced' },
              ]}
            />
            <div className="space-y-2">
              <span className="block text-sm font-medium text-on-surface-variant ml-1">
                Equipment at home
              </span>
              <div className="flex flex-wrap gap-2">
                {EQUIPMENT.map((eq) => (
                  <Chip
                    key={eq}
                    label={EQUIPMENT_LABELS[eq]}
                    icon={EQUIPMENT_ICONS[eq]}
                    tone="aqua"
                    active={state.equipment.includes(eq)}
                    onClick={() => {
                      haptic('selection');
                      setState((prev) => {
                        if (eq === 'none') return { ...prev, equipment: ['none'] };
                        const withoutNone = prev.equipment.filter((e) => e !== 'none');
                        return {
                          ...prev,
                          equipment: withoutNone.includes(eq)
                            ? withoutNone.filter((e) => e !== eq)
                            : [...withoutNone, eq],
                        };
                      });
                    }}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="space-y-2">
              <span className="block text-sm font-medium text-on-surface-variant ml-1">
                Dietary preferences (optional)
              </span>
              <div className="flex flex-wrap gap-2">
                {DIETARY_PREFERENCES.map((pref) => (
                  <Chip
                    key={pref}
                    label={DIETARY_LABELS[pref]}
                    tone="green"
                    active={state.dietaryPreferences.includes(pref)}
                    onClick={() => {
                      haptic('selection');
                      setState((prev) => ({
                        ...prev,
                        dietaryPreferences: prev.dietaryPreferences.includes(pref)
                          ? prev.dietaryPreferences.filter((p) => p !== pref)
                          : [...prev.dietaryPreferences, pref],
                      }));
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <span className="block text-sm font-medium text-on-surface-variant ml-1">
                Allergies
              </span>
              <p className="text-xs text-on-surface-variant ml-1">
                Anything you select here is strictly excluded from every meal suggestion and
                recommendation — no exceptions.
              </p>
              <div className="flex flex-wrap gap-2">
                {ALLERGENS.map((allergen) => (
                  <Chip
                    key={allergen}
                    label={ALLERGEN_LABELS[allergen]}
                    tone="coral"
                    active={state.allergies.includes(allergen)}
                    onClick={() => {
                      haptic('selection');
                      setState((prev) => ({
                        ...prev,
                        allergies: prev.allergies.includes(allergen)
                          ? prev.allergies.filter((a) => a !== allergen)
                          : [...prev.allergies, allergen],
                      }));
                    }}
                  />
                ))}
              </div>
            </div>

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
          </>
        )}

        {stepError && (
          <p role="alert" className="flex items-center gap-1.5 text-sm text-tertiary-container">
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              error
            </span>
            {stepError}
          </p>
        )}
      </div>

      <div className="mt-8 space-y-3">
        {step < 3 ? (
          <PrimaryButton onClick={next}>Continue</PrimaryButton>
        ) : (
          <PrimaryButton
            onClick={() => void submit()}
            loading={updateProfile.isPending || updateConsents.isPending}
          >
            Compute my targets
          </PrimaryButton>
        )}
        {step > 0 && (
          <SecondaryButton onClick={back} className="min-h-[48px]">
            Back
          </SecondaryButton>
        )}
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
          Computed from your profile with the Mifflin-St Jeor formula. They adapt as you log.
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

      <div className="mt-auto">
        <PrimaryButton onClick={onDone}>Go to Dashboard</PrimaryButton>
      </div>
    </div>
  );
}
