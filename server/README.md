# Apo server

Zero-dependency Node backend (only `node:http`, `node:sqlite`, `node:crypto`,
global `fetch`). Source of truth for quota and PRO status; runs the paid
model calls so keys never ship inside the mobile app.

## Run

```bash
cd server
cp .env.example .env   # fill keys, .env is gitignored
npm run build          # tsc -> dist/ (typescript + @types/node from repo root)
npm start              # node dist/server.js, default :8080
```

Gate: `node ../node_modules/typescript/lib/tsc.js -p server/tsconfig.json`
(must exit 0; root app gate is separate: `tsc -p tsconfig.json`).

## Endpoints (JSON)

- `GET /health` — `{ok, providers:{deepseek,jev,google,play}}`, no auth.
- `POST /v1/structure {deviceId, idToken?, text}` — model splits raw text
  into `{stem, options[], open}`. 503 `no-provider-key` without DeepSeek key.
- `POST /v1/solve {deviceId, idToken?, stem, options[]}` — cache → decision
  engine → gate 0.75 → optional model fallback → burns 1 quota on a real
  (non-cached) solution. Honest codes: `open-question` (422),
  `no-provider-key` (503, quota untouched), `quota-exceeded` (402).
- `POST /v1/explain {deviceId, idToken?, stem, answer}` — cached explanation
  or model-generated. No quota burn.
- `GET /v1/quota?deviceId=&idToken=` — `{remaining, pro, freeDaily}`.
- `POST /v1/auth/google {idToken}` — verifies Google ID token.
- `POST /v1/billing/verify {idToken, purchaseToken, productId}` — Play
  server check, marks PRO. 503 `billing-not-configured` without a service
  account.

Identity = Google `sub` when a valid ID token is sent, otherwise
`dev:<deviceId>`. Anonymous quota exists so the app works before login;
PRO requires an account (purchases can't move without one).

## Smoke test (no real keys — stub providers, real pipeline)

```bash
node test/stub-llm.mjs &   # fake DeepSeek+Jev on :8899
APO_TEST=1 node test/smoke.mjs
```

The smoke drives the real server code against stub HTTP providers and
asserts: structure shape, solve choice + confidence + gate flag, cache hit
on repeat (no extra provider calls), quota decrement, and honest 503s
without keys.
