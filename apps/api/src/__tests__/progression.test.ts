/**
 * ProgressionEngine contract tests (wger-integration-plan.md Phase 2.1).
 * Reproduces the wger docs reference example exactly, pins the legacy
 * absolute-rule behaviour, and covers op/step/repeat/requires semantics plus
 * the AQF-11 hard caps.
 */
import { describe, expect, it } from 'vitest';
import type { ProgressionRule } from '@aquazerofit/shared';
import {
  resolveKind,
  resolvePrescription,
  roundToPlate,
} from '../modules/plans/progression';

const ENTRY = 'se-1-1';
const weight = (rules: ProgressionRule[], iteration: number, base = 50) =>
  resolveKind(base, 'weight', rules, iteration);

describe('wger docs reference example', () => {
  // Base 50 kg, +10% @iteration 4, +2 kg @6, +1 kg @7, replace 45 @8.
  const rules: ProgressionRule[] = [
    { slotEntryId: ENTRY, kind: 'weight', iteration: 4, op: 'add', step: 'percent', value: 10 },
    { slotEntryId: ENTRY, kind: 'weight', iteration: 6, op: 'add', step: 'abs', value: 2 },
    { slotEntryId: ENTRY, kind: 'weight', iteration: 7, op: 'add', step: 'abs', value: 1 },
    { slotEntryId: ENTRY, kind: 'weight', iteration: 8, op: 'replace', value: 45 },
  ];
  const expected = [50, 50, 50, 55, 55, 57, 58, 45];

  it.each(expected.map((v, i) => [i + 1, v] as const))(
    'iteration %i resolves to %f kg',
    (iteration, value) => {
      expect(weight(rules, iteration)).toBe(value);
    },
  );
});

describe('legacy absolute rules (no op) — exact pre-Phase-2 behaviour', () => {
  const rules: ProgressionRule[] = [
    { slotEntryId: ENTRY, kind: 'reps', iteration: 2, value: 12 },
    { slotEntryId: ENTRY, kind: 'reps', iteration: 4, value: 15 },
  ];

  it('keeps the base value before the first rule', () => {
    expect(resolveKind(10, 'reps', rules, 1)).toBe(10);
  });
  it('applies the absolute value from its iteration onwards', () => {
    expect(resolveKind(10, 'reps', rules, 2)).toBe(12);
    expect(resolveKind(10, 'reps', rules, 3)).toBe(12);
  });
  it('the latest applicable rule wins', () => {
    expect(resolveKind(10, 'reps', rules, 4)).toBe(15);
    expect(resolveKind(10, 'reps', rules, 9)).toBe(15);
  });
  it('legacy rules mix with op rules: absolute replace overrides the running value', () => {
    const mixed: ProgressionRule[] = [
      { slotEntryId: ENTRY, kind: 'weight', iteration: 2, op: 'add', step: 'abs', value: 5 },
      { slotEntryId: ENTRY, kind: 'weight', iteration: 3, value: 42 },
    ];
    expect(weight(mixed, 2)).toBe(55);
    expect(weight(mixed, 3)).toBe(42);
  });
});

describe('op / step semantics', () => {
  it('subtract abs', () => {
    const rules: ProgressionRule[] = [
      { slotEntryId: ENTRY, kind: 'weight', iteration: 2, op: 'subtract', step: 'abs', value: 5 },
    ];
    expect(weight(rules, 2)).toBe(45);
  });
  it('subtract percent', () => {
    const rules: ProgressionRule[] = [
      { slotEntryId: ENTRY, kind: 'weight', iteration: 2, op: 'subtract', step: 'percent', value: 10 },
    ];
    expect(weight(rules, 2)).toBe(45);
  });
  it('percent defaults to abs when step is omitted', () => {
    const rules: ProgressionRule[] = [
      { slotEntryId: ENTRY, kind: 'weight', iteration: 2, op: 'add', value: 2.5 },
    ];
    expect(weight(rules, 2)).toBe(52.5);
  });
  it('percent rounds reps to integers', () => {
    const rules: ProgressionRule[] = [
      { slotEntryId: ENTRY, kind: 'reps', iteration: 2, op: 'add', step: 'percent', value: 10 },
    ];
    expect(resolveKind(10, 'reps', rules, 2)).toBe(11);
  });
});

describe('repeat', () => {
  it('re-applies on every later iteration', () => {
    const rules: ProgressionRule[] = [
      { slotEntryId: ENTRY, kind: 'weight', iteration: 2, op: 'add', step: 'abs', value: 1, repeat: true },
    ];
    expect(weight(rules, 1)).toBe(50);
    expect(weight(rules, 2)).toBe(51);
    expect(weight(rules, 4)).toBe(53);
  });
  it('repeat percent compounds on the running value', () => {
    const rules: ProgressionRule[] = [
      { slotEntryId: ENTRY, kind: 'weight', iteration: 2, op: 'add', step: 'percent', value: 10, repeat: true },
    ];
    expect(weight(rules, 3)).toBe(60.5); // 50 → 55 → 60.5
  });
});

describe('requires (autoregulation) — fails closed', () => {
  const rules: ProgressionRule[] = [
    { slotEntryId: ENTRY, kind: 'weight', iteration: 2, op: 'add', step: 'abs', value: 2.5, requires: ['weight'] },
  ];

  it('applies when the gate confirms the previous iteration met targets', () => {
    expect(resolveKind(50, 'weight', rules, 2, () => true)).toBe(52.5);
  });
  it('skips the application when the gate rejects', () => {
    expect(resolveKind(50, 'weight', rules, 2, () => false)).toBe(50);
  });
  it('skips gated applications when no gate is supplied (fail closed)', () => {
    expect(weight(rules, 5)).toBe(50);
  });
  it('gates each repeat application independently', () => {
    const repeating: ProgressionRule[] = [
      { slotEntryId: ENTRY, kind: 'weight', iteration: 2, op: 'add', step: 'abs', value: 1, repeat: true, requires: ['weight'] },
    ];
    // Iterations 2 and 4 confirmed, 3 not → applications at 2 and 4 only.
    const gate = (atIteration: number) => atIteration !== 3;
    expect(resolveKind(50, 'weight', repeating, 4, gate)).toBe(52);
  });
});

describe('hard caps (AQF-11, mirrors shared zod load schemas)', () => {
  it('clamps weight to 1000 kg', () => {
    const rules: ProgressionRule[] = [
      { slotEntryId: ENTRY, kind: 'weight', iteration: 2, op: 'replace', value: 5000 },
    ];
    expect(weight(rules, 2)).toBe(1000);
  });
  it('clamps weight at 0 (never negative)', () => {
    const rules: ProgressionRule[] = [
      { slotEntryId: ENTRY, kind: 'weight', iteration: 2, op: 'subtract', step: 'abs', value: 999 },
    ];
    expect(weight(rules, 2)).toBe(0);
  });
  it('clamps RiR to 9.5 and rounds to 0.5 steps', () => {
    expect(
      resolveKind(2, 'rir', [{ slotEntryId: ENTRY, kind: 'rir', iteration: 2, op: 'replace', value: 12 }], 2),
    ).toBe(9.5);
    expect(
      resolveKind(2, 'rir', [{ slotEntryId: ENTRY, kind: 'rir', iteration: 2, op: 'add', step: 'abs', value: 1.3 }], 2),
    ).toBe(3.5);
  });
});

describe('null baselines', () => {
  it('weight treats null as a 0 kg baseline for add-ops (loaded bodyweight)', () => {
    const rules: ProgressionRule[] = [
      { slotEntryId: ENTRY, kind: 'weight', iteration: 2, op: 'add', step: 'abs', value: 5 },
    ];
    expect(resolveKind(null, 'weight', rules, 2)).toBe(5);
  });
  it('rir stays null until a replace prescribes it', () => {
    const add: ProgressionRule[] = [
      { slotEntryId: ENTRY, kind: 'rir', iteration: 2, op: 'add', step: 'abs', value: 1 },
    ];
    expect(resolveKind(null, 'rir', add, 2)).toBeNull();
    const replace: ProgressionRule[] = [
      { slotEntryId: ENTRY, kind: 'rir', iteration: 2, op: 'replace', value: 2 },
    ];
    expect(resolveKind(null, 'rir', replace, 2)).toBe(2);
  });
});

describe('resolvePrescription', () => {
  it('resolves all kinds for the entry and ignores other entries', () => {
    const rules: ProgressionRule[] = [
      { slotEntryId: ENTRY, kind: 'weight', iteration: 2, op: 'add', step: 'abs', value: 2.5 },
      { slotEntryId: ENTRY, kind: 'reps', iteration: 2, value: 12 },
      { slotEntryId: 'other-entry', kind: 'weight', iteration: 1, op: 'replace', value: 999 },
    ];
    const rx = resolvePrescription(
      ENTRY,
      { sets: 3, reps: 10, restSeconds: 90, weightKg: 50, rir: 2 },
      rules,
      2,
    );
    expect(rx).toEqual({ sets: 3, reps: 12, restSeconds: 90, weightKg: 52.5, rir: 2 });
  });

  it('passes the gate through to gated rules', () => {
    const rules: ProgressionRule[] = [
      { slotEntryId: ENTRY, kind: 'weight', iteration: 2, op: 'add', step: 'abs', value: 2.5, requires: ['reps'] },
    ];
    const base = { sets: 3, reps: 10, restSeconds: 90, weightKg: 50, rir: null };
    expect(resolvePrescription(ENTRY, base, rules, 2, () => false).weightKg).toBe(50);
    expect(resolvePrescription(ENTRY, base, rules, 2, () => true).weightKg).toBe(52.5);
  });
});

describe('roundToPlate (2.5 kg plates)', () => {
  it('rounds to the nearest loadable weight', () => {
    expect(roundToPlate(50)).toBe(50);
    expect(roundToPlate(51)).toBe(50);
    expect(roundToPlate(52)).toBe(52.5);
    expect(roundToPlate(54)).toBe(55);
  });
});
