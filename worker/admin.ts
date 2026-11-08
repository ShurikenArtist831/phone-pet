import { createInvite } from './invites';
import { error, hashToken, json, newToken, readBody, tokenPattern } from './shared';

export interface AdminEnv {
  DB: D1Database;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD_HASH?: string;
}

const cookieName = '__Host-huhu-admin';
const sessionSeconds = 7 * 24 * 60 * 60;
const loginWindowMs = 15 * 60 * 1000;
const loginError = '账号或密码错误';
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const passwordHashPattern = /^pbkdf2-sha256\$100000\$([a-f0-9]{32})\$([a-f0-9]{64})$/;
const encoder = new TextEncoder();

function cookie(token: string, maxAge: number): string {
  return `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

async function sessionHash(request: Request): Promise<string | null> {
  const entry = request.headers.get('Cookie')?.split(';')
    .map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`));
  const token = entry?.slice(cookieName.length + 1);
  return token && tokenPattern.test(token) ? hashToken(token) : null;
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

async function verifyCredentials(
  username: string,
  password: Uint8Array,
  configuredUsername: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveBits']);
  const [derived, submittedUser, expectedUser] = await Promise.all([
    crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(salt), iterations: 100_000 },
      key, 256,
    ),
    hashToken(username),
    hashToken(configuredUsername),
  ]);
  const passwordMatches = crypto.subtle.timingSafeEqual(derived, fromHex(expectedHash));
  const usernameMatches = crypto.subtle.timingSafeEqual(fromHex(submittedUser), fromHex(expectedUser));
  return passwordMatches && usernameMatches;
}

function countAttempt(db: D1Database, scope: string, start: number, limit: number) {
  return db.prepare(`
    INSERT INTO admin_login_attempts (scope, window_start, attempts) VALUES (?, ?, 1)
    ON CONFLICT(scope) DO UPDATE SET
      attempts = CASE WHEN window_start < excluded.window_start THEN 1 ELSE attempts + 1 END,
      window_start = excluded.window_start
    WHERE window_start < excluded.window_start
      OR (window_start = excluded.window_start AND attempts < ?)
  `).bind(scope, start, limit);
}

async function login(request: Request, env: AdminEnv): Promise<Response> {
  const { DB: db, ADMIN_USERNAME: configuredUsername, ADMIN_PASSWORD_HASH: configuredHash } = env;
  const hash = passwordHashPattern.exec(configuredHash?.trim() ?? '');
  if (!configuredUsername?.trim() || !hash) return error(503, '管理员登录尚未配置');

  const now = Date.now();
  const start = Math.floor(now / loginWindowMs) * loginWindowMs;
  const ip = await hashToken(request.headers.get('CF-Connecting-IP') ?? 'unknown');
  const [, perIp] = await db.batch([
    db.prepare('DELETE FROM admin_login_attempts WHERE window_start < ?').bind(start),
    countAttempt(db, `ip:${ip}`, start, 5),
  ]);
  if (!perIp.meta.changes || !(await countAttempt(db, 'global', start, 40).run()).meta.changes) {
    return json({ error: loginError }, 429, {
      'Retry-After': String(Math.ceil((start + loginWindowMs - now) / 1000)),
    });
  }

  const { username, password } = await readBody(request);
  if (typeof username !== 'string' || !username.trim() || username.length > 128 ||
      typeof password !== 'string' || !password || password.length > 512) {
    return error(401, loginError);
  }

  const passwordBytes = encoder.encode(password);
  if (passwordBytes.length > 512 ||
      !await verifyCredentials(username.trim(), passwordBytes, configuredUsername.trim(), hash[1], hash[2])) {
    return error(401, loginError);
  }

  const token = newToken();
  const expiresAt = new Date(Date.now() + sessionSeconds * 1000).toISOString();
  await db.batch([
    db.prepare(`
      UPDATE admin_sessions SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE token_hash = ? AND revoked_at IS NULL
    `).bind(await sessionHash(request)),
    db.prepare('INSERT INTO admin_sessions (id, token_hash, expires_at) VALUES (?, ?, ?)')
      .bind(crypto.randomUUID(), await hashToken(token), expiresAt),
  ]);
  return json({ authenticated: true }, 200, { 'Set-Cookie': cookie(token, sessionSeconds) });
}

async function listPairings(db: D1Database): Promise<Response> {
  const [devices, pets] = await db.batch([
    db.prepare(`
      SELECT d.id, d.pet_id AS petId, p.name AS petName, d.role,
        d.display_name AS displayName, d.created_at AS createdAt, d.revoked_at AS revokedAt
      FROM devices d JOIN pets p ON p.id = d.pet_id
      ORDER BY d.created_at DESC, d.id
    `),
    db.prepare('SELECT id, name, created_at AS createdAt FROM pets ORDER BY created_at DESC, id'),
  ]);
  return json({ devices: devices.results, pets: pets.results });
}

async function editPairing(db: D1Database, deviceId: string, displayName: unknown): Promise<Response> {
  if (typeof displayName !== 'string' || displayName.length > 120 ||
      [...displayName.trim()].length > 60 || /[\p{Cc}\p{Bidi_Control}\p{Zl}\p{Zp}]/u.test(displayName)) {
    return error(400, '备注最多 60 个字符，且只能填写单行文字');
  }
  const result = await db.prepare("UPDATE devices SET display_name = ? WHERE id = ? AND role = 'viewer'")
    .bind(displayName.trim() || null, deviceId).run();
  return result.meta.changes ? json({ ok: true }) : pairingUnavailable(db, deviceId);
}

async function pairingUnavailable(db: D1Database, deviceId: string): Promise<Response> {
  const device = await db.prepare('SELECT role FROM devices WHERE id = ?').bind(deviceId).first<{ role: string }>();
  if (!device) return error(404, '找不到这台设备');
  if (device.role !== 'viewer') return error(403, '只能管理展示设备');
  return json({ ok: true });
}

async function revokePairing(db: D1Database, deviceId: string): Promise<Response> {
  const [, updated] = await db.batch([
    // Previously issued links must not reclaim the slot after a device is revoked.
    db.prepare(`
      UPDATE invites SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE used_at IS NULL AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        AND pet_id = (SELECT pet_id FROM devices WHERE id = ? AND role = 'viewer' AND revoked_at IS NULL)
    `).bind(deviceId),
    db.prepare(`
      UPDATE devices SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND role = 'viewer' AND revoked_at IS NULL
    `).bind(deviceId),
  ]);
  return updated.meta.changes ? json({ ok: true }) : pairingUnavailable(db, deviceId);
}

async function listWidgetTokens(db: D1Database): Promise<Response> {
  const result = await db.prepare(`
    SELECT w.id, w.pet_id AS petId, p.name AS petName,
      w.viewer_device_id AS viewerDeviceId, d.display_name AS viewerName,
      w.created_at AS createdAt, w.revoked_at AS revokedAt
    FROM widget_tokens w
    JOIN pets p ON p.id = w.pet_id
    JOIN devices d ON d.id = w.viewer_device_id
    ORDER BY w.created_at DESC, w.id
  `).all();
  return json({ widgets: result.results });
}

async function createWidgetToken(db: D1Database, petId: string): Promise<Response> {
  if (!uuid.test(petId)) return error(400, '请选择有效的宠物');
  const petExists = await db.prepare('SELECT id FROM pets WHERE id = ?').bind(petId).first();
  if (!petExists) return error(404, '找不到这只宠物');

  const id = crypto.randomUUID();
  const token = newToken();
  const [, selected] = await db.batch([
    db.prepare(`
      INSERT INTO widget_tokens (id, pet_id, viewer_device_id, token_hash)
      SELECT ?, d.pet_id, d.id, ? FROM devices d
      WHERE d.pet_id = ? AND d.role = 'viewer' AND d.revoked_at IS NULL
    `).bind(id, await hashToken(token), petId),
    db.prepare(`
      SELECT w.id, w.pet_id AS petId, p.name AS petName, w.created_at AS createdAt
      FROM widget_tokens w JOIN pets p ON p.id = w.pet_id WHERE w.id = ?
    `).bind(id),
  ]);
  const widget = selected.results[0] as {
    id: string; petId: string; petName: string; createdAt: string;
  } | undefined;
  if (!widget) return error(409, '请先为这只宠物配对展示设备');
  return json({ widget: { ...widget, token } }, 201);
}

async function revokeWidgetToken(db: D1Database, id: string): Promise<Response> {
  if (!uuid.test(id)) return error(400, '请选择有效的小组件凭证');
  const result = await db.prepare(`
    UPDATE widget_tokens SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ? AND revoked_at IS NULL
  `).bind(id).run();
  if (result.meta.changes) return json({ ok: true });
  const existing = await db.prepare('SELECT id FROM widget_tokens WHERE id = ?').bind(id).first();
  return existing ? json({ ok: true }) : error(404, '找不到这个小组件凭证');
}

export async function adminApi(request: Request, env: AdminEnv, path: string): Promise<Response> {
  const { method } = request;
  const db = env.DB;
  if (method !== 'GET' && request.headers.get('Origin') !== new URL(request.url).origin) {
    return error(403, '请求来源不受信任');
  }
  if (path === '/api/admin/login' && method === 'POST') return login(request, env);

  const hash = await sessionHash(request);
  const session = hash && await db.prepare(`
    SELECT id FROM admin_sessions
    WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `).bind(hash).first<{ id: string }>();
  const logout = path === '/api/admin/logout' && method === 'POST';
  if (!session) {
    const headers = logout ? { 'Set-Cookie': cookie('', 0) } : undefined;
    return json({ error: '请先登录管理员后台' }, 401, headers);
  }

  if (logout) {
    await db.prepare(`
      UPDATE admin_sessions SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?
    `).bind(session.id).run();
    return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
  }
  if (path === '/api/admin/session' && method === 'GET') return json({ authenticated: true });
  if (path === '/api/admin/pairings' && method === 'GET') return listPairings(db);
  if (path === '/api/admin/widgets' && method === 'GET') return listWidgetTokens(db);
  if (path === '/api/admin/widgets' && method === 'POST') {
    const { petId } = await readBody(request);
    if (typeof petId !== 'string') return error(400, '请选择有效的宠物');
    return createWidgetToken(db, petId);
  }
  const widgetPath = /^\/api\/admin\/widgets\/([^/]+)$/.exec(path);
  if (widgetPath && method === 'DELETE') return revokeWidgetToken(db, widgetPath[1]);
  if (path === '/api/admin/pairings/invites' && method === 'POST') {
    const { petId } = await readBody(request);
    if (typeof petId !== 'string' || !uuid.test(petId)) return error(400, '请选择有效的宠物');
    const pet = await db.prepare('SELECT id FROM pets WHERE id = ?').bind(petId).first();
    return pet ? createInvite(db, petId) : error(404, '找不到这只宠物');
  }
  if (path === '/api/admin/pairings' && (method === 'PATCH' || method === 'DELETE')) {
    const { deviceId, displayName } = await readBody(request);
    if (typeof deviceId !== 'string' || !uuid.test(deviceId)) return error(400, '请选择有效的设备');
    return method === 'PATCH' ? editPairing(db, deviceId, displayName) : revokePairing(db, deviceId);
  }
  return error(404, '接口不存在');
}
