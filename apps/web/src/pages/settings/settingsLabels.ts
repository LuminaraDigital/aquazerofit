import type {
  Allergen,
  DietaryPreference,
  ProfileInput,
  WellnessProfile,
} from '@aquazerofit/shared';

export const DIETARY_LABELS: Record<DietaryPreference, string> = {
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

export const ALLERGEN_LABELS: Record<Allergen, string> = {
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

export const GOAL_LABELS = { lose: 'Lose weight', maintain: 'Maintain', gain: 'Gain muscle' } as const;
export const ACTIVITY_LABELS = {
  sedentary: 'Sedentary',
  light: 'Lightly active',
  moderate: 'Moderately active',
  active: 'Active',
  veryActive: 'Very active',
} as const;
export const EXPERIENCE_LABELS = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
} as const;

export function toProfileInput(p: WellnessProfile): ProfileInput {
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
    nutritionEmphasis: p.nutritionEmphasis ?? 'standard',
    ...(p.targetWeightKg != null ? { targetWeightKg: p.targetWeightKg } : {}),
  };
}
