// apo/quota — server is the source of truth for quota and PRO status.
// AsyncStorage keeps only the last known status for offline display.

import { APO_KEYS, loadJson, saveJson, storeGet, storeSet } from './store';
import { apiConfigured, quotaRemote, ApoApiError } from './api';
import { getDeviceId } from './device';

export const APO_FREE_DAILY = 20;
export const APO_HISTORY_CAP = 200;

export interface QuotaState {
  date: string;
  used: number;
}

export interface HistoryEntry {
  ts: number;
  stem: string;
  choice: string;
  confidence: number;
  lowAccuracy: boolean;
}

export interface QuotaView {
  remaining: number;
  /** 'server' | 'offline-cache' — where the number came from. */
  source: 'server' | 'offline-cache';
  pro: boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Server sends remaining -1 for unlimited (PRO) — JSON has no Infinity. */
function toRemaining(q: { remaining: number; pro: boolean }): number {
  return q.pro || q.remaining < 0 ? Number.POSITIVE_INFINITY : q.remaining;
}

function usedOf(q: { remaining: number; pro: boolean; freeDaily: number }): number {
  if (q.pro || q.remaining < 0) return 0;
  return Math.max(0, q.freeDaily - q.remaining);
}

async function readLocalQuota(): Promise<QuotaState> {
  const t = today();
  const q = await loadJson<QuotaState>(APO_KEYS.quota, { date: t, used: 0 });
  return q.date === t ? q : { date: t, used: 0 };
}

/** PRO status: server verdict, locally cached for offline. */
export async function isPro(): Promise<boolean> {
  if (!apiConfigured()) return (await loadJson<boolean>(APO_KEYS.sub, false)) === true;
  try {
    const deviceId = await getDeviceId();
    const q = await quotaRemote(deviceId, null);
    await saveJson(APO_KEYS.sub, q.pro);
    return q.pro;
  } catch {
    return (await loadJson<boolean>(APO_KEYS.sub, false)) === true;
  }
}

/** Local cache write only — real PRO comes from server billing verify. */
export async function setPro(v: boolean): Promise<void> {
  await saveJson(APO_KEYS.sub, v);
}

export async function quotaRemaining(): Promise<number> {
  return (await quotaView()).remaining;
}

export async function quotaView(): Promise<QuotaView> {
  if (!apiConfigured()) {
    const q = await readLocalQuota();
    const pro = await isPro();
    return { remaining: pro ? Number.POSITIVE_INFINITY : Math.max(0, APO_FREE_DAILY - q.used), source: 'offline-cache', pro };
  }
  try {
    const deviceId = await getDeviceId();
    const q = await quotaRemote(deviceId, null);
    await saveJson(APO_KEYS.quota, { date: today(), used: usedOf(q) });
    await saveJson(APO_KEYS.sub, q.pro);
    return { remaining: toRemaining(q), source: 'server', pro: q.pro };
  } catch {
    const q = await readLocalQuota();
    const pro = (await loadJson<boolean>(APO_KEYS.sub, false)) === true;
    return { remaining: pro ? Number.POSITIVE_INFINITY : Math.max(0, APO_FREE_DAILY - q.used), source: 'offline-cache', pro };
  }
}

/**
 * Sync point after a solve: server already decremented on /v1/solve,
 * here we only refresh the offline cache. Offline (no server) we keep a
 * local ledger so the free counter still moves without backend.
 */
export async function consumeQuota(): Promise<boolean> {
  if (!apiConfigured()) {
    const cur = await readLocalQuota();
    if (cur.used >= APO_FREE_DAILY) return false;
    await saveJson(APO_KEYS.quota, { date: cur.date, used: cur.used + 1 });
    return true;
  }
  try {
    const deviceId = await getDeviceId();
    const q = await quotaRemote(deviceId, null);
    await saveJson(APO_KEYS.quota, { date: today(), used: usedOf(q) });
    return toRemaining(q) > 0;
  } catch (e) {
    if (e instanceof ApoApiError && e.code === 'quota-exceeded') return false;
    const cur = await readLocalQuota();
    if (cur.used >= APO_FREE_DAILY) return false;
    await saveJson(APO_KEYS.quota, { date: cur.date, used: cur.used + 1 });
    return true;
  }
}

export async function pushHistory(e: HistoryEntry): Promise<HistoryEntry[]> {
  const h = await loadJson<HistoryEntry[]>(APO_KEYS.history, []);
  h.unshift(e);
  const cut = h.slice(0, APO_HISTORY_CAP);
  await saveJson(APO_KEYS.history, cut);
  return cut;
}

export async function readHistory(): Promise<HistoryEntry[]> {
  return loadJson<HistoryEntry[]>(APO_KEYS.history, []);
}

export async function clearExplainCache(): Promise<void> {
  await saveJson(APO_KEYS.explainCache, {});
  try {
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    const keys = await AsyncStorage.getAllKeys();
    const legacy = keys.filter((k) => k.startsWith(`${APO_KEYS.explainCache}:`));
    if (legacy.length > 0) await AsyncStorage.multiRemove(legacy);
  } catch {
    // cache already cleared above
  }
}

export async function appVersion(): Promise<string> {
  return (await storeGet('apo_app_version')) ?? '1.0.0';
}

export async function setAppVersion(v: string): Promise<void> {
  await storeSet('apo_app_version', v);
}
