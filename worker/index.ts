import { isPetState } from '../src/app/pet-state';
import type { PetSnapshot } from '../src/app/pet-state';
import { adminApi } from './admin';
import type { AdminEnv } from './admin';
import { createInvite } from './invites';
import { liveActivityApi, pushLiveActivity } from './live-activities';
import type { AuthenticatedDevice, LiveActivityEnv } from './live-activities';
import { error, hashToken, json, newToken, readBody, tokenPattern } from './shared';

interface Env extends AdminEnv, LiveActivityEnv {
  ASSETS: Fetcher;
}

function findPet(db: D1Database, petId: string): Promise<PetSnapshot | null> {
  return db.prepare('SELECT id, name, state, version FROM pets WHERE id = ?')
    .bind(petId).first<PetSnapshot>();
}

async function createPet(db: D1Database): Promise<Response> {
  const pet = { id: crypto.randomUUID(), name: '乎乎', state: 'happy', version: 1 } satisfies PetSnapshot;
  const token = newToken();
  await db.batch([
    db.prepare('INSERT INTO pets (id, name, state) VALUES (?, ?, ?)')
      .bind(pet.id, pet.name, pet.state),
    db.prepare("INSERT INTO devices (id, pet_id, role, token_hash) VALUES (?, ?, 'controller', ?)")
      .bind(crypto.randomUUID(), pet.id, await hashToken(token)),
  ]);
  return json({ pet, device: { petId: pet.id, role: 'controller', token } }, 201);
}

async function claimInvite(db: D1Database, request: Request): Promise<Response> {
  const { token } = await readBody(request);
  if (typeof token !== 'string' || !tokenPattern.test(token)) {
    return error(400, '邀请链接格式不正确');
  }

  const inviteHash = await hashToken(token);
  const deviceId = crypto.randomUUID();
  const deviceToken = newToken();
  // Both writes run in one D1 transaction. Only an inserted device can consume the invite.
  const [, , selection] = await db.batch<PetSnapshot>([
    db.prepare(`
      INSERT INTO devices (id, pet_id, role, token_hash)
      SELECT ?, i.pet_id, 'viewer', ?
      FROM invites i
      WHERE i.token_hash = ? AND i.used_at IS NULL
        AND i.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        AND NOT EXISTS (
          SELECT 1 FROM devices d
          WHERE d.pet_id = i.pet_id AND d.role = 'viewer' AND d.revoked_at IS NULL
        )
    `).bind(deviceId, await hashToken(deviceToken), inviteHash),
    db.prepare(`
      UPDATE invites SET used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE token_hash = ? AND EXISTS (SELECT 1 FROM devices WHERE id = ?)
    `).bind(inviteHash, deviceId),
    db.prepare(`
      SELECT p.id, p.name, p.state, p.version
      FROM pets p JOIN devices d ON d.pet_id = p.id WHERE d.id = ?
    `).bind(deviceId),
  ]);

  const pet = selection.results[0];
  if (!pet) {
    const invite = await db.prepare('SELECT used_at, expires_at FROM invites WHERE token_hash = ?')
      .bind(inviteHash).first<{ used_at: string | null; expires_at: string }>();
    if (!invite) return error(404, '找不到这个邀请');
    if (invite.used_at) return error(409, '这个邀请已经使用过了');
    if (Date.parse(invite.expires_at) <= Date.now()) return error(409, '这个邀请已过期');
    return error(409, '乎乎已经配对了一台展示设备');
  }

  return json({ pet, device: { petId: pet.id, role: 'viewer', token: deviceToken } }, 201);
}

async function api(request: Request, env: Env, ctx: ExecutionContext, path: string): Promise<Response> {
  const db = env.DB;
  const method = request.method;
  if (path === '/api/widget/state') {
    if (method !== 'GET') return error(405, '不支持此请求方式');
    const token = /^Bearer ([a-f0-9]{64})$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
    if (!token) return error(401, '缺少有效的小组件凭证');
    const widget = await db.prepare(`
      SELECT p.name AS petName, p.state, p.version, p.updated_at AS updatedAt
      FROM widget_tokens w
      JOIN pets p ON p.id = w.pet_id
      JOIN devices d ON d.id = w.viewer_device_id AND d.pet_id = w.pet_id
      WHERE w.token_hash = ? AND w.revoked_at IS NULL
        AND d.role = 'viewer' AND d.revoked_at IS NULL
    `).bind(await hashToken(token)).first<{
      petName: string; state: string; version: number; updatedAt: string;
    }>();
    if (!widget) return error(401, '小组件凭证无效或已撤销');
    const imageName = widget.state === 'sleeping' ? 'sleep' : widget.state;
    return json({
      ...widget,
      imageUrl: new URL(`/images/penguin-${imageName}.png`, request.url).href,
    });
  }
  if (path === '/api/pets') {
    return method === 'POST' ? createPet(db) : error(405, '不支持此请求方式');
  }
  if (path === '/api/invites/claim') {
    return method === 'POST' ? claimInvite(db, request) : error(405, '不支持此请求方式');
  }

  const petRoute = /^\/api\/pets\/([^/]+)(?:\/(state|invites))?$/.exec(path);
  const liveAction = path === '/api/live-activities/register' ? 'register'
    : path === '/api/live-activities/end' ? 'end' : null;
  if (!petRoute && !liveAction) return error(404, '接口不存在');
  const action = petRoute?.[2];
  const expectedMethod = action === 'state' ? 'PATCH' : action === 'invites' || liveAction ? 'POST' : 'GET';
  if (method !== expectedMethod) return error(405, '不支持此请求方式');

  const token = /^Bearer ([a-f0-9]{64})$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token) return error(401, '缺少有效的设备凭证');
  const device = await db.prepare('SELECT id, pet_id, role FROM devices WHERE token_hash = ? AND revoked_at IS NULL')
    .bind(await hashToken(token)).first<AuthenticatedDevice>();
  if (!device) return error(401, '设备凭证已失效');
  if (liveAction) return liveActivityApi(request, env, device, liveAction);
  const petId = petRoute![1];
  if (device.pet_id !== petId || (action && device.role !== 'controller')) {
    return error(403, '此设备没有操作权限');
  }

  if (action === 'state') {
    const { state } = await readBody(request);
    if (!isPetState(state)) return error(400, '请选择有效的企鹅状态');
    const pet = await db.prepare(`
      UPDATE pets SET state = ?, version = version + 1,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?
      RETURNING id, name, state, version
    `).bind(state, petId).first<PetSnapshot>();
    if (!pet) return error(404, '找不到乎乎');
    ctx.waitUntil(pushLiveActivity(env, pet));
    return json(pet);
  }

  const pet = await findPet(db, petId);
  if (!pet) return error(404, '找不到乎乎');
  return action === 'invites' ? createInvite(db, petId) : json(pet);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path !== '/api' && !path.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (path === '/api/admin' || path.startsWith('/api/admin/')) {
        return await adminApi(request, env, path.replace(/\/$/, ''));
      }
      return await api(request, env, ctx, path);
    } catch {
      return error(500, '服务暂时不可用，请稍后再试');
    }
  },
} satisfies ExportedHandler<Env>;
