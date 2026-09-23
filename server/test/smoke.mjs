// Smoke test for apo-server: drives the REAL server code against stub
// HTTP providers (no real keys, no mocks in prod code paths).
// Run: node test/stub-llm.mjs &  +  APO_TEST=1 node test/smoke.mjs
import { spawn } from 'node:child_process';
import { deflateRawSync } from 'node:zlib';
import { startStub, stubHits } from './stub-llm.mjs';

const fails = [];
function eq(name, got, want) {
  if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  else console.log(`ok ${name}`);
}

async function post(base, path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

function crc32tab() {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
}
const CRC_T = crc32tab();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_T[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Minimal zip with word/document.xml. Stored or deflated (Word uses deflate).
function buildDocx(paragraphs, deflated = false) {
  const docXml = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
    paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`).join('') +
    `</w:body></w:document>`;
  const ctype = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const files = [
    { name: '[Content_Types].xml', data: Buffer.from(ctype, 'utf8') },
    { name: 'word/document.xml', data: Buffer.from(docXml, 'utf8') },
  ];
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const crc = crc32(f.data);
    const payload = deflated ? deflateRawSync(f.data) : f.data;
    const method = deflated ? 8 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, payload);
    const ce = Buffer.alloc(46);
    ce.writeUInt32LE(0x02014b50, 0);
    ce.writeUInt16LE(20, 6);
    ce.writeUInt16LE(method, 10);
    ce.writeUInt32LE(crc, 16);
    ce.writeUInt32LE(payload.length, 20);
    ce.writeUInt32LE(f.data.length, 24);
    ce.writeUInt16LE(nameBuf.length, 28);
    ce.writeUInt32LE(offset, 42);
    central.push(ce, nameBuf);
    offset += 30 + nameBuf.length + payload.length;
  }
  const cdStart = offset;
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(cdStart, 16);
  return Buffer.concat([...chunks, cd, end]);
}

// Minimal one-page PDF with ASCII text lines (correct xref offsets).
function buildPdf(lines) {
  const enc = (s) => Buffer.from(s, 'latin1');
  const content = lines.map((l, i) => `BT /F1 12 Tf 20 ${120 - i * 20} Td (${l}) Tj ET`).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 160] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const parts = [enc('%PDF-1.4\n')];
  const offsets = [0];
  objs.forEach((body, i) => {
    offsets.push(parts.reduce((a, b) => a + b.length, 0));
    parts.push(enc(`${i + 1} 0 obj\n${body}\nendobj\n`));
  });
  const xrefAt = parts.reduce((a, b) => a + b.length, 0);
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  parts.push(enc(xref + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`));
  return Buffer.concat(parts);
}

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function main() {
  const stub = await startStub(8899);
  const srv = spawn('node', ['dist/server.js'], {
    env: {
      ...process.env,
      PORT: '8898',
      APO_DB_PATH: ':memory:',
      DEEPSEEK_API_KEY: 'test',
      DEEPSEEK_BASE_URL: 'http://localhost:8899',
      TYPESAFE_API_KEY: 'test',
      JEV_BASE_URL: 'http://localhost:8899',
      APO_FREE_DAILY: '2',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((r) => setTimeout(r, 800));
  const base = 'http://localhost:8898';
  try {
    const health = await (await fetch(`${base}/health`)).json();
    eq('health providers', health.providers, { deepseek: true, jev: true, google: false, play: false });

    const st = await post(base, '/v1/structure', { deviceId: 'smoke-1', text: 'Столица Франции? Берлин Париж Рим' });
    eq('structure status', st.status, 200);
    eq('structure options', st.data.options, ['Берлин', 'Париж', 'Рим']);

    const s1 = await post(base, '/v1/solve', {
      deviceId: 'smoke-1', stem: 'Столица Франции?', options: ['Берлин', 'Париж', 'Рим'],
    });
    eq('solve status', s1.status, 200);
    eq('solve choice', s1.data.choiceIndex, 1);
    eq('solve lowAccuracy (0.7<0.75)', s1.data.lowAccuracy, true);
    eq('gate triggers model fallback', s1.data.provider, 'jev+fallback');
    eq('quota after 1st', s1.data.quotaLeft, 1);
    const jevAfterFirst = stubHits.jev;

    const s2 = await post(base, '/v1/solve', {
      deviceId: 'smoke-1', stem: 'Столица Франции?', options: ['Берлин', 'Париж', 'Рим'],
    });
    eq('repeat cached', s2.data.cached, true);
    eq('no extra jev call', stubHits.jev, jevAfterFirst);
    eq('quota untouched by cache', s2.data.quotaLeft, 1);

    const ex1 = await post(base, '/v1/explain', { deviceId: 'smoke-1', stem: 'Столица Франции?', answer: 'Париж' });
    eq('explain status', ex1.status, 200);
    eq('explain cached first', ex1.data.cached, false);
    const ex2 = await post(base, '/v1/explain', { deviceId: 'smoke-1', stem: 'Столица Франции?', answer: 'Париж' });
    eq('explain cached second', ex2.data.cached, true);

    const open = await post(base, '/v1/solve', { deviceId: 'smoke-1', stem: 'Расскажи всё', options: [] });
    eq('open question honest', [open.status, open.data.error], [422, 'open-question']);

    // Quota: burn the 2nd free solve with a fresh question, 3rd must 402.
    await post(base, '/v1/solve', { deviceId: 'smoke-1', stem: 'Q2?', options: ['A1', 'B2'] });
    const over = await post(base, '/v1/solve', { deviceId: 'smoke-1', stem: 'Q3?', options: ['A1', 'B2'] });
    eq('quota exceeded honest', [over.status, over.data.error], [402, 'quota-exceeded']);

    const q = await (await fetch(`${base}/v1/quota?deviceId=smoke-1`)).json();
    eq('quota view', [q.remaining, q.pro], [0, false]);

    const pd = async (filename, b64) =>
      post(base, '/v1/parse-document', { deviceId: 'smoke-doc', filename, dataBase64: b64 });

    const txt = await pd('notes.txt', Buffer.from('1. Capital of France?\nA. Berlin\nB. Paris\nC. Rome\n', 'utf8').toString('base64'));
    eq('doc txt status', txt.status, 200);
    eq('doc txt options', txt.data.questions[0].options, ['Berlin', 'Paris', 'Rome']);

    const docx = await pd('test.docx', buildDocx(['2. Two plus two?', 'A. Three', 'B. Four']).toString('base64'));
    eq('doc docx status', docx.status, 200);
    eq('doc docx stem has question', /Two plus two/.test(docx.data.questions[0].stem), true);
    eq('doc docx options', docx.data.questions[0].options, ['Three', 'Four']);

    const docxd = await pd('test-deflate.docx', buildDocx(['3. Three plus three?', 'A. Five', 'B. Six'], true).toString('base64'));
    eq('doc docx-deflate status', docxd.status, 200);
    eq('doc docx-deflate options', docxd.data.questions[0].options, ['Five', 'Six']);

    const pdf = await pd('test.pdf', buildPdf(['1. Capital?', 'A. Berlin', 'B. Paris']).toString('base64'));
    eq('doc pdf status', pdf.status, 200);
    eq('doc pdf text layer', /Capital/.test(pdf.data.text) && /Berlin/.test(pdf.data.text), true);
    eq('doc pdf options', pdf.data.questions[0].options.length >= 2, true);

    const img = await pd('photo.jpg', PNG_1PX);
    eq('doc image status', img.status, 200);
    eq('doc image vision ocr', img.data.questions[0].options, ['Берлин', 'Париж', 'Рим']);

    const empty = await pd('empty.txt', '');
    eq('doc empty honest', [empty.status, empty.data.questions.length, empty.data.warnings.length > 0], [200, 0, true]);

    const jevBefore = stubHits.jev;
    const fail1 = await post(base, '/v1/solve', { deviceId: 'smoke-fail', stem: 'FAIL-ONCE?', options: ['A1', 'B2'] });
    eq('failure not cached (502)', [fail1.status, fail1.data.error], [502, 'bad-provider-response']);
    const fail2 = await post(base, '/v1/solve', { deviceId: 'smoke-fail', stem: 'FAIL-ONCE?', options: ['A1', 'B2'] });
    eq('retry goes live and succeeds', [fail2.status, fail2.data.choiceIndex >= 0], [200, true]);
    eq('retry hit provider again', stubHits.jev - jevBefore, 2);
    const qf = await (await fetch(`${base}/v1/quota?deviceId=smoke-fail`)).json();
    eq('failure burned nothing, success burned one', qf.remaining, 1);
  } finally {
    srv.kill();
    stub.close();
  }
  if (fails.length) { console.error('FAIL\n' + fails.join('\n')); process.exit(1); }
  console.log('SMOKE-SERVER-OK');
  process.exit(0);
}

main().catch((e) => { console.error('ERROR', e); process.exit(1); });
