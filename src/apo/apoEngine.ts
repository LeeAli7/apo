// Apo — UI-адаптер поверх реального движка (src/core/apo, owner: Ares).
// UI держится за эти сигнатуры; внутри — core: parseQuestions, ingestFile,
// solveTest (порог 0.75), explainText с кэшем, quota/history. Моков здесь нет.
import {
  ingestFile as coreIngest,
  parseQuestions as coreParse,
  solveTest as coreSolve,
  explainText as coreExplain,
  quotaRemaining,
  consumeQuota,
  APO_FREE_DAILY,
  cacheKey,
  type ApoQuestion as CoreQ,
} from '../core/apo';
import { APO_KEYS, ApoIngestResult, ApoQuestion, ApoSolveResult } from './apoTypes';

const KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function toUI(q: CoreQ): ApoQuestion {
  return {
    id: cacheKey(['q', q.stem, ...q.options]),
    stem: q.stem,
    options: q.options.map((t, i) => ({ key: KEYS[i] ?? String(i + 1), text: t })),
  };
}

// Разложить вставленный текст на вопросы; первый — для быстрого решения.
export function parsePastedTest(raw: string): ApoQuestion {
  const list = coreParse(raw);
  const first = list[0] ?? { stem: raw.trim() || 'Вопрос', options: [] as string[], open: true };
  return toUI(first);
}

export function parseAllQuestions(raw: string): ApoQuestion[] {
  return coreParse(raw).map(toUI);
}

// ingestFile: файл (камера/галерея/PDF/DOCX/текст) -> текст + вопросы + предупреждения.
export async function ingestFile(name: string, text: string): Promise<ApoIngestResult> {
  const r = await coreIngest({ name, text: text || undefined });
  return { text: r.text, questions: r.questions.map(toUI), warnings: r.warnings };
}

// solveTest: вопрос + варианты -> ответ с confidence и флагом низкой точности.
export async function solveTest(question: string, options: string[]): Promise<ApoSolveResult> {
  const t0 = Date.now();
  const r = await coreSolve({ stem: question, options });
  return {
    answerIndex: r.choiceIndex,
    confidence: r.probabilities,
    ms: Date.now() - t0,
    lowAccuracy: r.lowAccuracy,
  };
}

// explainText: подробный разбор по кнопке под каждым тестом, кэш внутри core.
export async function explainText(question: string, answer: string): Promise<string> {
  const r = await coreExplain(question, answer);
  return r.text;
}

// Квота free: N решений в день (лимиты и история — в core/quota).
export async function quotaLeft(): Promise<{ left: number; total: number }> {
  const left = await quotaRemaining();
  return { left: left === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : left, total: APO_FREE_DAILY };
}

export async function quotaConsume(): Promise<void> {
  await consumeQuota();
}

export { APO_KEYS };
