// apo-server providers — DeepSeek (structure/explain/fallback) and the
// decision engine (choice + calibrated confidence) over plain fetch.
// No keys here: everything from env. Failures are typed ProviderErrors,
// never silent fallbacks to invented data.

import type { ServerEnv } from './env';

export class ProviderError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.status = status;
  }
}

async function postJson(url: string, key: string, body: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ProviderError('provider-unreachable', `Provider unreachable: ${url}`);
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new ProviderError('bad-provider-response', `Provider non-JSON (HTTP ${res.status})`);
  }
  if (!res.ok) {
    const msg = typeof (data as { error?: unknown })?.error === 'string'
      ? ((data as { error: string }).error as string).slice(0, 200)
      : `HTTP ${res.status}`;
    throw new ProviderError('provider-rejected', `Provider rejected request: ${msg}`, res.status >= 500 ? 502 : 502);
  }
  return data;
}

export interface Structured {
  stem: string;
  options: string[];
  open: boolean;
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === 'string' && item.trim()) out.push(item.trim());
    else if (item && typeof item === 'object') {
      const t = (item as Record<string, unknown>).text;
      if (typeof t === 'string' && t.trim()) out.push(t.trim());
    }
    if (out.length >= 8) break;
  }
  return out;
}

/** Split raw test text into {stem, options[], open} via the text model. */
export async function deepseekStructure(env: ServerEnv, text: string): Promise<Structured> {
  if (!env.deepseekApiKey) throw new ProviderError('no-provider-key', 'DEEPSEEK_API_KEY is not set', 503);
  const data = (await postJson(`${env.deepseekBaseUrl}/chat/completions`, env.deepseekApiKey, {
    model: env.deepseekModel,
    response_format: { type: 'json_object' },
    temperature: 0,
    messages: [
      {
        role: 'system',
        content:
          'Разбери текст теста в JSON строго вида {"stem": string, "options": string[], "open": boolean}. ' +
          'stem — формулировка вопроса, options — варианты ответа (без букв-маркеров), ' +
          'open=true только если вариантов нет. Верни только JSON.',
      },
      { role: 'user', content: text.slice(0, 8000) },
    ],
  })) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? '';
  let parsed: { stem?: unknown; options?: unknown; open?: unknown };
  try {
    parsed = JSON.parse(content) as typeof parsed;
  } catch {
    throw new ProviderError('bad-provider-response', 'Structure model returned non-JSON');
  }
  const stem = typeof parsed.stem === 'string' ? parsed.stem.trim().slice(0, 2000) : '';
  const options = toStringArray(parsed.options);
  return { stem, options, open: options.length === 0 };
}

export interface EngineResult {
  choiceIndex: number;
  probabilities: number[];
  confidence: number;
}

/**
 * Score answer options with the decision engine.
 * Request mirrors client buildChoicePayload (state + Choice criteria).
 */
export async function jevChoice(env: ServerEnv, stem: string, options: string[]): Promise<EngineResult> {
  if (!env.jevApiKey) throw new ProviderError('no-provider-key', 'TYPESAFE_API_KEY is not set', 503);
  const criteria: Record<string, string> = {};
  options.forEach((o, i) => {
    criteria[`opt_${i}`] = o;
  });
  const data = (await postJson(`${env.jevBaseUrl}/v1/systemone`, env.jevApiKey, {
    state: { question: stem },
    model: env.jevModel,
    questions: {
      answer: {
        type: 'choice',
        instructions: 'Выбери вариант, который правильно отвечает на `question`.',
        criteria,
      },
    },
  })) as {
    answers?: Record<string, { choice?: unknown; probabilities?: unknown; confidence?: unknown }>;
  };
  const ans = data.answers?.answer;
  if (!ans) throw new ProviderError('bad-provider-response', 'Decision engine returned no answers');

  let choiceIndex = -1;
  const c = ans.choice;
  if (typeof c === 'number' && Number.isInteger(c) && c >= 0 && c < options.length) choiceIndex = c;
  else if (typeof c === 'string') {
    const m = /^opt_(\d+)$/.exec(c.trim());
    if (m) {
      const i = parseInt(m[1], 10);
      if (i >= 0 && i < options.length) choiceIndex = i;
    } else {
      const exact = options.findIndex((o) => o === c.trim());
      if (exact >= 0) choiceIndex = exact;
    }
  }
  let probabilities: number[] = [];
  const p = ans.probabilities;
  if (Array.isArray(p)) probabilities = p.map((v) => (typeof v === 'number' ? v : 0));
  else if (p && typeof p === 'object') {
    probabilities = options.map((_, i) => {
      const v = (p as Record<string, unknown>)[`opt_${i}`];
      return typeof v === 'number' ? v : 0;
    });
  }
  const confidence = typeof ans.confidence === 'number' ? ans.confidence : Math.max(0, ...probabilities);
  if (choiceIndex < 0 || probabilities.length !== options.length || !(confidence >= 0)) {
    throw new ProviderError('bad-provider-response', 'Decision engine returned an unusable shape');
  }
  const round3 = (v: number): number => Math.round(v * 1000) / 1000;
  return { choiceIndex, probabilities: probabilities.map(round3), confidence: round3(confidence) };
}

/** Short step-by-step explanation (RU) via the text model. */
export async function deepseekExplain(env: ServerEnv, stem: string, answer: string): Promise<string> {
  if (!env.deepseekApiKey) throw new ProviderError('no-provider-key', 'DEEPSEEK_API_KEY is not set', 503);
  const data = (await postJson(`${env.deepseekBaseUrl}/chat/completions`, env.deepseekApiKey, {
    model: env.deepseekModel,
    temperature: 0.2,
    max_tokens: 600,
    messages: [
      {
        role: 'system',
        content: 'Объясняй коротко и по шагам, на русском, 3–6 шагов, без воды.',
      },
      {
        role: 'user',
        content:
          `Объясни коротко и по шагам, почему правильный ответ — «${answer}», ` +
          `на вопрос: ${stem}.`,
      },
    ],
  })) as { choices?: { message?: { content?: string } }[] };
  const text = (data.choices?.[0]?.message?.content ?? '').trim();
  if (!text) throw new ProviderError('bad-provider-response', 'Explain model returned empty text');
  return text.slice(0, 4000);
}

/** Low-confidence fallback: ask the text model to pick an option index. */
export async function deepseekFallbackChoice(
  env: ServerEnv,
  stem: string,
  options: string[],
): Promise<EngineResult> {
  if (!env.deepseekApiKey) throw new ProviderError('no-provider-key', 'DEEPSEEK_API_KEY is not set', 503);
  const listed = options.map((o, i) => `${i}. ${o}`).join('\n');
  const data = (await postJson(`${env.deepseekBaseUrl}/chat/completions`, env.deepseekApiKey, {
    model: env.deepseekModel,
    response_format: { type: 'json_object' },
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: 'Выбери правильный вариант. Верни только JSON вида {"index": number}.',
      },
      { role: 'user', content: `Вопрос: ${stem}\nВарианты:\n${listed}`.slice(0, 8000) },
    ],
  })) as { choices?: { message?: { content?: string } }[] };
  let idx = -1;
  try {
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '') as { index?: unknown };
    if (typeof parsed.index === 'number' && Number.isInteger(parsed.index)) idx = parsed.index;
  } catch {
    idx = -1;
  }
  if (idx < 0 || idx >= options.length) {
    throw new ProviderError('bad-provider-response', 'Fallback model returned an unusable index');
  }
  const probabilities = options.map((_, i) => (i === idx ? 0.6 : 0.4 / Math.max(1, options.length - 1)));
  return { choiceIndex: idx, probabilities, confidence: 0.6 };
}
