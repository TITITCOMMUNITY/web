const MAX_BODY = 10000;

export async function onRequestPost({ request, env }) {
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: "REQUEST_TOO_LARGE" }, 413);

    const publicKey = env.DISCORD_PUBLIC_KEY;
    if (!publicKey) return json({ error: "DISCORD_PUBLIC_KEY_NOT_CONFIGURED" }, 500);

    const signature = request.headers.get("X-Signature-Ed25519");
    const timestamp = request.headers.get("X-Signature-Timestamp");
    if (!signature || !timestamp || !(await verifyDiscordSignature(publicKey, signature, timestamp, raw))) {
      return json({ error: "INVALID_SIGNATURE" }, 401);
    }

    const body = JSON.parse(raw);
    if (body.type === 1) return json({ type: 1 });
    if (body.type !== 2) return interaction("Unsupported interaction.", true);

    const discordUser = body.member?.user || body.user;
    const discordId = String(discordUser?.id || "");
    if (!discordId) return interaction("Unable to identify Discord user.", true);

    const operator = await getOperator(env.DB, discordId, env.DISCORD_OWNER_ID);
    const command = String(body.data?.name || "");

    if (!operator) return interaction("⛔ You are not authorized to use BILSX management commands.", true);
    if (!hasPermission(operator.permission, command)) return interaction("⛔ You do not have permission to use this command.", true);

    switch (command) {
      case "user": return await commandUser(env.DB, body);
      case "register": return await commandRegister(env.DB, body);
      case "setpassword": return await commandSetPassword(env.DB, body);
      default: return interaction("Unknown command.", true);
    }
  } catch (error) {
    console.error("DISCORD INTERACTION ERROR", error);
    return interaction("❌ Internal server error.", true);
  }
}

async function verifyDiscordSignature(publicKeyHex, signatureHex, timestamp, body) {
  try {
    const key = await crypto.subtle.importKey("raw", hexToBytes(publicKeyHex), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, hexToBytes(signatureHex), new TextEncoder().encode(timestamp + body));
  } catch { return false; }
}

async function getOperator(db, discordId, ownerId) {
  const row = await db.prepare(`SELECT discord_user_id, discord_username, permission, status FROM discord_operators WHERE discord_user_id=?1 AND status='active' LIMIT 1`).bind(discordId).first();
  if (row) return row;
  if (ownerId && discordId === String(ownerId)) return { discord_user_id: discordId, permission: "owner", status: "active" };
  return null;
}

function hasPermission(permission, command) {
  const map = { owner: ["user", "register", "setpassword"], admin: ["user", "register", "setpassword"], support: ["user"] };
  return (map[permission] || []).includes(command);
}

async function commandUser(db, body) {
  const username = option(body, "username");
  if (!username) return interaction("Usage: /user username", true);
  const user = await db.prepare(`SELECT id, username, email, role, status, plan, premium_expires_at, created_at FROM users WHERE lower(username)=lower(?1) LIMIT 1`).bind(username).first();
  if (!user) return interaction("❌ User not found.", true);
  const key = await db.prepare(`SELECT status, activated_at, expires_at FROM license_keys WHERE user_id=?1 ORDER BY id DESC LIMIT 1`).bind(user.id).first();
  const now = Date.now(), expiry = Number(key?.expires_at || 0), active = key?.status === "active" && expiry > now;
  const premiumActive = user.plan === "premium" && (user.premium_expires_at == null || Number(user.premium_expires_at) > now);
  return interaction(`👤 **BILSX Account**\n\nUsername: \`${user.username}\`\nEmail: ||${user.email}||\nRole: \`${user.role}\`\nStatus: \`${user.status}\`\nPlan: \`${premiumActive ? "premium" : "free"}\`\n\n🔑 **Free Key**\nStatus: \`${active ? "active" : "inactive"}\`\nRemaining: \`${active ? formatDuration(expiry - now) : "Inactive"}\`\nExpires: \`${active ? new Date(expiry).toISOString() : "-"}\`\n\n🔒 Password: \`not readable\``, true);
}

async function commandRegister(db, body) {
  const username = option(body, "username"), email = option(body, "email"), password = option(body, "password");
  if (!username || !email || !password) return interaction("Usage: /register username email password", true);
  if (username.length < 3 || username.length > 32) return interaction("❌ Invalid username length.", true);
  if (password.length < 8) return interaction("❌ Password must be at least 8 characters.", true);
  const exists = await db.prepare(`SELECT id FROM users WHERE lower(username)=lower(?1) OR lower(email)=lower(?2) LIMIT 1`).bind(username, email).first();
  if (exists) return interaction("❌ Username or email already exists.", true);
  const salt = randomHex(32), hash = await hashPassword(password, salt), now = Date.now();
  const result = await db.prepare(`INSERT INTO users (username,email,password_hash,password_salt,role,status,plan,premium_expires_at,created_at,last_login_at) VALUES (?1,?2,?3,?4,'user','active','free',NULL,?5,NULL)`).bind(username, email, hash, salt, now).run();
  return interaction(`✅ Account created.\nUsername: \`${username}\`\nEmail: \`${email}\`\nID: \`${result.meta.last_row_id}\`\nPlan: \`free\`\n\n🔐 Password was stored as a hash and cannot be retrieved later.`, true);
}

async function commandSetPassword(db, body) {
  const username = option(body, "username"), password = option(body, "password");
  if (!username || !password) return interaction("Usage: /setpassword username password", true);
  if (password.length < 8) return interaction("❌ Password must be at least 8 characters.", true);
  const user = await db.prepare(`SELECT id FROM users WHERE lower(username)=lower(?1) LIMIT 1`).bind(username).first();
  if (!user) return interaction("❌ User not found.", true);
  const salt = randomHex(32), hash = await hashPassword(password, salt);
  await db.prepare(`UPDATE users SET password_hash=?1,password_salt=?2 WHERE id=?3`).bind(hash, salt, user.id).run();
  return interaction(`✅ Password reset completed for \`${username}\`.\nThe previous password cannot be recovered.`, true);
}

function option(body, name) { const item = (body.data?.options || []).find(x => x.name === name); return item == null ? "" : String(item.value ?? "").trim(); }

async function hashPassword(password, salt) {
  let digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + password));
  const saltBytes = new TextEncoder().encode(salt);
  for (let i=0;i<100000;i++) { const buffer=new Uint8Array(saltBytes.length+digest.byteLength); buffer.set(saltBytes); buffer.set(new Uint8Array(digest),saltBytes.length); digest=await crypto.subtle.digest("SHA-256",buffer); }
  return toHex(digest);
}
function randomHex(bytes) { return toHex(crypto.getRandomValues(new Uint8Array(bytes))); }
function hexToBytes(hex) { if(!/^[0-9a-f]+$/i.test(hex)||hex.length%2) throw new Error("invalid hex"); const out=new Uint8Array(hex.length/2); for(let i=0;i<out.length;i++) out[i]=parseInt(hex.slice(i*2,i*2+2),16); return out; }
function toHex(data) { return [...new Uint8Array(data)].map(b=>b.toString(16).padStart(2,"0")).join(""); }
function formatDuration(ms) { const h=Math.floor(ms/3600000), m=Math.floor((ms%3600000)/60000); return `${h}h ${m}m`; }
function interaction(content, ephemeral=true) { return json({type:4,data:{content,flags:ephemeral?64:0}}); }
function json(data,status=200) { return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}}); }
