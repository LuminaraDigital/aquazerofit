/**
 * The privacy policy names the AI providers this deployment can send data to
 * (aiProviders in apps/web/src/pages/legal/operator.tsx). That list is the
 * disclosure Google Play and the Australian Privacy Principles rely on, so it
 * must cover every third-party provider wired into the gateway, and name
 * nothing the gateway cannot call.
 *
 * Adding a provider to PROVIDERS fails this test until it has a public name
 * below AND that name is in the policy, which is the point: the checklist in
 * modules/ai/gateway.ts asks for both, and this makes the second step
 * impossible to forget.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PROVIDERS } from '../modules/ai/providerChain';

/** Public name for each provider id, as the policy prints it. null = not a third party. */
const PUBLIC_NAME: Record<string, string | null> = {
  groq: 'Groq',
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  nvidia: 'NVIDIA NIM',
  // Self-hosted: localhost or an operator-run OLLAMA_BASE_URL. No data leaves
  // infrastructure the operator controls, so it is not a disclosed recipient.
  ollama: null,
};

function policyProviders(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const operator = fs.readFileSync(
    path.resolve(here, '../../../web/src/pages/legal/operator.tsx'),
    'utf8',
  );
  const match = /aiProviders:\s*\[([^\]]*)\]/.exec(operator.slice(operator.indexOf('export const OPERATOR')));
  expect(match, 'aiProviders array in OPERATOR').toBeTruthy();
  return [...match![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
}

describe('AI provider disclosure', () => {
  it('has a public name (or an explicit not-a-third-party) for every provider in the chain', () => {
    for (const provider of PROVIDERS) {
      expect(Object.hasOwn(PUBLIC_NAME, provider.name), `${provider.name} needs a PUBLIC_NAME entry`).toBe(true);
    }
  });

  it('names exactly the third-party providers the gateway can call', () => {
    const expected = PROVIDERS.map((p) => PUBLIC_NAME[p.name]).filter((n): n is string => !!n);
    expect([...policyProviders()].sort()).toEqual([...expected].sort());
  });
});
