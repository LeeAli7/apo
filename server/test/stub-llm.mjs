// Test-only stub providers (DeepSeek-shape + Jev-shape) for the smoke test.
// NEVER used in prod code — server talks to them only via *_BASE_URL env.
import * as http from 'node:http';

export const stubHits = { deepseek: 0, jev: 0 };

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export function startStub(port) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        let body = {};
        try { body = JSON.parse(raw || '{}'); } catch { /* keep {} */ }
        if (req.url === '/chat/completions') {
          stubHits.deepseek += 1;
          const msgs = Array.isArray(body.messages) ? body.messages : [];
          const parts = msgs.flatMap((m) => (Array.isArray(m.content) ? m.content : []));
          if (parts.some((p) => p && p.type === 'image_url')) {
            send(res, 200, { choices: [{ message: { content: 'Столица Франции?\nA. Берлин\nB. Париж\nC. Рим' } }] });
            return;
          }
          const last = msgs.length > 0 ? String(msgs[msgs.length - 1].content ?? '') : '';
          const fmt = body.response_format && body.response_format.type === 'json_object';
          if (fmt && /JSON вида \{"index"/.test(String(msgs[0]?.content ?? ''))) {
            send(res, 200, { choices: [{ message: { content: '{"index": 1}' } }] });
            return;
          }
          if (fmt) {
            send(res, 200, {
              choices: [{
                message: {
                  content: JSON.stringify({
                    stem: 'Столица Франции?',
                    options: ['Берлин', 'Париж', 'Рим'],
                    open: false,
                  }),
                },
              }],
            });
            return;
          }
          send(res, 200, { choices: [{ message: { content: `Разбор stub: ${last.slice(0, 60)}` } }] });
          return;
        }
        if (req.url === '/v1/systemone') {
          stubHits.jev += 1;
          const questions = body.questions ?? {};
          const first = questions[Object.keys(questions)[0]] ?? {};
          const criteria = first.criteria ?? {};
          const keys = Object.keys(criteria);
          const probs = keys.map((_, i) => (i === 1 ? 0.7 : 0.15));
          send(res, 200, { answers: { answer: { choice: 'opt_1', probabilities: probs, confidence: 0.7 } } });
          return;
        }
        send(res, 404, { error: 'not-found' });
      });
    });
    srv.listen(port, () => resolve(srv));
  });
}

if (process.argv[1] && process.argv[1].endsWith('stub-llm.mjs')) {
  startStub(8899).then(() => console.log('stub on :8899'));
}
