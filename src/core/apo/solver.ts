// apo/solver — remote-only solving. No local mock: without a configured
// backend (or without provider keys on it) solveTest returns an honest
// error state instead of inventing an answer.

import { apiConfigured, solveRemote, ApoApiError } from './api';
import { getDeviceId } from './device';

export const APO_ACCURACY_THRESHOLD = 0.8;

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

export async function solveTest(input: SolveInput): Promise<SolveResult> {
  if (input.options.length === 0) throw new ApoApiError('open-question', 'Need 2+ options', 422);
  if (!apiConfigured()) throw new ApoApiError('no-server', 'Backend URL is not configured');
  // Transport/provider failures THROW (timeout, no-server, quota-exceeded,
  // no-provider-key): Solving catches them into a visible error instead of
  // spinning forever or rendering an invented empty answer.
  const deviceId = await getDeviceId();
  const r = await solveRemote(deviceId, null, input.stem, input.options);
  const idx = r.choiceIndex >= 0 && r.choiceIndex < input.options.length ? r.choiceIndex : -1;
  if (idx < 0) throw new ApoApiError('bad-response', 'Backend returned an unusable choice');
  return {
    choice: input.options[idx],
    choiceIndex: idx,
    probabilities: r.probabilities,
    confidence: r.confidence,
    lowAccuracy: r.lowAccuracy,
    provider: r.provider,
    cacheHit: r.cached,
  };
}

export interface BatchItemResult {
  stem: string;
  options: string[];
  ok: boolean;
  result?: SolveResult;
  /** Error code when ok === false (timeout, quota-exceeded, ...). */
  error?: string;
}

export const APO_BATCH_MAX = 20;

/**
 * Solve a whole file sequentially: every question goes live through
 * solveTest (own 30s timeout and quota burn per solved item), one bad
 * item never stops the rest. No batch endpoint needed — per-item calls
 * keep timeouts and quota accounting exact.
 */
export async function solveBatch(items: SolveInput[]): Promise<BatchItemResult[]> {
  const list = items.slice(0, APO_BATCH_MAX);
  const out: BatchItemResult[] = [];
  for (const input of list) {
    try {
      out.push({ stem: input.stem, options: input.options, ok: true, result: await solveTest(input) });
    } catch (e) {
      out.push({
        stem: input.stem,
        options: input.options,
        ok: false,
        error: e instanceof ApoApiError ? e.code : 'request-failed',
      });
    }
  }
  return out;
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
