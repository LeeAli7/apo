// apo/solver — remote-only solving. No local mock: without a configured
// backend (or without provider keys on it) solveTest returns an honest
// error state instead of inventing an answer.

import { apiConfigured, solveRemote, ApoApiError } from './api';
import { getDeviceId } from './device';

export const APO_ACCURACY_THRESHOLD = 0.75;

export interface SolveInput {
  stem: string;
  options: string[];
}

export interface SolveResult {
  choice: string;
  choiceIndex: number;
  probabilities: number[];
  confidence: number;
  lowAccuracy: boolean;
  provider: string;
  cacheHit: boolean;
  /** Present when no answer was produced: 'no-server' | provider codes. */
  error?: string;
}

function errorResult(code: string): SolveResult {
  return {
    choice: '',
    choiceIndex: -1,
    probabilities: [],
    confidence: 0,
    lowAccuracy: true,
    provider: 'none',
    cacheHit: false,
    error: code,
  };
}

export async function solveTest(input: SolveInput): Promise<SolveResult> {
  if (input.options.length === 0) return errorResult('open-question');
  if (!apiConfigured()) return errorResult('no-server');
  try {
    const deviceId = await getDeviceId();
    const r = await solveRemote(deviceId, null, input.stem, input.options);
    const idx = r.choiceIndex >= 0 && r.choiceIndex < input.options.length ? r.choiceIndex : -1;
    return {
      choice: idx >= 0 ? input.options[idx] : '',
      choiceIndex: idx,
      probabilities: r.probabilities,
      confidence: r.confidence,
      lowAccuracy: r.lowAccuracy,
      provider: r.provider,
      cacheHit: r.cached,
    };
  } catch (e) {
    return errorResult(e instanceof ApoApiError ? e.code : 'request-failed');
  }
}

export interface ChoicePayload {
  state: { question: string };
  questions: {
    answer: { type: 'choice'; instructions: string; criteria: Record<string, string> };
  };
}

/**
 * Reference shape for the remote decision engine: question -> state,
 * options -> Choice criteria. Mirrored by server/src/providers.ts —
 * keep both in sync when the mapping changes.
 */
export function buildChoicePayload(input: SolveInput): ChoicePayload {
  const criteria: Record<string, string> = {};
  input.options.forEach((o, i) => {
    criteria[`opt_${i}`] = o;
  });
  return {
    state: { question: input.stem },
    questions: {
      answer: {
        type: 'choice',
        instructions: 'Выбери вариант, который правильно отвечает на `question`.',
        criteria,
      },
    },
  };
}
