// apo-server pipeline — the real path from input to answer:
// cache -> decision engine -> 0.75 gate -> model fallback -> cache+quota.
// Quota burns only on a real non-cached solution; outages never burn it.

import type { ServerEnv } from './env';
import { ApoDb, sha256 } from './db';
import {
  ProviderError,
  deepseekStructure,
  deepseekExplain,
  deepseekFallbackChoice,
  jevChoice,
  type Structured,
} from './providers';

export const ACCURACY_GATE = 0.75;

export interface SolveOutput {
  choiceIndex: number;
  probabilities: number[];
  confidence: number;
  lowAccuracy: boolean;
  provider: string;
  cached: boolean;
}

function decisionKey(stem: string, options: string[]): string {
  return sha256(['solve-v1', stem.trim(), ...options.map((o) => o.trim())]);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function structureText(env: ServerEnv, text: string): Promise<Structured> {
  const clean = text.trim().slice(0, 8000);
  if (!clean) throw new ProviderError('empty-input', 'Nothing to structure', 400);
  return deepseekStructure(env, clean);
}

export async function solveQuestion(
  env: ServerEnv,
  db: ApoDb,
  identity: string,
  pro: boolean,
  stem: string,
  options: string[],
): Promise<{ out: SolveOutput; quotaLeft: number }> {
  const cleanStem = stem.trim().slice(0, 2000);
  const cleanOpts = options.map((o) => o.trim()).filter(Boolean).slice(0, 8);
  if (!cleanStem || cleanOpts.length < 2) {
    throw new ProviderError('open-question', 'Need a question with 2+ options', 422);
  }
  const key = decisionKey(cleanStem, cleanOpts);
  const remaining = (used: number): number => (pro ? -1 : Math.max(0, env.freeDaily - used));
  const cached = db.getDecision(key);
  if (cached) {
    const left = remaining(db.quotaUsed(identity, today()));
    return {
      out: {
        choiceIndex: cached.choiceIndex,
        probabilities: cached.probabilities,
        confidence: cached.confidence,
        lowAccuracy: cached.confidence < ACCURACY_GATE,
        provider: cached.provider,
        cached: true,
      },
      quotaLeft: left,
    };
  }
  // Cache miss: providers must exist BEFORE quota burns.
  const hasJev = env.jevApiKey.length > 0;
  if (!hasJev) throw new ProviderError('no-provider-key', 'TYPESAFE_API_KEY is not set', 503);
  if (!pro && db.quotaUsed(identity, today()) >= env.freeDaily) {
    throw new ProviderError('quota-exceeded', 'Free daily quota is spent', 402);
  }
  const primary = await jevChoice(env, cleanStem, cleanOpts);
  let finalChoice = primary.choiceIndex;
  let finalProbs = primary.probabilities;
  let finalConf = primary.confidence;
  let provider = 'jev';
  if (primary.confidence < ACCURACY_GATE && env.deepseekApiKey) {
    try {
      const fb = await deepseekFallbackChoice(env, cleanStem, cleanOpts);
      finalChoice = fb.choiceIndex;
      finalProbs = fb.probabilities;
      finalConf = fb.confidence;
      provider = 'jev+fallback';
    } catch {
      // Fallback failed — keep the primary engine answer with its flag.
    }
  }
  db.putDecision(key, {
    choiceIndex: finalChoice,
    probabilities: finalProbs,
    confidence: finalConf,
    provider,
  });
  if (!pro) db.quotaBurn(identity, today());
  const left = remaining(db.quotaUsed(identity, today()));
  return {
    out: {
      choiceIndex: finalChoice,
      probabilities: finalProbs,
      confidence: finalConf,
      lowAccuracy: finalConf < ACCURACY_GATE,
      provider,
      cached: false,
    },
    quotaLeft: left,
  };
}

export async function explainAnswer(
  db: ApoDb,
  env: ServerEnv,
  stem: string,
  answer: string,
): Promise<{ text: string; cached: boolean }> {
  const cleanStem = stem.trim().slice(0, 2000);
  const cleanAnswer = answer.trim().slice(0, 500);
  if (!cleanStem || !cleanAnswer) throw new ProviderError('empty-input', 'Need question + answer', 400);
  const key = sha256(['explain-v1', cleanStem, cleanAnswer]);
  const hit = db.getExplanation(key);
  if (typeof hit === 'string') return { text: hit, cached: true };
  const text = await deepseekExplain(env, cleanStem, cleanAnswer);
  db.putExplanation(key, text);
  return { text, cached: false };
}
