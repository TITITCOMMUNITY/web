-- Idempotency marker used to prevent the same Linkvertise claim from rewarding twice.
ALTER TABLE license_keys ADD COLUMN last_claim_id INTEGER;
