# BILSX Website

Website + Cloudflare Pages Functions + D1 backend for BILSX.

## Cloudflare Pages

Deploy the `public/` directory as the Pages output and enable Pages Functions from `functions/`.

Bind the D1 database to the Pages project using the binding name:

`DB`

Do **not** put a database UUID placeholder in production configuration.

## D1 migrations

Apply the SQL files in `migrations/` to the same D1 database, in filename order.

The latest migrations harden the Free Key system by:

- enforcing one Free Key per account;
- tracking cumulative rewarded hours;
- preventing the 72-hour allowance from resetting after expiry;
- adding claim idempotency protection.

For a remote D1 database, use Wrangler's D1 migration/execute workflow from the project environment. Back up or verify the database before schema changes.

## Health check

Open `/api/test-db` after the `DB` binding is configured.

Expected response:

```json
{"success":true,"database":"connected"}
```

The endpoint intentionally does not expose the number of registered users.

## Authentication

New registrations use native Web Crypto PBKDF2. Existing accounts using the previous SHA-256 loop remain compatible and are upgraded automatically after their next successful login.

Sessions are stored as SHA-256 token hashes in D1; the raw session token is only kept in the secure HTTP-only cookie.

## Free Key + Linkvertise

The flow is:

1. User presses **Get Key**.
2. BILSX creates/reuses a short-lived claim and returns `/api/free-key/start?claim=...`.
3. `/api/free-key/start` redirects to the configured Linkvertise URL.
4. Linkvertise's **Target URL** must be the BILSX endpoint `/api/free-key/complete`.
5. After the ad step, Linkvertise appends `?hash=...` to that target.
6. BILSX verifies the hash with the Linkvertise Anti-Bypass API before rewarding the claim.
7. Each successful visit adds 6 hours, with a cumulative maximum of 72 hours per Free Key.

### Required environment variables

- `LINKVERTISE_URL` = the actual public Linkvertise link users should visit.
- `LINKVERTISE_TOKEN` = the Linkvertise Anti-Bypass authentication token.

**Important:** `LINKVERTISE_URL` is **not** the BILSX target endpoint. The BILSX endpoint belongs in Linkvertise's Target URL setting.

## Admin

Register a normal account first, then grant admin access directly in D1:

```sql
UPDATE users SET role='admin' WHERE username='USERNAME_KAMU';
```

After logging in, admins go to `/admin.html` while normal users go to `/dashboard.html`.

## Production hardening already included

- Prepared D1 statements for user input.
- No-store headers on authentication and key APIs.
- Safer public database health check.
- Native PBKDF2 for new passwords.
- Automatic legacy-password upgrade on successful login.
- Cryptographically generated session, claim, and Free Key values.
- Cumulative Free Key cap and claim idempotency protection.
- Reduced leakage of internal server/database errors to clients.

