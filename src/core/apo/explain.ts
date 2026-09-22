// apo/explain — cache-first explanations. Local persistent cache
// (apo_explain_cache_v1) is real storage, not a mock; misses go to the
// backend, which calls the explanation model server-side.

import { cacheKey } from './hash';
import { APO_KEYS, loadJson, saveJson } from './store';
import { apiConfigured, explainRemote, ApoApiError } from './api';
import { getDeviceId } from './device';

export interface ExplainResult {
  text: string;
  cached: boolean;
  provider: string;
  /** Present when no explanation was produced. */
  error?: string;
}

/** Prompt shape for the remote explanation model (RU). Mirrored server-side. */
export function buildExplainPrompt(stem: string, answer: string): string {
  return (
    `Объясни коротко и по шагам, почему правильный ответ — «${answer}», ` +
    `на вопрос: ${stem}. Ответ на русском, 3–6 шагов, без воды.`
  );
}

export async function explainText(stem: string, answer: string): Promise<ExplainResult> {
  const key = cacheKey(['explain-v1', stem, answer]);
  const cache = await loadJson<Record<string, string>>(APO_KEYS.explainCache, {});
  const hit = cache[key];
  if (typeof hit === 'string') return { text: hit, cached: true, provider: 'cache' };
  if (!apiConfigured()) {
    return { text: '', cached: false, provider: 'none', error: 'no-server' };
  }
  try {
    const deviceId = await getDeviceId();
    const r = await explainRemote(deviceId, null, stem, answer);
    cache[key] = r.text;
    await saveJson(APO_KEYS.explainCache, cache);
    return { text: r.text, cached: r.cached, provider: 'model' };
  } catch (e) {
    return { text: '', cached: false, provider: 'none', error: e instanceof ApoApiError ? e.code : 'request-failed' };
  }
}
