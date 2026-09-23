// apo/ingest — camera/gallery/PDF/DOCX/text into { text, questions[], warnings[] }.
// Text-capable inputs reuse the reader engine (loadReadable). Photo/PDF-scan
// OCR is out of MVP scope: those return honest warnings, never fake text.

import { loadReadable } from '../../utils/documentLoader';
import { getExtension } from '../../utils/fileTypes';
import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'react-native';
import { apiConfigured, structureRemote, parseDocumentRemote, ApoApiError } from './api';
import { getDeviceId } from './device';

export interface ApoFileInput {
  name: string;
  uri?: string;
  text?: string;
  mime?: string;
}

export interface ApoQuestion {
  stem: string;
  options: string[];
  open: boolean;
}

export interface IngestResult {
  text: string;
  questions: ApoQuestion[];
  warnings: string[];
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'bmp', 'gif']);
// Formats the vision model accepts directly.
const VISION_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const MAX_LOCAL_BYTES = 15 * 1024 * 1024;
/** Long side cap for uploads: fewer timeouts, cheaper vision, faster answers. */
export const APO_IMAGE_MAX_SIDE = 1600;
/** JPEG quality for uploads: text stays readable, bytes drop ~10x. */
export const APO_IMAGE_JPEG_QUALITY = 0.8;

/** Read any local file as base64 via the SDK57 File API.
 * NOTE: legacy readAsStringAsync/getInfoAsync from 'expo-file-system' THROW
 * at runtime in SDK57 (deprecated shims) — do not use them.
 * Exported as a test seam (device FS can't run in Node). */
export async function readUriBase64(uri: string): Promise<string> {
  let file: InstanceType<typeof File>;
  try {
    file = new File(uri);
  } catch (e) {
    throw new Error(`bad-uri: ${e instanceof Error ? e.message : 'invalid file uri'}`);
  }
  const knownSize = typeof file.size === 'number' ? file.size : 0;
  if (knownSize > MAX_LOCAL_BYTES) {
    throw new Error(`too-large: файл ${(knownSize / 1048576).toFixed(1)} МБ больше 15 МБ`);
  }
  let bytes: Uint8Array;
  try {
    bytes = await file.bytes();
  } catch (e) {
    throw new Error(`read-failed: ${e instanceof Error ? e.message : 'cannot read file'}`);
  }
  if (bytes.length > MAX_LOCAL_BYTES) {
    throw new Error(`too-large: файл ${(bytes.length / 1048576).toFixed(1)} МБ больше 15 МБ`);
  }
  if (bytes.length === 0) throw new Error('empty-file: файл пустой (0 байт)');
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x2000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x2000));
  }
  try {
    return btoa(bin);
  } catch {
    throw new Error('base64-failed: не удалось закодировать файл');
  }
}

/**
 * Photos/screenshots for upload: downscale to max 1600px long side,
 * JPEG 0.8, base64 straight from the manipulator (no extra file read).
 * Small images pass through without upscaling. The filename is rewritten
 * to .jpg because the bytes are always JPEG now (server sniffs mime by ext).
 * Exported as a test seam (device image pipeline can't run in Node).
 */
export async function prepareImageForUpload(
  uri: string,
  filename: string,
): Promise<{ base64: string; filename: string }> {
  const size: { width: number; height: number } = await new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (e: unknown) => reject(new Error(`size-probe-failed: ${e instanceof Error ? e.message : 'cannot read image size'}`)),
    );
  });
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
    throw new Error('size-probe-failed: image has no dimensions');
  }
  const longSide = Math.max(size.width, size.height);
  const actions =
    longSide > APO_IMAGE_MAX_SIDE
      ? [
          {
            resize: {
              width: Math.round((size.width * APO_IMAGE_MAX_SIDE) / longSide),
              height: Math.round((size.height * APO_IMAGE_MAX_SIDE) / longSide),
            },
          },
        ]
      : [];
  const out = await manipulateAsync(uri, actions, {
    compress: APO_IMAGE_JPEG_QUALITY,
    format: SaveFormat.JPEG,
    base64: true,
  });
  if (!out.base64) throw new Error('downscale-failed: манипулятор не вернул данные');
  const dot = filename.lastIndexOf('.');
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  return { base64: out.base64, filename: `${base}.jpg` };
}

/**
 * Photos and PDFs go to the backend: vision OCR for images, text layer
 * (+scan OCR) for PDFs. No text is ever invented locally.
 */
async function ingestRemoteFile(
  name: string,
  uri: string,
  warnings: string[],
  isImage: boolean,
): Promise<IngestResult> {
  if (!apiConfigured()) {
    warnings.push('no-server: для фото и PDF нужен backend (EXPO_PUBLIC_APO_API_URL)');
    return { text: '', questions: [], warnings };
  }
  let b64: string;
  let filename = name;
  if (isImage) {
    try {
      const prepared = await prepareImageForUpload(uri, name);
      b64 = prepared.base64;
      filename = prepared.filename;
    } catch (e) {
      warnings.push(e instanceof Error ? e.message : 'downscale-failed: не удалось подготовить фото');
      return { text: '', questions: [], warnings };
    }
  } else {
    try {
      b64 = await readUriBase64(uri);
    } catch (e) {
      // Real reason goes to the user — never a bare 'unreadable-file'.
      warnings.push(e instanceof Error ? e.message : 'unreadable-file: не удалось прочитать файл с устройства');
      return { text: '', questions: [], warnings };
    }
  }
  if (b64.length > MAX_LOCAL_BYTES * 2) {
    warnings.push('too-large: файл больше 15 МБ');
    return { text: '', questions: [], warnings };
  }
  try {
    const deviceId = await getDeviceId();
    const r = await parseDocumentRemote(deviceId, null, filename, b64);
    return {
      text: r.text,
      questions: r.questions.map((q) => ({ stem: q.stem, options: q.options.slice(0, 8), open: q.open })),
      warnings: [...warnings, ...r.warnings],
    };
  } catch (e) {
    const code = e instanceof ApoApiError ? e.code : 'request-failed';
    warnings.push(`${code}: серверный разбор не удался`);
    return { text: '', questions: [], warnings };
  }
}

const Q_START =
  /^(?:#{1,3}\s+|\d{1,3}[.)]\s*\S|вопрос\s*\d*\s*[:.)]?\s*\S)/i;
const OPT_LINE =
  /^\s*([A-EA-Яa-ea-я]|[1-5])[.)\]\-:]\s+(.+?)\s*$/;
const BULLET_LINE = /^\s*[-•*]\s+(.+?)\s*$/;

const MAX_QUESTIONS = 50;
const MAX_STEM = 2000;
const MAX_OPTIONS = 8;

export function normalizeText(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripHtml(html: string): string {
  return normalizeText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'"),
  );
}

function sheetsToText(sheets: { name: string; rows: string[][] }[]): string {
  return sheets
    .map((s) => `## ${s.name}\n` + s.rows.map((r) => r.join(' | ')).join('\n'))
    .join('\n\n');
}

function pushCurrent(list: ApoQuestion[], cur: { stem: string; options: string[] } | null): void {
  if (!cur) return;
  const stem = cur.stem.trim().slice(0, MAX_STEM);
  if (!stem && cur.options.length === 0) return;
  list.push({ stem, options: cur.options.slice(0, MAX_OPTIONS), open: cur.options.length === 0 });
}

/** Split plain text into questions by numbering + option markers. */
export function parseQuestions(text: string): ApoQuestion[] {
  const out: ApoQuestion[] = [];
  let cur: { stem: string; options: string[]; numbered: boolean } | null = null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const opt = OPT_LINE.exec(line);
    if (opt !== null) {
      const optText = opt[2].trim();
      const isDigit = /^\d/.test(opt[1]);
      if (isDigit && (cur === null || cur.options.length > 0 || cur.numbered)) {
        // numbered question ("2. ..."), not a numeric option
        if (out.length + (cur ? 1 : 0) >= MAX_QUESTIONS) break;
        pushCurrent(out, cur);
        cur = { stem: line, options: [], numbered: true };
        continue;
      }
      if (cur === null) cur = { stem: '', options: [], numbered: false };
      if (cur.options.length < MAX_OPTIONS && optText) cur.options.push(optText);
      else if (optText) cur.stem += (cur.stem ? ' ' : '') + optText;
      continue;
    }
    const bullet = BULLET_LINE.exec(line);
    if (bullet !== null) {
      const optText = (bullet[1] ?? '').trim();
      if (cur === null) cur = { stem: '', options: [], numbered: false };
      if (cur.options.length < MAX_OPTIONS && optText) cur.options.push(optText);
      else if (optText) cur.stem += (cur.stem ? ' ' : '') + optText;
      continue;
    }
    if (Q_START.test(line)) {
      if (out.length + (cur ? 1 : 0) >= MAX_QUESTIONS) break;
      pushCurrent(out, cur);
      cur = { stem: line.replace(/^#{1,3}\s+/, ''), options: [], numbered: false };
      continue;
    }
    if (cur === null) cur = { stem: line, options: [], numbered: false };
    else if (cur.options.length > 0) {
      cur.options[cur.options.length - 1] += ' ' + line;
    } else {
      cur.stem += (cur.stem ? '\n' : '') + line;
    }
  }
  pushCurrent(out, cur);
  return out;
}

export async function ingestFile(file: ApoFileInput): Promise<IngestResult> {
  const warnings: string[] = [];
  let text = '';

  if (typeof file.text === 'string' && file.text.trim() !== '') {
    text = normalizeText(file.text);
  } else if (file.uri) {
    const ext = getExtension(file.name);
    if (VISION_EXTS.has(ext) || ext === 'pdf') {
      return ingestRemoteFile(file.name, file.uri, warnings, VISION_EXTS.has(ext));
    }
    if (IMAGE_EXTS.has(ext)) {
      warnings.push('unsupported-image: этот формат фото не поддерживается распознаванием (нужны JPG/PNG/WebP)');
      return { text: '', questions: [], warnings };
    }
    const doc = await loadReadable(file.uri, ext);
    if (doc.kind === 'text' && doc.text) text = normalizeText(doc.text);
    else if (doc.kind === 'sheet' && doc.sheets) text = normalizeText(sheetsToText(doc.sheets));
    else if (doc.kind === 'rich' && doc.html) text = stripHtml(doc.html);
    else if (doc.kind === 'pages' && doc.pages) text = normalizeText(doc.pages.join('\n\n'));
    else if (apiConfigured() && file.uri) {
      // Local reader gave up (e.g. office formats) — try the server parser.
      return ingestRemoteFile(file.name, file.uri, warnings, false);
    } else {
      warnings.push(doc.note ?? 'binary-unsupported: формат без извлекаемого текста');
      return { text: '', questions: [], warnings };
    }
  } else {
    warnings.push('empty-input: нет ни text, ни uri');
    return { text: '', questions: [], warnings };
  }

  if (!text) {
    warnings.push('empty-text: из входа не извлеклось текста');
    return { text: '', questions: [], warnings };
  }
  const questions = parseQuestions(text);
  if (questions.length === 0 || questions.every((q) => q.open)) {
    // Local parse found no usable structure — ask the backend (model
    // structuring) before falling back to a single open question.
    if (apiConfigured()) {
      try {
        const deviceId = await getDeviceId();
        const s = await structureRemote(deviceId, null, text.slice(0, 8000));
        if (s.stem) {
          return {
            text,
            questions: [{ stem: s.stem, options: s.options, open: s.open }],
            warnings,
          };
        }
      } catch (e) {
        warnings.push(
          e instanceof ApoApiError && e.code === 'no-provider-key'
            ? 'structure-unavailable: на сервере нет ключа модели — разбор только локальный'
            : 'structure-failed: серверный разбор не удался — разбор только локальный',
        );
      }
    }
  }
  if (questions.length === 0) {
    warnings.push('no-questions: разбивка не нашла вопросов — один открытый вопрос');
    return { text, questions: [{ stem: text.slice(0, MAX_STEM), options: [], open: true }], warnings };
  }
  return { text, questions, warnings };
}
