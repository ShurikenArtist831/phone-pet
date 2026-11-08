import { error, hashToken, json, newToken } from './shared';

export async function createInvite(db: D1Database, petId: string): Promise<Response> {
  const token = newToken();
  const invite = await db.prepare(`
    INSERT INTO invites (id, pet_id, token_hash, expires_at)
    SELECT ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+10 minutes')
    WHERE NOT EXISTS (
      SELECT 1 FROM devices WHERE pet_id = ? AND role = 'viewer' AND revoked_at IS NULL
    )
    RETURNING expires_at
  `).bind(crypto.randomUUID(), petId, await hashToken(token), petId).first<{ expires_at: string }>();

  if (!invite) return error(409, '乎乎已经配对了一台展示设备');
  return json({ path: `/join/${token}`, expiresAt: invite.expires_at }, 201);
}
