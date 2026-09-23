// apo-server split — light multi-question splitter (mirrors the client's
// parseQuestions; keep both in sync when marker rules change).

export interface Chunk {
  stem: string;
  options: string[];
}

const OPT_LINE = /^\s*([A-EA-Яa-ea-я]|[1-5])[.)\]\-:]\s+(.+?)\s*$/;
const BULLET_LINE = /^\s*[-•*]\s+(.+?)\s*$/;
const Q_START = /^(?:#{1,3}\s+|вопрос\s*\d*\s*[:.)]?\s*\S)/i;
const DIGIT_Q = /^\d{1,3}[.)]\s+\S/;

const MAX_CHUNKS = 10;
const MAX_STEM = 2000;

export function splitQuestions(text: string): Chunk[] {
  const out: Chunk[] = [];
  let cur: { stem: string; options: string[]; numbered: boolean } | null = null;
  const push = (): void => {
    if (!cur) return;
    const stem = cur.stem.trim().slice(0, MAX_STEM);
    if (stem || cur.options.length > 0) out.push({ stem, options: cur.options.slice(0, 8) });
    cur = null;
  };
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const opt = OPT_LINE.exec(line);
    if (opt) {
      const optText = opt[2].trim();
      const isDigit = /^\d/.test(opt[1]);
      if (isDigit && (cur === null || cur.options.length > 0 || cur.numbered)) {
        if (out.length >= MAX_CHUNKS) break;
        push();
        cur = { stem: line, options: [], numbered: true };
        continue;
      }
      if (cur === null) cur = { stem: '', options: [], numbered: false };
      if (optText) cur.options.push(optText);
      continue;
    }
    const bullet = BULLET_LINE.exec(line);
    if (bullet) {
      const optText = (bullet[1] ?? '').trim();
      if (cur === null) cur = { stem: '', options: [], numbered: false };
      if (optText) cur.options.push(optText);
      continue;
    }
    if (Q_START.test(line) || (DIGIT_Q.test(line) && cur !== null && (cur.options.length > 0 || cur.numbered))) {
      if (out.length >= MAX_CHUNKS) break;
      push();
      cur = { stem: line.replace(/^#{1,3}\s+/, ''), options: [], numbered: DIGIT_Q.test(line) };
      continue;
    }
    if (cur === null) cur = { stem: line, options: [], numbered: false };
    else if (cur.options.length > 0) cur.options[cur.options.length - 1] += ' ' + line;
    else cur.stem += (cur.stem ? '\n' : '') + line;
  }
  push();
  return out;
}
