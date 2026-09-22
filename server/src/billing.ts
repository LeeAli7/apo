// apo-server billing — Play purchase verify via androidpublisher API.
// Service-account JWT (RS256) -> access token -> subscription get.
// Without GOOGLE_SERVICE_ACCOUNT_JSON: honest 503, never "assume paid".

import { createSign } from 'node:crypto';
import type { ServerEnv } from './env';
import { ProviderError } from './providers';

interface ServiceAccount {
  client_email?: string;
  private_key?: string;
}

function base64url(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function serviceAccessToken(sa: ServiceAccount): Promise<string> {
  if (!sa.client_email || !sa.private_key) {
    throw new ProviderError('billing-not-configured', 'Service account is missing client_email/private_key', 503);
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const signature = signer
    .sign(sa.private_key.replace(/\\n/g, '\n'), 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${claim}.${signature}`,
  });
  if (!res.ok) throw new ProviderError('billing-auth-failed', 'Google OAuth for Play API failed');
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new ProviderError('billing-auth-failed', 'Google OAuth returned no token');
  return data.access_token;
}

interface SubPurchase {
  expiryTimeMillis?: string;
  paymentState?: number;
  acknowledgementState?: number;
}

/** True when the subscription purchase is currently entitled. */
export async function verifyPlayPurchase(
  env: ServerEnv,
  purchaseToken: string,
  productId: string,
): Promise<boolean> {
  if (!env.googleServiceAccountJson) {
    throw new ProviderError('billing-not-configured', 'GOOGLE_SERVICE_ACCOUNT_JSON is not set', 503);
  }
  let sa: ServiceAccount;
  try {
    sa = JSON.parse(env.googleServiceAccountJson) as ServiceAccount;
  } catch {
    throw new ProviderError('billing-not-configured', 'GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON', 503);
  }
  const access = await serviceAccessToken(sa);
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(env.playPackage)}/purchases/subscriptions/` +
    `${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
  } catch {
    throw new ProviderError('provider-unreachable', 'Play Developer API unreachable');
  }
  if (res.status === 404 || res.status === 400) return false;
  if (!res.ok) throw new ProviderError('billing-check-failed', `Play API HTTP ${res.status}`);
  const data = (await res.json()) as SubPurchase;
  const expiry = parseInt(data.expiryTimeMillis ?? '0', 10);
  return Number.isFinite(expiry) && expiry > Date.now();
}
