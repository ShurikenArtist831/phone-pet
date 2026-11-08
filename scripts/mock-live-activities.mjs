import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { Miniflare, Response } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';

const { outputFiles } = await build({ entryPoints: ['worker/index.ts'], bundle: true, format: 'esm', write: false });
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const expectedPushes = new Map();
let unexpectedPushes = 0;
const mf = new Miniflare({
  script: outputFiles[0].text,
  modules: true,
  compatibilityDate: '2026-05-15',
  d1Databases: { DB: 'mock-live-activities' },
  async outboundService(request) {
    const expected = expectedPushes.get(request.url);
    if (!expected) {
      unexpectedPushes++;
      return new Response(null, { status: 500 });
    }
    expectedPushes.delete(request.url);
    expected.resolve({ method: request.method, headers: request.headers, body: await request.text() });
    return expected.status === 410 ? Response.json({ reason: 'Unregistered' }, { status: 410 }) : new Response();
  },
  bindings: {
    APNS_KEY_ID: 'MOCKKEY', APNS_TEAM_ID: 'MOCKTEAM', APNS_BUNDLE_ID: 'com.example.huhu',
    APNS_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    LIVE_ACTIVITY_TOKEN_KEY: randomBytes(32).toString('hex'),
  },
});

async function api(path, method, body, token, expected = 200) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await mf.dispatchFetch(`http://localhost/api${path}`, {
    method, headers, body: body && JSON.stringify(body),
  });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${path} returned ${response.status}`);
  return data;
}

async function pair() {
  const { pet, device } = await api('/pets', 'POST', undefined, undefined, 201);
  const { path } = await api(`/pets/${pet.id}/invites`, 'POST', undefined, device.token, 201);
  const { device: viewer } = await api('/invites/claim', 'POST', { token: path.split('/').at(-1) }, undefined, 201);
  return { pet, controller: device.token, viewer: viewer.token };
}

function expectPush(host, token, petId, state, version, status) {
  let validate;
  const received = new Promise((resolve) => { validate = resolve; });
  expectedPushes.set(`https://${host}/3/device/${token}`, { status, resolve: validate });
  return async () => {
    const request = await received;
    const { headers } = request;
    assert.equal(request.method, 'POST');
    assert.equal(headers.get('apns-topic'), 'com.example.huhu.push-type.liveactivity');
    assert.equal(headers.get('apns-push-type'), 'liveactivity');
    assert.equal(headers.get('apns-priority'), '10');
    assert.equal(headers.get('apns-expiration'), '0');
    assert.match(headers.get('authorization'), /^bearer /);
    const [header, claims, signature] = headers.get('authorization').slice(7).split('.');
    const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString());
    assert.deepEqual(decode(header), { alg: 'ES256', kid: 'MOCKKEY' });
    assert.equal(decode(claims).iss, 'MOCKTEAM');
    assert.ok(Math.abs(Date.now() / 1000 - decode(claims).iat) < 30);
    assert.ok(verify('sha256', Buffer.from(`${header}.${claims}`), {
      key: publicKey, dsaEncoding: 'ieee-p1363',
    }, Buffer.from(signature, 'base64url')));
    const { aps } = JSON.parse(request.body);
    assert.equal(aps.event, 'update');
    assert.ok(Number.isInteger(aps.timestamp) && Math.abs(Date.now() / 1000 - aps.timestamp) < 30);
    assert.deepEqual(aps['content-state'], { petId, state, version });
  };
}

// Keep failures bounded even if an expected background push never reaches the mock.
const watchdog = setTimeout(() => { throw new Error('Live Activity mock timed out'); }, 20000);
try {
  const db = await mf.getD1Database('DB');
  for (const file of ['0001_initial.sql', '0002_admin.sql', '0003_live_activities.sql']) {
    const sql = await readFile(`migrations/${file}`, 'utf8');
    await db.batch(unstable_splitSqlQuery(sql).map((statement) => db.prepare(statement)));
  }

  const { pet, controller, viewer } = await pair();
  const other = await pair();
  const register = '/live-activities/register';
  const end = '/live-activities/end';
  const statePath = `/pets/${pet.id}/state`;
  const first = { activityId: 'mock-first', pushToken: randomBytes(32).toString('hex'), environment: 'sandbox' };
  const second = { activityId: 'mock-second', pushToken: randomBytes(32).toString('hex'), environment: 'production' };

  await api(register, 'POST', first, undefined, 401);
  await api(register, 'POST', first, controller, 403);
  await api(register, 'POST', { ...first, petId: other.pet.id }, viewer, 400);
  await api(statePath, 'PATCH', { state: 'happy' }, viewer, 403);
  assert.deepEqual(await api(register, 'POST', first, viewer), { ok: true });
  await api(register, 'POST', first, viewer);
  await api(register, 'POST', first, other.viewer, 409);
  await api(register, 'POST', { ...first, activityId: 'mock-other' }, other.viewer, 409);
  await api(end, 'POST', { activityId: first.activityId }, other.viewer, 404);
  const stored = await db.prepare('SELECT push_token FROM live_activities WHERE activity_id = ?').bind(first.activityId).first();
  assert.ok(stored.push_token.startsWith('v1.') && !stored.push_token.includes(first.pushToken));

  const sandbox = expectPush('api.sandbox.push.apple.com', first.pushToken, pet.id, 'sleeping', 2, 200);
  assert.equal((await api(statePath, 'PATCH', { state: 'sleeping' }, controller)).version, 2);
  await sandbox();

  await api(register, 'POST', second, viewer);
  await api(register, 'POST', first, viewer, 409);
  const rotated = { ...second, pushToken: randomBytes(32).toString('hex') };
  await api(register, 'POST', rotated, viewer);
  const production = expectPush('api.push.apple.com', rotated.pushToken, pet.id, 'angry', 3, 410);
  assert.equal((await api(statePath, 'PATCH', { state: 'angry' }, controller)).version, 3);
  await production();
  let expired;
  for (let i = 0; i < 40 && expired?.status !== 'expired'; i++) {
    expired = await db.prepare('SELECT status, push_token FROM live_activities WHERE activity_id = ?').bind(second.activityId).first();
    if (expired.status !== 'expired') await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.deepEqual(expired, { status: 'expired', push_token: null });
  assert.equal((await api(`/pets/${pet.id}`, 'GET', undefined, viewer)).state, 'angry');

  await api(end, 'POST', { activityId: second.activityId }, viewer);
  await api(end, 'POST', { activityId: second.activityId }, viewer);
  assert.equal((await api(statePath, 'PATCH', { state: 'comfortable' }, controller)).version, 4);
  assert.equal(expectedPushes.size, 0);
  assert.equal(unexpectedPushes, 0);
  console.log('Live Activity mock passed (local D1, authorization, ES256, sandbox/production, token lifecycle).');
} finally {
  clearTimeout(watchdog);
  await mf.dispose();
}
