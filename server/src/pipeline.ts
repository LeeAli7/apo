// apo-server pipeline — the real path from input to answer:
// cache -> decision engine -> 0.8 gate -> model fallback -> cache+quota.
// Quota burns only on a real non-cached solution; outages never burn it.

import type { ServerEnv } from './env';
import { ApoDb, sha256 } from './db';
import {
  ProviderError,
  deepseekStructure,
  deepseekExplain,
  deepseekFallbackChoice,
  deepseekVisionOcr,
  jevChoice,
  type Structured,
} from './providers';
import { docxToText } from './docx';
import { pdfExtract } from './pdf';
import { splitQuestions } from './split';

export const ACCURACY_GATE = 0.8;

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
  // Cache ONLY real successes: valid index, full distribution, finite
  // confidence. Anything else throws above and never lands in cache,
  // so a retry after an error always goes live.
  if (
    !Number.isInteger(finalChoice) ||
    finalChoice < 0 ||
    finalChoice >= cleanOpts.length ||
    finalProbs.length !== cleanOpts.length ||
    !Number.isFinite(finalConf)
  ) {
    throw new ProviderError('bad-provider-response', 'Decision engine returned an unusable shape', 502);
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

export interface ParsedQuestion {
  stem: string;
  options: string[];
  open: boolean;
}

export interface ParsedDocument {
  text: string;
  questions: ParsedQuestion[];
  warnings: string[];
}

const MAX_DOC_BYTES = 15 * 1024 * 1024;

function extOf(filename: string): string {
  const base = filename.split('/').pop() ?? filename;
  const i = base.lastIndexOf('.');
  if (i <= 0 || i === base.length - 1) return '';
  return base.slice(i + 1).toLowerCase();
}

const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function isMostlyText(buf: Buffer): boolean {
  if (buf.length === 0) return false;
  const sample = buf.subarray(0, 4096);
  let bad = 0;
  for (const b of sample) {
    if (b === 0 || (b < 8 && b !== 9 && b !== 10 && b !== 13)) bad++;
  }
  return bad / sample.length < 0.05;
}

/**
 * Binary attachments -> {text, questions[], warnings[]}.
 * txt/md/csv: direct. docx: zero-dep parse. pdf: text layer, scan pages via
 * embedded-image vision OCR. photos: vision OCR. Empty input is the ONLY
 * case that yields empty questions with an 'empty-*' warning.
 */
export async function parseDocument(
  env: ServerEnv,
  filename: string,
  dataBase64: string,
): Promise<ParsedDocument> {
  const warnings: string[] = [];
  let buf: Buffer;
  try {
    buf = Buffer.from(dataBase64, 'base64');
  } catch {
    throw new ProviderError('bad-request', 'dataBase64 is not valid base64', 400);
  }
  if (buf.length === 0) return { text: '', questions: [], warnings: ['empty-file: файл пустой (0 байт)'] };
  if (buf.length > MAX_DOC_BYTES) {
    throw new ProviderError('too-large', 'File exceeds 15 MB', 413);
  }
  const ext = extOf(filename);
  let text = '';

  if (['txt', 'md', 'markdown', 'csv', 'log'].includes(ext) || (ext === '' && isMostlyText(buf))) {
    text = buf.toString('utf8');
  } else if (ext === 'docx') {
    try {
      text = docxToText(buf);
    } catch {
      throw new ProviderError('bad-document', 'Cannot parse .docx — file may be corrupt', 422);
    }
    if (!text) return { text: '', questions: [], warnings: ['empty-docx: в документе нет извлекаемого текста'] };
  } else if (ext === 'pdf') {
    let pages: { index: number; text: string; images: { png: Buffer }[] }[];
    try {
      pages = await pdfExtract(buf);
    } catch {
      throw new ProviderError('bad-document', 'Cannot parse PDF — file may be corrupt', 422);
    }
    const parts: string[] = [];
    for (const page of pages) {
      if (page.text.trim()) {
        parts.push(page.text);
        continue;
      }
      if (page.images.length === 0) continue;
      if (!env.deepseekApiKey) {
        warnings.push(`scan-needs-model-key: страница ${page.index} — скан без текстового слоя, нужен ключ модели для OCR`);
        continue;
      }
      const ocr: string[] = [];
      for (const img of page.images) {
        try {
          ocr.push(await deepseekVisionOcr(env, img.png.toString('base64'), 'image/png'));
        } catch {
          warnings.push(`ocr-failed: страница ${page.index} не распозналась`);
        }
      }
      if (ocr.length > 0) parts.push(ocr.join('\n'));
    }
    text = parts.join('\n\n');
    if (!text.trim()) {
      return { text: '', questions: [], warnings: warnings.length > 0 ? warnings : ['empty-pdf: в PDF нет ни текста, ни картинок'] };
    }
  } else if (IMAGE_MIME[ext] !== undefined) {
    if (!env.deepseekApiKey) throw new ProviderError('no-provider-key', 'DEEPSEEK_API_KEY is not set', 503);
    text = await deepseekVisionOcr(env, buf.toString('base64'), IMAGE_MIME[ext]);
  } else if (isMostlyText(buf)) {
    text = buf.toString('utf8');
  } else {
    throw new ProviderError('unsupported-format', `Format .${ext || '?'} has no readable text`, 422);
  }

  if (!text.trim()) return { text: '', questions: [], warnings: ['empty-text: из файла не извлеклось текста'] };

  // Multi-question split locally; model structures only ambiguous chunks.
  const chunks = splitQuestions(text);
  const questions: ParsedQuestion[] = [];
  let structureWarned = false;
  for (const chunk of chunks) {
    if (chunk.options.length >= 2) {
      questions.push({ stem: chunk.stem, options: chunk.options, open: false });
      continue;
    }
    if (!chunk.stem) continue;
    try {
      const s = await deepseekStructure(env, `${chunk.stem}\n${chunk.options.join('\n')}`);
      if (s.stem || s.options.length > 0) {
        questions.push({ stem: s.stem || chunk.stem, options: s.options, open: s.open });
        continue;
      }
    } catch (e) {
      if (e instanceof ProviderError && e.code === 'no-provider-key' && !structureWarned) {
        warnings.push('structure-unavailable: нет ключа модели — неоднозначные куски остались открытыми');
        structureWarned = true;
      }
    }
    questions.push({ stem: chunk.stem, options: chunk.options, open: true });
  }
  if (questions.length === 0) {
    return { text, questions: [{ stem: text.slice(0, 2000), options: [], open: true }], warnings };
  }
  return { text, questions, warnings };
}
