// apo/api — typed client for the Apo backend (server/).
// No secrets here: mobile app never holds provider keys.
// Server URL comes only from EXPO_PUBLIC_APO_API_URL (env, build time).
// Without it every call fails honestly with code 'no-server' — never a mock.

export const APO_API_URL = (process.env.EXPO_PUBLIC_APO_API_URL ?? '').replace(/\/+$/, '');

export function apiConfigured(): boolean {
  return APO_API_URL.length > 0;
}

export class ApoApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 0) {
    super(message);
    this.name = 'ApoApiError';
    this.code = code;
    this.status = status;
  }
}

interface ApiEnvelope {
  error?: string;
  [k: string]: unknown;
}

async function apiFetch<T>(path: string, body: unknown): Promise<T> {
  if (!apiConfigured()) throw new ApoApiError('no-server', 'Backend URL is not configured (EXPO_PUBLIC_APO_API_URL)');
  let res: Response;
  try {
    res = await fetch(`${APO_API_URL}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApoApiError('no-server', 'Backend is unreachable');
  }
  let data: ApiEnvelope;
  try {
    data = (await res.json()) as ApiEnvelope;
  } catch {
    throw new ApoApiError('bad-response', `Backend returned non-JSON (HTTP ${res.status})`, res.status);
  }
  if (!res.ok) throw new ApoApiError(typeof data.error === 'string' ? data.error : 'request-failed', `Backend error: ${data.error ?? res.status}`, res.status);
  return data as T;
}

export interface RemoteSolve {
  choiceIndex: number;
  probabilities: number[];
  confidence: number;
  lowAccuracy: boolean;
  provider: string;
  cached: boolean;
  ms: number;
}

export interface RemoteStructure {
  stem: string;
  options: string[];
  open: boolean;
}

export interface RemoteExplain {
  text: string;
  cached: boolean;
}

export interface RemoteQuota {
  remaining: number;
  pro: boolean;
  freeDaily: number;
}

export function solveRemote(deviceId: string, idToken: string | null, stem: string, options: string[]): Promise<RemoteSolve> {
  return apiFetch<RemoteSolve>('/v1/solve', { deviceId, idToken, stem, options });
}

export function structureRemote(deviceId: string, idToken: string | null, text: string): Promise<RemoteStructure> {
  return apiFetch<RemoteStructure>('/v1/structure', { deviceId, idToken, text });
}

export function explainRemote(deviceId: string, idToken: string | null, stem: string, answer: string): Promise<RemoteExplain> {
  return apiFetch<RemoteExplain>('/v1/explain', { deviceId, idToken, stem, answer });
}

export function quotaRemote(deviceId: string, idToken: string | null): Promise<RemoteQuota> {
  return apiFetch<RemoteQuota>('/v1/quota', { deviceId, idToken });
}
