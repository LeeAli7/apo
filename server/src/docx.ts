// apo-server docx — zero-dependency .docx -> text.
// Reads the ZIP central directory, inflates word/document.xml with
// node:zlib (raw deflate), extracts <w:t> runs, <w:p> become newlines.

import { inflateRawSync } from 'node:zlib';

interface ZipEntry {
  name: string;
  method: number;
  compSize: number;
  localOffset: number;
}

function readU16(buf: Buffer, o: number): number {
  return buf[o] | (buf[o + 1] << 8);
}

function readU32(buf: Buffer, o: number): number {
  return (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) >>> 0;
}

function findEntries(buf: Buffer): ZipEntry[] {
  // End of central directory: PK\x05\x06 within the last 66k bytes.
  const tailStart = Math.max(0, buf.length - 66000);
  let eocd = -1;
  for (let i = buf.length - 22; i >= tailStart; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip (EOCD missing)');
  const count = readU16(buf, eocd + 10);
  const cdOffset = readU32(buf, eocd + 16);
  const entries: ZipEntry[] = [];
  let o = cdOffset;
  for (let i = 0; i < count; i++) {
    if (readU32(buf, o) !== 0x02014b50) throw new Error('bad central directory');
    const method = readU16(buf, o + 10);
    const compSize = readU32(buf, o + 20);
    const nameLen = readU16(buf, o + 28);
    const extraLen = readU16(buf, o + 30);
    const commentLen = readU16(buf, o + 32);
    const localOffset = readU32(buf, o + 42);
    const name = buf.toString('utf8', o + 46, o + 46 + nameLen);
    entries.push({ name, method, compSize, localOffset });
    o += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function extractEntry(buf: Buffer, e: ZipEntry): Buffer {
  const o = e.localOffset;
  if (readU32(buf, o) !== 0x04034b50) throw new Error('bad local header');
  const nameLen = readU16(buf, o + 26);
  const extraLen = readU16(buf, o + 28);
  const dataOff = o + 30 + nameLen + extraLen;
  const raw = buf.subarray(dataOff, dataOff + e.compSize);
  if (e.method === 0) return Buffer.from(raw);
  if (e.method === 8) return inflateRawSync(raw);
  throw new Error(`unsupported zip method ${e.method}`);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** Plain text of word/document.xml; paragraphs separated by newlines. */
export function docxToText(buf: Buffer): string {
  const entries = findEntries(buf);
  const doc = entries.find((e) => e.name === 'word/document.xml');
  if (!doc) throw new Error('word/document.xml missing');
  const xml = extractEntry(buf, doc).toString('utf8');
  const withBreaks = xml
    .replace(/<\/w:p[^>]*>/g, '\n')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<w:tab[^>]*\/>/g, ' ');
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let m: RegExpExecArray | null;
  let lastEnd = 0;
  const pieces: string[] = [];
  while ((m = re.exec(withBreaks)) !== null) {
    pieces.push(withBreaks.slice(lastEnd, m.index));
    pieces.push(decodeEntities(m[1]));
    lastEnd = m.index + m[0].length;
  }
  pieces.push(withBreaks.slice(lastEnd));
  const text = pieces
    .join('')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l) => l.length > 0)
    .join('\n');
  return text;
}
