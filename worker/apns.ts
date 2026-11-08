import type { PetSnapshot } from '../src/app/pet-state';

export type ApnsEnvironment = 'sandbox' | 'production';

export interface ApnsEnv {
  APNS_KEY_ID?: string;
  APNS_TEAM_ID?: string;
  APNS_PRIVATE_KEY?: string;
  APNS_BUNDLE_ID?: string;
}

export interface LiveActivityContentState extends Pick<PetSnapshot, 'state' | 'version'> {
  petId: string;
}

const origins: Record<ApnsEnvironment, string> = {
  sandbox: 'https://api.sandbox.push.apple.com',
  production: 'https://api.push.apple.com',
};
const encoder = new TextEncoder();
const knownReasons = new Set([
  'BadDeviceToken', 'DeviceTokenNotForTopic', 'ExpiredToken', 'Unregistered',
  'BadEnvironmentKeyIdInToken', 'BadTopic', 'TopicDisallowed', 'InvalidProviderToken',
  'ExpiredProviderToken', 'Forbidden', 'TooManyProviderTokenUpdates', 'TooManyRequests',
  'InternalServerError', 'ServiceUnavailable', 'Shutdown',
]);

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signJwt(keyId: string, teamId: string, pem: string, issuedAt: number): Promise<string> {
  const pkcs8 = pem.replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const key = await crypto.subtle.importKey(
    'pkcs8', Uint8Array.from(atob(pkcs8), (char) => char.charCodeAt(0)),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'ES256', kid: keyId })));
  const claims = base64Url(encoder.encode(JSON.stringify({ iss: teamId, iat: issuedAt })));
  const input = `${header}.${claims}`;
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(input));
  return `${input}.${base64Url(new Uint8Array(signature))}`;
}

class ApnsService {
  private jwt?: { issuedAt: number; value: Promise<string> };

  constructor(private readonly config: Required<ApnsEnv>) {}

  private providerToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (!this.jwt || now - this.jwt.issuedAt >= 45 * 60) {
      const { APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY } = this.config;
      const value = signJwt(APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY, now).catch(() => {
        this.jwt = undefined;
        throw new Error('APNs provider token could not be signed');
      });
      this.jwt = { issuedAt: now, value };
    }
    return this.jwt.value;
  }

  async update(environment: ApnsEnvironment, token: string, timestamp: number, state: LiveActivityContentState) {
    const jwt = await this.providerToken();
    const response = await fetch(`${origins[environment]}/3/device/${token}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${jwt}`,
        'apns-push-type': 'liveactivity',
        'apns-topic': `${this.config.APNS_BUNDLE_ID}.push-type.liveactivity`,
        'apns-priority': '10',
        'apns-expiration': '0',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ aps: { timestamp, event: 'update', 'content-state': state } }),
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      await response.body?.cancel();
      return { ok: true } as const;
    }

    const body = await response.json().catch(() => null) as { reason?: unknown } | null;
    const reason = typeof body?.reason === 'string' && knownReasons.has(body.reason)
      ? body.reason : 'Unknown';
    return {
      ok: false,
      status: response.status,
      reason,
      invalidToken: response.status === 410 || (response.status === 400 && reason === 'BadDeviceToken'),
    } as const;
  }
}

let cached: { config: Required<ApnsEnv>; service: ApnsService } | undefined;

export function getApnsService({ APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY, APNS_BUNDLE_ID }: ApnsEnv) {
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY || !APNS_BUNDLE_ID) return null;
  const config = { APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY, APNS_BUNDLE_ID };
  if (!cached || Object.entries(config).some(([key, value]) => cached?.config[key as keyof ApnsEnv] !== value)) {
    cached = { config, service: new ApnsService(config) };
  }
  return cached.service;
}
