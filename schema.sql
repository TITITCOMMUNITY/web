CREATE TABLE IF NOT EXISTS license_keys(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    user_id INTEGER,
    duration_days INTEGER,
    status TEXT NOT NULL DEFAULT 'unused',
    created_at INTEGER NOT NULL,
    activated_at INTEGER,
    expires_at INTEGER
);
