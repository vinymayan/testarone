CREATE TABLE IF NOT EXISTS oauth_sessions (
  id TEXT PRIMARY KEY,
  sealed_access_token TEXT NOT NULL,
  sealed_refresh_token TEXT,
  token_type TEXT,
  expires_at INTEGER,
  user_id TEXT,
  user_name TEXT,
  user_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_sessions_user_id ON oauth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_sessions_expires_at ON oauth_sessions(expires_at);
