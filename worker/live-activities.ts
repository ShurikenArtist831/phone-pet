import type { DeviceRole, PetSnapshot } from '../src/app/pet-state';
import { getApnsService } from './apns';
import type { ApnsEnv, ApnsEnvironment } from './apns';
import { error, hashToken, json, readBody } from './shared';

export interface LiveActivityEnv extends ApnsEnv {
  DB: D1Database;
  LIVE_ACTIVITY_TOKEN_KEY?: string;
}

export interface AuthenticatedDevice {
  id: string;
  pet_id: string;
  role: DeviceRole;
}

const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
const activityCutoff = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-8 hours')";
const activeViewer = "SELECT 1 FROM devices WHERE id = ? AND role = 'viewer' AND revoked_at IS NULL";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function tokenKey(secret: string | undefined): Promise<CryptoKey | null> {
  if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) return null;
  const bytes = Uint8Array.from(secret.match(/../g)!, (hex) => Number.parseInt(hex, 16));
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function encryptionParams(iv: Uint8Array<ArrayBuffer>, viewerId: string, activityId: string, environment: ApnsEnvironment) {
  return { name: 'AES-GCM', iv, additionalData: encoder.encode(JSON.stringify([viewerId, activityId, environment])) };
}

async function encryptToken(key: CryptoKey, token: string, viewerId: string, activityId: string, environment: ApnsEnvironment) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    encryptionParams(iv, viewerId, activityId, environment), key, encoder.encode(token),
  );
  return `v1.${btoa(String.fromCharCode(...iv, ...new Uint8Array(encrypted)))}`;
}

interface PushTarget extends Pick<PetSnapshot, 'state' | 'version'> {
  id: string;
  viewer_device_id: string;
  activity_id: string;
  push_token: string;
  environment: ApnsEnvironment;
  timestamp: number;
}

async function decryptToken(key: CryptoKey, target: PushTarget): Promise<string> {
  if (!target.push_token.startsWith('v1.')) throw new Error('Unsupported token storage format');
  const bytes = Uint8Array.from(atob(target.push_token.slice(3)), (char) => char.charCodeAt(0));
  const params = encryptionParams(bytes.slice(0, 12), target.viewer_device_id, target.activity_id, target.environment);
  return decoder.decode(await crypto.subtle.decrypt(params, key, bytes.slice(12)));
}

export async function liveActivityApi(request: Request, env: LiveActivityEnv, viewer: AuthenticatedDevice, action: 'register' | 'end') {
  if (viewer.role !== 'viewer') return error(403, '只有展示设备可以管理灵动岛活动');
  const body = await readBody(request);
  const { activityId, pushToken, environment } = body;
  if (typeof activityId !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(activityId) ||
      'petId' in body || 'deviceId' in body) {
    return error(400, '灵动岛活动参数不正确');
  }

  const db = env.DB;
  if (action === 'end') {
    const ended = await db.prepare(`
      UPDATE live_activities SET status = 'ended', push_token = NULL, token_hash = NULL,
        updated_at = ${now}, ended_at = COALESCE(ended_at, ${now})
      WHERE activity_id = ? AND viewer_device_id = ? AND EXISTS (${activeViewer})
    `).bind(activityId, viewer.id, viewer.id).run();
    return ended.meta.changes ? json({ ok: true }) : error(404, '找不到这项灵动岛活动');
  }

  if (typeof pushToken !== 'string' || !/^(?:[a-f0-9]{2}){1,512}$/i.test(pushToken) ||
      (environment !== 'sandbox' && environment !== 'production')) {
    return error(400, '灵动岛推送凭证或环境不正确');
  }
  const key = await tokenKey(env.LIVE_ACTIVITY_TOKEN_KEY);
  if (!key) return error(503, '灵动岛推送尚未配置');

  const token = pushToken.toLowerCase();
  const [encrypted, fingerprint] = await Promise.all([
    encryptToken(key, token, viewer.id, activityId, environment), hashToken(token),
  ]);
  // D1 executes the batch atomically. A rejected registration cannot retire the current activity.
  const [registered] = await db.batch([
    db.prepare(`
      INSERT INTO live_activities (id, pet_id, viewer_device_id, activity_id, push_token, token_hash, environment)
      SELECT ?, d.pet_id, d.id, ?, ?, ?, ? FROM devices d
      WHERE d.id = ? AND d.role = 'viewer' AND d.revoked_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM live_activities
          WHERE environment = ? AND token_hash = ? AND status = 'active' AND activity_id <> ?
        )
      ON CONFLICT(activity_id) DO UPDATE SET push_token = excluded.push_token,
        token_hash = excluded.token_hash, status = 'active', updated_at = ${now}, ended_at = NULL
      WHERE live_activities.viewer_device_id = excluded.viewer_device_id
        AND live_activities.pet_id = excluded.pet_id AND live_activities.environment = excluded.environment
        AND live_activities.status <> 'ended' AND live_activities.created_at > ${activityCutoff}
    `).bind(crypto.randomUUID(), activityId, encrypted, fingerprint, environment, viewer.id,
      environment, fingerprint, activityId),
    db.prepare(`
      UPDATE live_activities SET status = 'ended', push_token = NULL, token_hash = NULL,
        updated_at = ${now}, ended_at = COALESCE(ended_at, ${now})
      WHERE viewer_device_id = ? AND activity_id <> ?
        AND (status = 'active' OR (status = 'expired' AND created_at > ${activityCutoff}))
        AND EXISTS (SELECT 1 FROM live_activities WHERE activity_id = ? AND push_token = ?)
    `).bind(viewer.id, activityId, activityId, encrypted),
  ]);
  return registered.meta.changes ? json({ ok: true }) : error(409, '此活动无法注册，请重新启动灵动岛活动');
}

export async function pushLiveActivity(env: LiveActivityEnv, pet: PetSnapshot): Promise<void> {
  const apns = getApnsService(env);
  if (!apns || !env.LIVE_ACTIVITY_TOKEN_KEY) return;

  try {
    const [, targets] = await env.DB.batch<PushTarget>([
      env.DB.prepare(`
        UPDATE live_activities SET status = 'expired', push_token = NULL, token_hash = NULL,
          updated_at = ${now}, ended_at = ${now}
        WHERE pet_id = ? AND status = 'active' AND created_at <= ${activityCutoff}
      `).bind(pet.id),
      env.DB.prepare(`
        SELECT a.id, a.viewer_device_id, a.activity_id, a.push_token, a.environment,
          p.state, p.version, CAST(strftime('%s', p.updated_at) AS INTEGER) AS timestamp
        FROM live_activities a
        JOIN devices d ON d.id = a.viewer_device_id AND d.pet_id = a.pet_id
        JOIN pets p ON p.id = a.pet_id
        WHERE a.pet_id = ? AND a.status = 'active' AND d.role = 'viewer' AND d.revoked_at IS NULL
          AND p.version = ?
      `).bind(pet.id, pet.version),
    ]);
    if (!targets.results.length) return;
    const key = await tokenKey(env.LIVE_ACTIVITY_TOKEN_KEY);
    if (!key) {
      console.warn('Live Activity encryption key is invalid');
      return;
    }

    await Promise.all(targets.results.map(async (target) => {
      try {
        const token = await decryptToken(key, target);
        const result = await apns.update(target.environment, token, target.timestamp, {
          petId: pet.id, state: target.state, version: target.version,
        });
        if (result.ok) return;

        console.warn('Live Activity APNs update rejected', {
          environment: target.environment, status: result.status, reason: result.reason,
        });
        if (result.invalidToken) {
          // An in-flight failure for the previous token must not expire a newer registration.
          await env.DB.prepare(`
            UPDATE live_activities SET status = 'expired', push_token = NULL, token_hash = NULL,
              updated_at = ${now}, ended_at = ${now}
            WHERE id = ? AND status = 'active' AND push_token = ?
          `).bind(target.id, target.push_token).run();
        }
      } catch {
        // Fetch errors can contain the full request URL, which includes the push token.
        console.warn('Live Activity push attempt failed', { environment: target.environment });
      }
    }));
  } catch {
    console.warn('Live Activity push targets could not be loaded');
  }
}
