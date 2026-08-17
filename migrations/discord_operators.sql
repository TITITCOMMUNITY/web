CREATE TABLE IF NOT EXISTS discord_operators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_user_id TEXT NOT NULL UNIQUE,
    discord_username TEXT,
    permission TEXT NOT NULL DEFAULT 'support',
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_discord_operators_status
ON discord_operators(status);

CREATE INDEX IF NOT EXISTS idx_discord_operators_permission
ON discord_operators(permission);
