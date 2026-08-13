/**
 * Persona layering over P-07.
 *
 * The assertion that matters is the ORDER. A persona block placed after the
 * rules would sit in the strongest instruction position in the prompt, which
 * is how a coach written as a warlord starts outranking the calorie floor.
 * This test fails loudly if anyone ever "tidies" the two messages into one, or
 * flips them.
 */
import { describe, expect, it } from 'vitest';
import { COACHES, coachById } from '@aquazerofit/shared';
import { personaPromptVersion, systemMessagesFor } from '../modules/ai/persona';
import { loadPrompt } from '../modules/ai/prompts';

describe('persona layering', () => {
  it('puts the voice first and the rules last', () => {
    const messages = systemMessagesFor(coachById('ogun'));
    expect(messages).toHaveLength(2);
    expect(messages.every((m) => m.role === 'system')).toBe(true);

    expect(messages[0]!.content).toContain('COACH PERSONA');
    expect(messages[0]!.content).toContain('Daemon King');

    // The last leading system message is P-07 itself, not the persona.
    const p07 = loadPrompt('P-07');
    expect(messages[1]!.content).toBe(p07.content);
  });

  it('states in the prompt itself that the rules override the voice', () => {
    for (const coach of COACHES) {
      const [voice] = systemMessagesFor(coach);
      expect(voice!.content).toContain('overrides this persona without exception');
    }
  });

  it('falls back to the default coach rather than emitting a voiceless turn', () => {
    const messages = systemMessagesFor(undefined);
    expect(messages).toHaveLength(2);
    expect(messages[0]!.content).toContain('Akin Celsus');
  });

  it('records the coach in the prompt version so evals can attribute a regression', () => {
    expect(personaPromptVersion(coachById('king'))).toMatch(/^P-07@.+\+king$/);
  });
});

describe('roster integrity', () => {
  it('gives every coach a line for every reaction it can be asked for', () => {
    const kinds = [
      'greeting',
      'levelUp',
      'rankUp',
      'achievement',
      'steady',
      'returning',
      'restDay',
      'resting',
    ] as const;

    for (const coach of COACHES) {
      for (const kind of kinds) {
        expect(coach.reactions[kind], `${coach.id}.${kind}`).toBeTruthy();
      }
    }
  });

  it('leaves every locked coach reachable without paying', () => {
    // The commitment that keeps this a wellness product rather than a gacha:
    // Stars are a shortcut past a door that is already open, never the only key.
    for (const coach of COACHES) {
      if (coach.unlock.kind === 'free') continue;
      expect(coach.unlock.level).toBeGreaterThan(0);
      expect(coach.unlock.label).toBeTruthy();
    }
  });

  it('has unique ids and at least one free starter coach', () => {
    const ids = COACHES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(COACHES.some((c) => c.unlock.kind === 'free')).toBe(true);
  });
});
