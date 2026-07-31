/**
 * Achievement definitions (~10). Rules are inspectable data — the
 * AchievementEngine (progress module) evaluates them deterministically.
 */
import type { AchievementDefinition } from '@aquazerofit/shared';

export const achievementsSeed: AchievementDefinition[] = [
  {
    id: 'ach-first-meal',
    type: 'achievementDefinition',
    name: 'First Bite',
    description: 'Log your very first meal.',
    icon: 'restaurant',
    rule: { kind: 'firstAction', action: 'mealLog' },
  },
  {
    id: 'ach-first-weighin',
    type: 'achievementDefinition',
    name: 'On the Record',
    description: 'Record your first weigh-in.',
    icon: 'monitor_weight',
    rule: { kind: 'firstAction', action: 'weightLog' },
  },
  {
    id: 'ach-first-workout',
    type: 'achievementDefinition',
    name: 'Off the Couch',
    description: 'Complete your first workout.',
    icon: 'fitness_center',
    rule: { kind: 'firstAction', action: 'workout' },
  },
  {
    id: 'ach-profile-complete',
    type: 'achievementDefinition',
    name: 'Dialled In',
    description: 'Complete your wellness profile.',
    icon: 'badge',
    rule: { kind: 'firstAction', action: 'profile' },
  },
  {
    id: 'ach-streak-3',
    type: 'achievementDefinition',
    name: 'Warming Up',
    description: 'Keep a 3-day logging streak.',
    icon: 'local_fire_department',
    rule: { kind: 'streak', days: 3 },
  },
  {
    id: 'ach-streak-7',
    type: 'achievementDefinition',
    name: 'One Week Wonder',
    description: 'Keep a 7-day logging streak.',
    icon: 'whatshot',
    rule: { kind: 'streak', days: 7 },
  },
  {
    id: 'ach-streak-30',
    type: 'achievementDefinition',
    name: 'Habit Formed',
    description: 'Keep a 30-day logging streak.',
    icon: 'military_tech',
    rule: { kind: 'streak', days: 30 },
  },
  {
    id: 'ach-meals-50',
    type: 'achievementDefinition',
    name: 'Kitchen Regular',
    description: 'Log 50 meals in total.',
    icon: 'menu_book',
    rule: { kind: 'mealsLogged', count: 50 },
  },
  {
    id: 'ach-workouts-10',
    type: 'achievementDefinition',
    name: 'Ten Strong',
    description: 'Complete 10 workouts.',
    icon: 'exercise',
    rule: { kind: 'workoutsCompleted', count: 10 },
  },
  {
    id: 'ach-weightloss-1',
    type: 'achievementDefinition',
    name: 'First Kilo Down',
    description: 'Lose your first kilogram.',
    icon: 'trending_down',
    rule: { kind: 'weightLoss', kg: 1 },
  },
  {
    id: 'ach-weightloss-5',
    type: 'achievementDefinition',
    name: 'Five Down',
    description: 'Lose five kilograms in total.',
    icon: 'emoji_events',
    rule: { kind: 'weightLoss', kg: 5 },
  },
];
