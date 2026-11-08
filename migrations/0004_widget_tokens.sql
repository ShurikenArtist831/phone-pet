CREATE TABLE widget_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  viewer_device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  revoked_at TEXT
);

CREATE INDEX widget_tokens_pet ON widget_tokens(pet_id);
CREATE INDEX widget_tokens_viewer_status ON widget_tokens(viewer_device_id, revoked_at);

CREATE TRIGGER widget_tokens_revoke_viewer
AFTER UPDATE OF revoked_at ON devices
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL AND NEW.role = 'viewer'
BEGIN
  UPDATE widget_tokens
  SET revoked_at = NEW.revoked_at
  WHERE viewer_device_id = NEW.id AND revoked_at IS NULL;
END;
