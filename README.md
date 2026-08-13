# BILSX v2 — Pages + Functions + D1

## Pages
index, features, tools, pricing, documentation, status, login, register, dashboard, keys, admin, admin-users, admin-keys, admin-logs.

## D1
Run schema.sql in your D1 database. Bind it to the Pages project with variable name `DB`.

Then open `/api/test-db`. Expected first response:
{"success":true,"database":"connected","users":0}

Register a normal account at /register.html, then make it admin in D1:
UPDATE users SET role='admin' WHERE username='USERNAME_KAMU';

Login again; admins are redirected to /admin.html. Non-admin users are redirected to /dashboard.html.

## Important
This is a foundation/test implementation. Before production, add rate limiting, email verification, password reset, audit logs, key generation/revocation, and stronger password hashing/secret management as appropriate.
