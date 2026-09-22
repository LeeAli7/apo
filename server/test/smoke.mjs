// Smoke test for apo-server: drives the REAL server code against stub
// HTTP providers (no real keys, no mocks in prod code paths).
// Run: node test/stub-llm.mjs &  +  APO_TEST=1 node test/smoke.mjs
import { spawn } from 'node:child_process';
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
  } finally {
    srv.kill();
    stub.close();
  }
  if (fails.length) { console.error('FAIL\n' + fails.join('\n')); process.exit(1); }
  console.log('SMOKE-SERVER-OK');
  process.exit(0);
}

main().catch((e) => { console.error('ERROR', e); process.exit(1); });
