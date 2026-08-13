/**
 * Output style lint (P-07 §Style rules): em dashes and AI-slop vocabulary are
 * measured on every coach reply, warn-only. Also the P-07 em-dash smoke test:
 * five representative coach turns through the offline engine (the model in
 * every dev and keyless deployment) must produce no U+2014, so a prompt edit
 * or template regression that reintroduces one fails here, in dev, with no
 * real provider or Telegram session required.
 */
import { describe, expect, it, vi } from 'vitest';
import { EM_DASH, SLOP_WORDS, lintStyle, warnOnStyle } from '../modules/ai/styleLint';
import { mockComplete, type MockChatContext } from '../modules/ai/providers/mock';

describe('lintStyle', () => {
  it('counts em dashes (U+2014)', () => {
    expect(lintStyle('plain text').emDashCount).toBe(0);
    expect(lintStyle('one — two — three').emDashCount).toBe(2);
  });

  it('does not fire on hyphens or en dashes', () => {
    const findings = lintStyle('protein-forward snack, 10–12 reps, week-to-week');
    expect(findings.emDashCount).toBe(0);
    expect(findings.slopWords).toHaveLength(0);
  });

  it('finds banned filler words case-insensitively, with inflections', () => {
    const findings = lintStyle(
      "Let's Delve into your fitness journey and unlock seamless synergy.",
    );
    expect(findings.slopWords).toEqual(
      expect.arrayContaining(['delve', 'journey', 'unlock', 'seamless', 'synergy']),
    );
  });

  it('catches e-drop inflections and spaced hyphen variants', () => {
    expect(lintStyle('delving deeper while leveraging data').slopWords).toEqual(
      expect.arrayContaining(['delve', 'leverage']),
    );
    expect(lintStyle('a real game changer').slopWords).toContain('game-changer');
  });

  it('does not fire inside longer words', () => {
    // "harnesses" inflects from "harness" and should match; "unlocked" from
    // "unlock" should match; but unrelated containments must not.
    const clean = lintStyle('the realms of possibility'); // "realms" IS an inflection — expected hit
    expect(clean.slopWords).toContain('realm');
    expect(lintStyle('empathy and testing').slopWords).toHaveLength(0);
  });

  it('passes typical coach copy untouched', () => {
    const reply =
      "You've logged 1,450 of your 1,900 kcal target, so 450 kcal to go. Protein's at 82 g of 120 g. Nice consistency today!";
    const findings = lintStyle(reply);
    expect(findings.emDashCount).toBe(0);
    expect(findings.slopWords).toHaveLength(0);
  });
});

describe('warnOnStyle', () => {
  it('warns without blocking and never logs the reply text', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const findings = warnOnStyle('Time to unleash your potential — today!', {
        promptId: 'P-07',
        provider: 'groq',
      });
      expect(findings.emDashCount).toBe(1);
      expect(findings.slopWords).toContain('unleash');
      expect(warn).toHaveBeenCalledTimes(1);
      const logged = warn.mock.calls[0]!.join(' ');
      expect(logged).toContain('styleLint');
      expect(logged).not.toContain('your potential'); // reply text stays out of logs
    } finally {
      warn.mockRestore();
    }
  });

  it('stays silent on clean output', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      warnOnStyle('Rest day today. Let the muscles rebuild.');
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('P-07 em-dash smoke test over the offline coach', () => {
  const context: MockChatContext = {
    userName: 'Sam',
    nutrition: {
      kcalTarget: 1900,
      kcalConsumed: 1450,
      kcalRemaining: 450,
      proteinG: { consumed: 82, target: 120 },
      carbsG: { consumed: 150, target: 220 },
      fatG: { consumed: 40, target: 60 },
      waterMl: { consumed: 1200, target: 2000 },
      mealsLogged: 3,
    },
    workout: {
      focus: 'Full Body Strength',
      isRest: false,
      status: 'pending',
      exercises: [
        { name: 'Goblet Squats', sets: 3, reps: 12 },
        { name: 'Push-ups', sets: 3, reps: 10 },
      ],
    },
    plan: { name: 'Home Strength Foundations', daysPerWeek: 3 },
    progress: {
      currentWeightKg: 82.4,
      startWeightKg: 85,
      deltaKg: -2.6,
      streakDays: 0,
      activeDays: 9,
      windowDays: 14,
      bestDays: 11,
      consistencyState: 'recovering',
      workoutsCompleted: 12,
    },
  };

  const representativeMessages = [
    'How am I doing on food today?', // nutrition check
    "What's my workout today?", // workout query
    "I missed a few days, what's my progress looking like?", // comeback / progress
    'How much water have I had?', // hydration readout
    "What's my plan this week?", // plan overview
  ];

  it.each(representativeMessages)('reply to "%s" contains no em dash', (message) => {
    // Several template variants exist per intent; sweep the seed space so every
    // variant is exercised, not just the one this message hashes to.
    for (let salt = 0; salt < 8; salt++) {
      const { text } = mockComplete(
        'chatFast',
        [{ role: 'user', content: `${message}${' '.repeat(salt)}` }],
        { context: context as unknown as Record<string, unknown> },
      );
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toContain(EM_DASH);
    }
  });

  it('insight and over-budget variants also comply', () => {
    const over = {
      ...context,
      nutrition: { ...context.nutrition!, kcalConsumed: 2300, kcalRemaining: -400 },
    };
    const { text } = mockComplete('chatFast', [{ role: 'user', content: 'How am I doing on calories?' }], {
      context: over as unknown as Record<string, unknown>,
    });
    expect(text).not.toContain(EM_DASH);

    const insight = mockComplete('insightBatch', [{ role: 'user', content: 'weekly insight' }], {
      context: { stats: { deltaKg: 0.6, streakDays: 4, workoutsCompleted: 2 } },
    });
    expect(insight.text).not.toContain(EM_DASH);
  });

  it('the offline coach also avoids the banned filler vocabulary', () => {
    for (const message of representativeMessages) {
      const { text } = mockComplete('chatFast', [{ role: 'user', content: message }], {
        context: context as unknown as Record<string, unknown>,
      });
      expect(lintStyle(text).slopWords).toHaveLength(0);
    }
  });

  it('keeps the prompt list and the lint list plausible mirrors', () => {
    // Guard against an empty or wildly shrunken list after a refactor.
    expect(SLOP_WORDS.length).toBeGreaterThanOrEqual(25);
  });
});
