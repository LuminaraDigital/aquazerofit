/**
 * Single source of truth for equipment display metadata (icon + label).
 * Covers the extended 14-value EQUIPMENT enum (wger integration Phase 1);
 * values are appended in enum order and keyed exhaustively so the compiler
 * flags any future enum addition that lacks UI metadata.
 */
import type { Equipment } from '@aquazerofit/shared';

export const EQUIPMENT_ICONS: Record<Equipment, string> = {
  none: 'accessibility_new',
  dumbbells: 'fitness_center',
  resistanceBands: 'linear_scale',
  kettlebell: 'exercise',
  pullUpBar: 'sports_gymnastics',
  bench: 'weekend',
  yogaMat: 'self_improvement',
  jumpRope: 'jump_rope',
  // wger extension values
  barbell: 'fitness_center',
  ezBar: 'gesture',
  cableMachine: 'cable',
  smithMachine: 'precision_manufacturing',
  swissBall: 'sports_baseball',
  inclineBench: 'airline_seat_recline_normal',
};

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  none: 'No equipment',
  dumbbells: 'Dumbbells',
  resistanceBands: 'Resistance bands',
  kettlebell: 'Kettlebell',
  pullUpBar: 'Pull-up bar',
  bench: 'Bench',
  yogaMat: 'Yoga mat',
  jumpRope: 'Jump rope',
  // wger extension values
  barbell: 'Barbell',
  ezBar: 'EZ-bar',
  cableMachine: 'Cable machine',
  smithMachine: 'Smith machine',
  swissBall: 'Swiss ball',
  inclineBench: 'Incline bench',
};
