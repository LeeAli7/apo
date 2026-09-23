// apo-server pdf — text layer via pdfjs-dist plus embedded-image harvest
// for scanned pages (fed to vision OCR by the pipeline). No native deps.

import { deflateSync } from 'node:zlib';

export interface PdfPage {
  index: number;
  text: string;
  images: { png: Buffer; width: number; height: number }[];
}

const MAX_IMAGES = 5;
const MAX_IMAGE_SIDE = 1600;

interface PdfJsPage {
  getTextContent(): Promise<{ items: { str?: string; hasEOL?: boolean }[] }>;
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
  objs: { get(name: string): unknown };
}

interface PdfJsDoc {
  numPages: number;
  getPage(n: number): Promise<PdfJsPage>;
  destroy?: () => Promise<void>;
}

interface PdfJsLib {
  OPS: { paintImageXObject: number };
  ImageKind: { GRAYSCALE_1BPP: number; RGB_24BPP: number; RGBA_32BPP: number };
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(params: Record<string, unknown>): { promise: Promise<PdfJsDoc> };
}

interface RawImage {
  width: number;
  height: number;
  kind: number;
  data: Uint8Array | Uint8ClampedArray;
}

function crc32(buf: Buffer): number {
  let table = (crc32 as { t?: number[] }).t;
  if (!table) {
    table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    (crc32 as { t?: number[] }).t = table;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (table as number[])[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([td, data])), 0);
  return Buffer.concat([len, td, data, crc]);
}

/** Minimal truecolor PNG encoder (color type 2/6), zero deps. */
export function encodePng(width: number, height: number, rgba: boolean, pixels: Buffer): Buffer {
  const stride = width * (rgba ? 4 : 3);
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = rgba ? 6 : 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function downscaleNearest(img: RawImage): { width: number; height: number; pixels: Buffer } {
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.floor(img.width * scale));
  const h = Math.max(1, Math.floor(img.height * scale));
  const srcBpp = img.kind === 3 ? 4 : 3; // RGBA_32BPP=3 in pdfjs ImageKind
  const dst = Buffer.alloc(w * h * srcBpp);
  const src = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x / scale));
      const sy = Math.min(img.height - 1, Math.floor(y / scale));
      src.copy(dst, (y * w + x) * srcBpp, (sy * img.width + sx) * srcBpp, (sy * img.width + sx) * srcBpp + srcBpp);
    }
  }
  return { width: w, height: h, pixels: dst };
}

async function resolveObj(objs: PdfJsPage['objs'], name: string): Promise<RawImage | null> {
  try {
    const got = objs.get(name) as unknown;
    const img = (got && typeof (got as Promise<RawImage>).then === 'function'
      ? await (got as Promise<RawImage>)
      : (got as RawImage)) as RawImage;
    if (!img || typeof img.width !== 'number' || !img.data) return null;
    return img;
  } catch {
    return null;
  }
}

/** Extract per-page text + embedded raster images. Throws on broken PDFs. */
export async function pdfExtract(buf: Buffer): Promise<PdfPage[]> {
  const mod = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsLib;
  try {
    const { createRequire } = await import('node:module');
    const require = createRequire(__filename);
    mod.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  } catch {
    // No worker file resolvable — pdfjs falls back to the main thread.
  }
  const doc = await mod.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const pages: PdfPage[] = [];
  try {
    const total = Math.min(doc.numPages, 30);
    for (let n = 1; n <= total; n++) {
      const page = await doc.getPage(n);
      const tc = await page.getTextContent();
      const parts: string[] = [];
      for (const item of tc.items) {
        if (typeof item.str === 'string' && item.str) {
          parts.push(item.str);
          if (item.hasEOL) parts.push('\n');
        }
      }
      const text = parts
        .join('')
        .split('\n')
        .map((l) => l.replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean)
        .join('\n');
      const images: PdfPage['images'] = [];
      if (text.replace(/\s/g, '').length < 30) {
        const ops = await page.getOperatorList();
        for (let i = 0; i < ops.fnArray.length && images.length < MAX_IMAGES; i++) {
          if (ops.fnArray[i] !== mod.OPS.paintImageXObject) continue;
          const args = ops.argsArray[i] as unknown[];
          if (typeof args[0] !== 'string') continue;
          const img = await resolveObj(page.objs, args[0]);
          if (!img || img.kind === mod.ImageKind.GRAYSCALE_1BPP) continue;
          if (img.kind !== mod.ImageKind.RGB_24BPP && img.kind !== mod.ImageKind.RGBA_32BPP) continue;
          const rgba = img.kind === mod.ImageKind.RGBA_32BPP;
          const small = downscaleNearest(img);
          images.push({ png: encodePng(small.width, small.height, rgba, small.pixels), width: small.width, height: small.height });
        }
      }
      pages.push({ index: n, text, images });
    }
  } finally {
    if (typeof doc.destroy === 'function') await doc.destroy();
  }
  return pages;
}
