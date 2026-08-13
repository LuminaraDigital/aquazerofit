/**
 * Persona layer over P-07 (Character Bible, Appendix C).
 *
 * The selected coach contributes ONE system message, and it goes **before**
 * P-07 rather than after it. That ordering is the whole safety argument:
 *
 *   [persona voice] [P-07 rules] [grounding context] …history… [user]
 *
 * The Bible specifies the persona is prepended, and it is — but the reason it
 * has to be first rather than last is that instruction-following degrades
 * toward the end of a prompt in every model family we route to. Putting the
 * *rules* last means the refusals, the calorie floor and the crisis path sit
 * in the strongest position, and the voice sits in the weaker one. If the two
 * ever conflict, the arrangement itself resolves it the safe way, before the
 * persona block's own subordination clause is even consulted.
 *
 * Nothing downstream changes: the context block is still inserted after the
 * leading system messages by the gateway, still marked as untrusted data,
 * still the only source of numbers. The persona cannot introduce a fact, only
 * a tone.
 */
import { defaultCoach, type CoachPersona } from '@aquazerofit/shared';
import type { GatewayMessage } from './gateway';
import { loadPrompt } from './prompts';

const P07_FALLBACK = 'You are Aqua Coach, a supportive wellness assistant.';

/**
 * Build the leading system messages for a coach turn.
 *
 * Returns two messages rather than one concatenated string so the boundary
 * between "who you sound like" and "what you must do" stays visible in the
 * provider payload — a merged block is one edit away from a persona sentence
 * being read as a rule.
 */
export function systemMessagesFor(coach: CoachPersona | undefined): GatewayMessage[] {
  const persona = coach ?? defaultCoach();
  const p07 = loadPrompt('P-07');

  return [
    {
      role: 'system',
      content:
        `COACH PERSONA — voice only.\n${persona.voice.block}\n` +
        `You are introduced to the user as ${persona.name} ("${persona.ringName}"), ` +
        `who coaches ${persona.domain.toLowerCase()}.`,
    },
    { role: 'system', content: p07.content || P07_FALLBACK },
  ];
}

/**
 * Prompt version string recorded in telemetry for a persona turn.
 *
 * The coach id belongs in the version because a persona is part of what
 * produced the output: when a safety eval regresses, "which prompt" has to
 * answer "P-07 under whose voice", or the roster becomes nine untracked
 * variants of one prompt.
 */
export function personaPromptVersion(coach: CoachPersona | undefined): string {
  const persona = coach ?? defaultCoach();
  const p07 = loadPrompt('P-07');
  return `P-07@${p07.version}+${persona.id}`;
}
