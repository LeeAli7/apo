// apo-server env — every secret from process.env (or server/.env file).
// Empty string = provider off; the API reports it honestly via /health
// and 503s instead of inventing answers.

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ServerEnv {
  port: number;
  dbPath: string;
  deepseekApiKey: string;
  deepseekBaseUrl: string;
  deepseekModel: string;
  deepseekVisionModel: string;
  jevApiKey: string;
  jevBaseUrl: string;
  jevModel: string;
  googleClientId: string;
  playPackage: string;
  googleServiceAccountJson: string;
  freeDaily: number;
}

export interface ProviderStatus {
  deepseek: boolean;
  jev: boolean;
  google: boolean;
  play: boolean;
}

/** Minimal KEY=VALUE loader for server/.env (gitignored). process.env wins. */
export function loadDotEnv(): void {
  const p = path.join(__dirname, '..', '.env');
  let raw: string;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
}

function num(v: string | undefined, dflt: number): number {
  const n = parseInt(v ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

export function loadEnv(): ServerEnv {
  return {
    port: num(process.env.PORT, 8080),
    dbPath: process.env.APO_DB_PATH ?? './apo.db',
    deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? '',
    deepseekBaseUrl: (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/+$/, ''),
    deepseekModel: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
    deepseekVisionModel: process.env.DEEPSEEK_VISION_MODEL ?? 'deepseek-flash',
    jevApiKey: process.env.TYPESAFE_API_KEY ?? '',
    jevBaseUrl: (process.env.JEV_BASE_URL ?? 'https://api.typesafe.ai').replace(/\/+$/, ''),
    jevModel: process.env.JEV_MODEL ?? 'jev-1.13.0',
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
    playPackage: process.env.PLAY_PACKAGE ?? 'com.apo.app',
    googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? '',
    freeDaily: num(process.env.APO_FREE_DAILY, 20),
  };
}

export function providerStatus(env: ServerEnv): ProviderStatus {
  return {
    deepseek: env.deepseekApiKey.length > 0,
    jev: env.jevApiKey.length > 0,
    google: env.googleClientId.length > 0,
    play: env.googleServiceAccountJson.length > 0,
  };
}
