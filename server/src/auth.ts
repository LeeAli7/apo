// apo-server auth — Google ID-token verify (tokeninfo, no deps) + identity.
// Identity = 'sub:<google-sub>' with a valid token, else 'dev:<deviceId>'.

export interface VerifiedUser {
  sub: string;
  email: string | null;
}

const tokenCache = new Map<string, { exp: number; user: VerifiedUser }>();

interface TokenInfo {
  aud?: string;
  sub?: string;
  email?: string;
  exp?: string;
}

export async function verifyGoogleIdToken(idToken: string, clientId: string): Promise<VerifiedUser | null> {
  if (!idToken || !clientId) return null;
  const now = Math.floor(Date.now() / 1000);
  const hit = tokenCache.get(idToken);
  if (hit && hit.exp > now + 60) return hit.user;
  let info: TokenInfo;
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!res.ok) return null;
    info = (await res.json()) as TokenInfo;
  } catch {
    return null;
  }
  if (info.aud !== clientId || !info.sub) return null;
  const exp = parseInt(info.exp ?? '0', 10);
  if (!Number.isFinite(exp) || exp <= now) return null;
  const user: VerifiedUser = { sub: info.sub, email: info.email ?? null };
  tokenCache.set(idToken, { exp, user });
  if (tokenCache.size > 1000) tokenCache.clear();
  return user;
}

export interface Identity {
  /** 'sub:<google-sub>' or 'dev:<deviceId>' — the quota/PRO key. */
  id: string;
  sub: string | null;
  email: string | null;
}

export async function resolveIdentity(
  deviceId: string,
  idToken: string | null,
  clientId: string,
): Promise<Identity> {
  const cleanDevice = (deviceId ?? '').slice(0, 64) || 'unknown';
  if (idToken && clientId) {
    const user = await verifyGoogleIdToken(idToken, clientId);
    if (user) return { id: `sub:${user.sub}`, sub: user.sub, email: user.email };
  }
  return { id: `dev:${cleanDevice}`, sub: null, email: null };
}
