PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT NOT NULL UNIQUE,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','banned')),created_at INTEGER NOT NULL,last_login_at INTEGER);
CREATE TABLE IF NOT EXISTS sessions(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,token_hash TEXT NOT NULL UNIQUE,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS license_keys(id INTEGER PRIMARY KEY AUTOINCREMENT,key TEXT NOT NULL UNIQUE,user_id INTEGER,duration_days INTEGER,status TEXT NOT NULL DEFAULT 'unused' CHECK(status IN ('unused','active','expired','revoked')),created_at INTEGER NOT NULL,activated_at INTEGER,expires_at INTEGER,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_license_user_id ON license_keys(user_id);
