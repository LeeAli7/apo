// Apo — лёгкий парсер объяснений: формулы, дроби, степени, спецсимволы.
// Без тяжёлых зависимостей: только unicode + вложенные <Text>.
// Понимает: **bold**, `code`, ^степень / _индекс (в т.ч. ^{..} _{..}),
// дроби 1/2 и \frac{a}{b}, \sqrt{..}, \pm \times \div \leq \geq \neq
// \to \pi и др., строки $..$, маркеры "- "/"1. ", заголовки "## ".
import React from 'react';
import { Text } from 'react-native';

const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ',
  a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ',
  l: 'ˡ', m: 'ᵐ', n2: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ',
};
const SUB: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', o: 'ₒ', x: 'ₓ',
  h: 'ₕ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', p: 'ₚ', s: 'ₛ', t: 'ₜ',
};

const VULGAR: Record<string, string> = {
  '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾', '1/5': '⅕', '2/5': '⅖',
  '3/5': '⅗', '4/5': '⅘', '1/6': '⅙', '5/6': '⅚', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞',
  '1/7': '⅐', '1/9': '⅑', '1/10': '⅒',
};

const CMD: Record<string, string> = {
  '\\pm': '±', '\\times': '×', '\\div': '÷', '\\cdot': '·', '\\leq': '≤', '\\le': '≤',
  '\\geq': '≥', '\\ge': '≥', '\\neq': '≠', '\\to': '→', '\\rightarrow': '→', '\\leftarrow': '←',
  '\\pi': 'π', '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\infty': '∞',
  '\\approx': '≈', '\\equiv': '≡', '\\sum': '∑', '\\prod': '∏', '\\sqrt': '√', '\\%': '%',
  '\\_': '_', '\\{': '{', '\\}': '}',
};

function mapChars(s: string, table: Record<string, string>): string | null {
  let out = '';
  for (const ch of s) {
    const m = table[ch];
    if (!m) return null;
    out += m;
  }
  return out;
}

function renderMath(s: string): string {
  let t = s;
  t = t.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, (_, a: string, b: string) => {
    const key = `${a.trim()}/${b.trim()}`;
    return VULGAR[key] ?? `${a.trim()}\u2044${b.trim()}`;
  });
  t = t.replace(/\\sqrt\{([^{}]+)\}/g, '√($1)');
  t = t.replace(/\\(pm|times|div|cdot|leq|le|geq|ge|neq|to|rightarrow|leftarrow|pi|alpha|beta|gamma|delta|infty|approx|equiv|sum|prod|sqrt|%|_|\{|\})/g, (m) => CMD[m] ?? m);
  t = t.replace(/(\d+)\s*\/\s*(\d+)/g, (_, a: string, b: string) => VULGAR[`${a}/${b}`] ?? `${a}\u2044${b}`);
  t = t.replace(/([A-Za-z0-9)\\\]}])\^(\{([^{}]+)\}|[A-Za-z0-9+\-()]+)/g, (m, base: string, grp: string, inner?: string) => {
    const body = inner ?? grp;
    const mapped = mapChars(body, SUP);
    return mapped ? base + mapped : m;
  });
  t = t.replace(/([A-Za-z0-9)\\\]}])_(\{([^{}]+)\}|[A-Za-z0-9+\-()]+)/g, (m, base: string, grp: string, inner?: string) => {
    const body = inner ?? grp;
    const mapped = mapChars(body, SUB);
    return mapped ? base + mapped : m;
  });
  return t;
}

type Seg = { k: 'n' | 'b' | 'code' | 'm'; s: string };

function inline(s: string): Seg[] {
  const out: Seg[] = [];
  // code-спаны вырезаем первыми, внутри них ничего не трогаем
  const parts = s.split(/(`[^`]+`)/g);
  for (const part of parts) {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      out.push({ k: 'code', s: part.slice(1, -1) });
      continue;
    }
    const subs = part.split(/(\*\*[^*]+\*\*|\$[^$]+\$)/g);
    for (const sub of subs) {
      if (sub.startsWith('**') && sub.endsWith('**') && sub.length > 4) {
        out.push({ k: 'b', s: renderMath(sub.slice(2, -2)) });
      } else if (sub.startsWith('$') && sub.endsWith('$') && sub.length > 2) {
        out.push({ k: 'm', s: renderMath(sub.slice(1, -1)) });
      } else if (sub) {
        out.push({ k: 'n', s: renderMath(sub) });
      }
    }
  }
  return out.filter((x) => x.s);
}

export function RichText({ text, color = '#C6CFDD', size = 13.5 }: { text: string; color?: string; size?: number }) {
  const lines = text.split('\n');
  return (
    <Text style={{ fontSize: size, lineHeight: size + 7, color }}>
      {lines.map((ln, li) => {
        const line = ln.trimEnd();
        const head = line.match(/^#{1,3}\s+(.*)$/);
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
        const num = line.match(/^\s*(\d+[.)])\s+(.*)$/);
        const body = head ? head[1] : bullet ? bullet[1] : num ? num[2] : line;
        const prefix = head ? '' : bullet ? '•  ' : num ? `${num[1]} ` : '';
        const segs = inline(body);
        return (
          <Text key={li}>
            {head ? (
              <Text style={{ fontWeight: '800', fontSize: size + 1.5, color: '#F2F5F9' }}>
                {segs.map((g, gi) => (
                  <SegView key={gi} seg={g} color={color} size={size} />
                ))}
              </Text>
            ) : (
              <>
                {prefix ? <Text style={{ color: '#4F7CFF', fontWeight: '700' }}>{prefix}</Text> : null}
                {segs.map((g, gi) => (
                  <SegView key={gi} seg={g} color={color} size={size} />
                ))}
              </>
            )}
            {li < lines.length - 1 ? '\n' : ''}
          </Text>
        );
      })}
    </Text>
  );
}

function SegView({ seg, color, size }: { seg: Seg; color: string; size: number }) {
  if (seg.k === 'b') return <Text style={{ fontWeight: '800', color: '#F2F5F9' }}>{seg.s}</Text>;
  if (seg.k === 'code') {
    return (
      <Text style={{ fontFamily: 'monospace', backgroundColor: '#22304A', color: '#B9C9EE' }}>
        {' '}{seg.s}{' '}
      </Text>
    );
  }
  if (seg.k === 'm') return <Text style={{ color: '#7DD3FC' }}>{seg.s}</Text>;
  return <Text style={{ color }}>{seg.s}</Text>;
}
