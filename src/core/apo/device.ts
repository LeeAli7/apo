// apo/device — stable anonymous device id (quota identity without account).

import { storeGet, storeSet } from './store';

const DEVICE_KEY = 'apo_device_v1';

function randomHex(n: number): string {
  const chars = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * 16)];
  return s;
}

/** Anonymous device id, generated once and stored locally. Not a secret. */
export async function getDeviceId(): Promise<string> {
  const cur = await storeGet(DEVICE_KEY);
  if (cur) return cur;
  const id = `dev-${randomHex(16)}`;
  await storeSet(DEVICE_KEY, id);
  return id;
}
