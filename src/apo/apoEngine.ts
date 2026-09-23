// Apo — тонкий слой движка для UI.
// Реальные вызовы: локальный парсинг + backend (структура, решение,
// объяснения, квота). Сигнатуры, APO_KEYS и порог 0.8 — контракт,
// UI закодирован под них.
import {
  ApoIngestResult,
  ApoQuestion,
  ApoSolveResult,
} from './apoTypes';
import {
  cacheKey,
  parseQuestions,
  ingestFile as coreIngestFile,
  solveTest as coreSolve,
  explainText as coreExplain,
  quotaView,
  consumeQuota as coreConsumeQuota,
  APO_FREE_DAILY,
} from '../core/apo';

const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function hashString(s: string): string {
  return cacheKey(['apo-ui-v1', s]).slice(0, 12);
}

// Разложить вставленный текст на вопрос и варианты построчно (локально).
export function parsePastedTest(raw: string): ApoQuestion {
  const parsed = parseQuestions(raw);
  const first = parsed.find((q) => !q.open) ?? parsed[0];
  if (!first) return { id: hashString(raw), stem: 'Вопрос', options: [] };
  return {
    id: hashString(raw),
    stem: first.stem || 'Вопрос',
    options: first.options.slice(0, 8).map((text, i) => ({
      key: OPTION_KEYS[i] ?? `V${i + 1}`,
      text,
    })),
  };
}

export function parseAllQuestions(raw: string): ApoQuestion[] {
  const parsed = parseQuestions(raw);
  return parsed
    .filter((q) => q.stem.trim() || q.options.length > 0)
    .map((q) => ({
      id: hashString(q.stem + '|' + q.options.join('|')),
      stem: q.stem || 'Вопрос',
      options: q.options.slice(0, 8).map((t, i) => ({ key: OPTION_KEYS[i] ?? `V${i + 1}`, text: t })),
    }));
}

// ingestFile: файл (камера/галерея/PDF/DOCX/текст) -> текст + вопросы + предупреждения.
// Текст разбирается локально; бинарные вложения (фото/PDF/DOCX) уходят на
// backend через uri. Без uri бинарник разобрать не из чего — честное предупреждение.
export async function ingestFile(name: string, text: string, uri?: string): Promise<ApoIngestResult> {
  const warnings: string[] = [];
  if (!text.trim()) {
    if (uri) {
      const r = await coreIngestFile({ name, uri });
      return {
        text: r.text,
        questions: r.questions.map((q) => ({
          id: hashString(q.stem + '|' + q.options.join('|')),
          stem: q.stem || 'Вопрос',
          options: q.options.slice(0, 8).map((t, i) => ({ key: OPTION_KEYS[i] ?? `V${i + 1}`, text: t })),
        })),
        warnings: [...warnings, ...r.warnings],
      };
    }
    return { text, questions: [], warnings: ['Пустой документ — нечего решать'] };
  }
  const parsed = parseQuestions(text);
  const usable = parsed.filter((q) => !q.open && q.options.length >= 2);
  if (usable.length > 0) {
    return {
      text,
      questions: usable.map((q) => ({
        id: hashString(q.stem + '|' + q.options.join('|')),
        stem: q.stem,
        options: q.options.slice(0, 8).map((t, i) => ({ key: OPTION_KEYS[i] ?? `V${i + 1}`, text: t })),
      })),
      warnings,
    };
  }
  // Локально структуры нет — пробуем серверный разбор, иначе открытый вопрос.
  const r = await coreIngestFile({ name, text });
  return {
    text: r.text,
    questions: r.questions.map((q) => ({
      id: hashString(q.stem + '|' + q.options.join('|')),
      stem: q.stem || 'Вопрос',
      options: q.options.slice(0, 8).map((t, i) => ({ key: OPTION_KEYS[i] ?? `V${i + 1}`, text: t })),
    })),
    warnings: [...warnings, ...r.warnings],
  };
}

// solveTest: вопрос + варианты -> ответ с confidence через backend.
// Без сервера/ключей — честное пустое состояние (answerIndex -1), не выдумка.
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

// explainText: разбор по кнопке под каждым тестом. Сначала персистентный
// кэш, потом backend; без связи — честная строка вместо выдуманного текста.
export async function explainText(question: string, answer: string): Promise<string> {
  const r = await coreExplain(question, answer);
  if (r.text) return r.text;
  if (r.error === 'no-server') return 'Нет связи с сервером Apo: проверь интернет и адрес API в сборке.';
  if (r.error === 'no-provider-key') return 'На сервере нет ключа модели объяснений — разбор временно недоступен.';
  return 'Объяснение недоступно (ошибка сервера). Попробуй позже.';
}

// Квота free: источник истины — сервер, локально только последний статус.
export async function quotaLeft(): Promise<{ left: number; total: number }> {
  const v = await quotaView();
  if (!Number.isFinite(v.remaining)) return { left: APO_FREE_DAILY, total: APO_FREE_DAILY };
  return { left: Math.max(0, v.remaining), total: APO_FREE_DAILY };
}

export async function quotaConsume(): Promise<void> {
  await coreConsumeQuota();
}
