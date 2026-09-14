import { useState } from 'react';
import {
  ALLERGENS,
  DIETARY_PREFERENCES,
  RANGES,
  profileSchema,
  type ProfileInput,
  type WellnessProfile,
} from '@aquazerofit/shared';
import {
  cmToFtIn,
  displayToKg,
  formatHeight,
  formatWeight,
  ftInToCm,
  kgToDisplay,
  weightUnit,
} from '../../lib/format';
import { Chip } from '../../components/ui/Chip';
import { Input } from '../../components/ui/Input';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { SecondaryButton } from '../../components/ui/SecondaryButton';
import { SegmentedOptions, UnitToggle } from '../../components/ui/fields';
import {
  ACTIVITY_LABELS,
  ALLERGEN_LABELS,
  DIETARY_LABELS,
  EXPERIENCE_LABELS,
  GOAL_LABELS,
} from './settingsLabels';

/**
 * Units, dietary preferences and allergies are fields *of* the wellness
 * profile, so an account that has not set one up has nothing to write them to.
 * They are split out here so the Preferences card can drop them wholesale
 * rather than render controls whose saves cannot land; for allergens in
 * particular, a chip that appears to stick but silently fails would be the
 * worst possible failure mode.
 */
export function ProfilePreferenceRows({
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

export function ProfileSummaryCard({
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
