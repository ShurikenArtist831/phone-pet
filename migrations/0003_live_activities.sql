CREATE TABLE live_activities (
  id TEXT PRIMARY KEY NOT NULL,
  pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  viewer_device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL UNIQUE,
  push_token TEXT,
  token_hash TEXT,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'expired')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ended_at TEXT,
  CHECK (
    (status = 'active' AND push_token IS NOT NULL AND token_hash IS NOT NULL AND ended_at IS NULL)
    OR (status <> 'active' AND push_token IS NULL AND token_hash IS NULL AND ended_at IS NOT NULL)
  )
);

CREATE INDEX live_activities_pet_status ON live_activities(pet_id, status);
CREATE INDEX live_activities_viewer_status ON live_activities(viewer_device_id, status);
CREATE UNIQUE INDEX live_activities_active_token ON live_activities(environment, token_hash)
  WHERE status = 'active';

CREATE TRIGGER live_activities_revoke_viewer
AFTER UPDATE OF revoked_at ON devices
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL AND NEW.role = 'viewer'
BEGIN
  UPDATE live_activities
  SET status = 'ended', push_token = NULL, token_hash = NULL,
    updated_at = NEW.revoked_at, ended_at = COALESCE(ended_at, NEW.revoked_at)
  WHERE viewer_device_id = NEW.id AND status <> 'ended';
END;
