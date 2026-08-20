-- Free Key hardening
-- 1) Track cumulative rewarded hours so the 72-hour cap cannot reset after expiry.
-- 2) Enforce one Free Key per account.

ALTER TABLE license_keys ADD COLUMN rewarded_hours INTEGER NOT NULL DEFAULT 0;

-- Keep the newest key when an old database contains accidental duplicates.
DELETE FROM license_keys
WHERE id NOT IN (
  SELECT MAX(id)
  FROM license_keys
  GROUP BY user_id
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_license_keys_one_per_user
ON license_keys(user_id);

CREATE INDEX IF NOT EXISTS idx_free_key_claims_active
ON free_key_claims(user_id, key_id, status, expires_at);
