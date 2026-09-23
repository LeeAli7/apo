// apo-server entry — plain node:http JSON API. See README.md for routes.

import * as http from 'node:http';
import { loadDotEnv, loadEnv, providerStatus } from './env';
import { ApoDb } from './db';
import { resolveIdentity, verifyGoogleIdToken } from './auth';
import { ProviderError } from './providers';
import { verifyPlayPurchase } from './billing';
import { solveQuestion, structureText, explainAnswer, parseDocument, today } from './pipeline';

const MAX_BODY = 20 * 1024 * 1024;

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(text);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new ProviderError('body-too-large', 'Request body exceeds 20 MB', 413));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => reject(new ProviderError('bad-request', 'Failed to read body', 400)));
  });
}

interface SolveBody {
  deviceId?: unknown;
  idToken?: unknown;
  stem?: unknown;
  options?: unknown;
}

export function createServer(): http.Server {
  loadDotEnv();
  const env = loadEnv();
  const db = new ApoDb(env.dbPath);

  const str = (v: unknown): string => (typeof v === 'string' ? v : '');

  return http.createServer((req, res) => {
    (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = url.pathname;

      if (req.method === 'GET' && path === '/health') {
        send(res, 200, { ok: true, providers: providerStatus(env), freeDaily: env.freeDaily });
        return;
      }

      if (req.method === 'GET' && path === '/v1/quota') {
        const ident = await resolveIdentity(
          url.searchParams.get('deviceId') ?? '',
          url.searchParams.get('idToken'),
          env.googleClientId,
        );
        const pro = db.isPro(ident.sub);
        // remaining -1 = unlimited (PRO). JSON has no Infinity.
        const remaining = pro ? -1 : Math.max(0, env.freeDaily - db.quotaUsed(ident.id, today()));
        send(res, 200, { remaining, pro, freeDaily: env.freeDaily });
        return;
      }

      if (req.method !== 'POST') {
        send(res, 404, { error: 'not-found' });
        return;
      }
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(await readBody(req)) as Record<string, unknown>;
      } catch (e) {
        const err = e instanceof ProviderError ? e : new ProviderError('bad-request', 'Invalid JSON body', 400);
        send(res, err.status, { error: err.code });
        return;
      }

      if (path === '/v1/structure') {
        const ident = await resolveIdentity(str(body.deviceId), str(body.idToken) || null, env.googleClientId);
        void ident;
        const out = await structureText(env, str(body.text));
        send(res, 200, out);
        return;
      }

      if (path === '/v1/solve') {
        const b = body as SolveBody;
        const ident = await resolveIdentity(str(b.deviceId), str(b.idToken) || null, env.googleClientId);
        const pro = db.isPro(ident.sub);
        const opts = Array.isArray(b.options) ? b.options.filter((o): o is string => typeof o === 'string') : [];
        const { out, quotaLeft } = await solveQuestion(env, db, ident.id, pro, str(b.stem), opts);
        send(res, 200, { ...out, quotaLeft });
        return;
      }

      if (path === '/v1/explain') {
        const ident = await resolveIdentity(str(body.deviceId), str(body.idToken) || null, env.googleClientId);
        void ident;
        const out = await explainAnswer(db, env, str(body.stem), str(body.answer));
        send(res, 200, out);
        return;
      }

      if (path === '/v1/parse-document') {
        const ident = await resolveIdentity(str(body.deviceId), str(body.idToken) || null, env.googleClientId);
        void ident;
        const out = await parseDocument(env, str(body.filename) || 'file.bin', str(body.dataBase64));
        send(res, 200, out);
        return;
      }

      if (path === '/v1/auth/google') {
        if (!env.googleClientId) {
          send(res, 503, { error: 'google-not-configured' });
          return;
        }
        const user = await verifyGoogleIdToken(str(body.idToken), env.googleClientId);
        if (!user) {
          send(res, 401, { error: 'invalid-token' });
          return;
        }
        send(res, 200, { sub: user.sub, email: user.email, pro: db.isPro(user.sub) });
        return;
      }

      if (path === '/v1/billing/verify') {
        if (!env.googleClientId) {
          send(res, 503, { error: 'google-not-configured' });
          return;
        }
        const user = await verifyGoogleIdToken(str(body.idToken), env.googleClientId);
        if (!user) {
          send(res, 401, { error: 'invalid-token' });
          return;
        }
        const ok = await verifyPlayPurchase(env, str(body.purchaseToken), str(body.productId));
        db.setPro(user.sub, user.email, ok);
        send(res, 200, { pro: ok });
        return;
      }

      send(res, 404, { error: 'not-found' });
    })().catch((e: unknown) => {
      if (e instanceof ProviderError) send(res, e.status, { error: e.code });
      else {
        console.error('unhandled', e);
        try {
          send(res, 500, { error: 'internal' });
        } catch {
          // headers already sent
        }
      }
    });
  });
}

if (require.main === module) {
  const env = loadEnv();
  const server = createServer();
  server.listen(env.port, () => {
    console.log(`apo-server on :${env.port} db=${env.dbPath}`);
  });
}
