CREATE TABLE pets (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('angry', 'happy', 'comfortable', 'sleeping')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY NOT NULL,
  pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('controller', 'viewer')),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  revoked_at TEXT
);

CREATE TABLE invites (
  id TEXT PRIMARY KEY NOT NULL,
  pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX devices_pet ON devices(pet_id);
CREATE UNIQUE INDEX devices_active_role ON devices(pet_id, role) WHERE revoked_at IS NULL;
CREATE INDEX invites_pet ON invites(pet_id);
