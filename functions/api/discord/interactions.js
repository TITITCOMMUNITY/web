const MAX_BODY = 10000;
const REWARD_MS = 6 * 60 * 60 * 1000;
const MAX_MS = 72 * 60 * 60 * 1000;
const CLAIM_MS = 10 * 60 * 1000;
const BASE_URL = "https://web-d8a.pages.dev";

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: "REQUEST_TOO_LARGE" }, 413);
    if (!env.DISCORD_PUBLIC_KEY) return json({ error: "DISCORD_PUBLIC_KEY_NOT_CONFIGURED" }, 500);
    const sig = request.headers.get("X-Signature-Ed25519"), ts = request.headers.get("X-Signature-Timestamp");
    if (!sig || !ts || !(await verifyDiscordSignature(env.DISCORD_PUBLIC_KEY, sig, ts, raw))) return json({ error: "INVALID_SIGNATURE" }, 401);
    const body = JSON.parse(raw);
    if (body.type === 1) { context.waitUntil(registerCommands(env)); return json({ type: 1 }); }
    if (body.type !== 2) return interaction("Unsupported interaction.", true);
    const discordUser = body.member?.user || body.user;
    const discordId = String(discordUser?.id || "");
    if (!discordId) return interaction("Unable to identify Discord user.", true);
    await ensureOperatorTable(env.DB);
    const operator = await getOperator(env.DB, discordId, env.DISCORD_OWNER_ID);
    const command = String(body.data?.name || "");
    const publicCommands = ["status", "searchitem", "getitem", "price", "dq"];
    if (publicCommands.includes(command)) return await handlePublicCommand(env, body, command);
    if (!operator) return interaction("⛔ You are not authorized to use BILSX management commands.", true);
    if (!hasPermission(operator.permission, command)) return interaction("⛔ You do not have permission to use this command.", true);
    switch (command) {
      case "user": return await commandUser(env.DB, body);
      case "getkey": return await commandGetKey(env, body);
      case "register": return await commandRegister(env.DB, body);
      case "setpassword": return await commandSetPassword(env.DB, body);
      default: return interaction("Unknown command.", true);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("DISCORD INTERACTION ERROR:", message, error?.stack || "");
    return interaction(`❌ Internal server error.\nDebug: \`${safeDebugMessage(message)}\``, true);
  }
}

async function registerCommands(env) {
  const token = env.DISCORD_BOT_TOKEN, applicationId = env.DISCORD_APPLICATION_ID;
  if (!token || !applicationId) return console.error("DISCORD COMMAND REGISTER: missing token/application id");
  const commands = [
    { name:"status", description:"Show live Growtopia server status", type:1 },
    { name:"searchitem", description:"Search Growtopia items", type:1, options:[{name:"item",description:"Item name",type:3,required:true}] },
    { name:"getitem", description:"Show Growtopia item information", type:1, options:[{name:"item",description:"Exact or partial item name",type:3,required:true}] },
    { name:"price", description:"Show estimated item price", type:1, options:[{name:"item",description:"Item name",type:3,required:true}] },
    { name:"dq", description:"Show today's Daily Quest information", type:1 },
    { name:"user", description:"View a BILSX user account", type:1, options:[{name:"username",description:"BILSX username",type:3,required:true}] },
    { name:"getkey", description:"View a user's Free Key and Linkvertise claim link", type:1, options:[{name:"user",description:"BILSX username",type:3,required:true}] },
    { name:"register", description:"Create a BILSX user account", type:1, options:[{name:"username",description:"Username",type:3,required:true},{name:"email",description:"Email address",type:3,required:true},{name:"password",description:"Initial password",type:3,required:true}] },
    { name:"setpassword", description:"Reset a BILSX user's password", type:1, options:[{name:"username",description:"Username",type:3,required:true},{name:"password",description:"New password",type:3,required:true}] }
  ];
  const guildId = String(env.DISCORD_GUILD_ID || "").trim();
  const url = guildId ? `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands` : `https://discord.com/api/v10/applications/${applicationId}/commands`;
  try { const r = await fetch(url,{method:"PUT",headers:{Authorization:`Bot ${token}`,"Content-Type":"application/json"},body:JSON.stringify(commands)}); const text=await r.text(); if(!r.ok) console.error("DISCORD COMMAND REGISTER FAILED",r.status,text); else console.log("DISCORD COMMAND REGISTER SUCCESS"); } catch(e){ console.error("DISCORD COMMAND REGISTER NETWORK ERROR",e); }
}

async function handlePublicCommand(env, body, command) {
  if (command === "status") return await commandStatus(env);
  if (command === "searchitem") return await commandSearchItem(env, body);
  if (command === "getitem") return await commandGetItem(env, body);
  if (command === "price") return await commandPrice(env, body);
  if (command === "dq") return await commandDailyQuest(env);
}

async function commandStatus(env) {
  const r = await fetch(`${BASE_URL}/api/growtopia/status`, {headers:{Accept:"application/json"}});
  const d = await r.json();
  if (!d.success) return interaction("⚪ **Growtopia Status**\n\nStatus: `Unavailable`\nCould not read the public Growtopia detail endpoint.", false);
  const state = d.online > 0 ? "🟢 Online" : "🟠 Maintenance / Empty";
  return interaction(`🌎 **Growtopia Status**\n\n${state}\n👥 Players Online: **${Number(d.online).toLocaleString("en-US")}**\n🕐 Updated: <t:${Math.floor(Date.now()/1000)}:R>\n\nSource: \`growtopiagame.com/detail\``, false);
}

async function commandSearchItem(env, body) {
  const q = option(body,"item");
  if (!q) return interaction("Usage: /searchitem item:angel", true);
  const r = await fetch(`${BASE_URL}/api/growtopia/items?q=${encodeURIComponent(q)}`);
  const d = await r.json();
  if (!d.success || !d.results?.length) return interaction(`🔎 No item found for \`${q}\`.`, true);
  const lines = d.results.slice(0,8).map((x,i)=>`${i+1}. **${x.title}**\n   ${x.url}`);
  return interaction(`🔎 **Growtopia Item Search: ${q}**\n\n${lines.join("\n")}`, false);
}

async function commandGetItem(env, body) {
  const q = option(body,"item");
  if (!q) return interaction("Usage: /getitem item:angel wings", true);
  const r = await fetch(`${BASE_URL}/api/growtopia/items?q=${encodeURIComponent(q)}`);
  const d = await r.json();
  if (!d.success || !d.results?.length) return interaction(`❌ Item \`${q}\` not found.`, true);
  const x=d.results[0];
  return interaction(`📦 **${x.title}**\n\n${x.snippet || "No description available from the search index."}\n\n🔗 ${x.url}\n\n_Source: Growtopia Wiki_`, false);
}

async function commandPrice(env, body) {
  const q=option(body,"item");
  if(!q) return interaction("Usage: /price item:magplant", true);
  const source=String(env.PRICE_API_URL||"").trim();
  if(!source) return interaction(`📊 **Price: ${q}**\n\n⚪ Live price source is not configured yet.\n\nThe BILSX price engine is ready for a trusted community price source. Prices will be shown as a **range + confidence**, never as an invented exact value.`, false);
  try {
    const u=new URL(source); u.searchParams.set("item",q); const r=await fetch(u); const d=await r.json();
    if(!r.ok || !d.success) return interaction(`📊 **Price: ${q}**\n\n⚪ Price source unavailable right now.`, false);
    return interaction(`📊 **${d.item || q}**\n\nBuy: **${d.buy_range || "-"}**\nSell: **${d.sell_range || "-"}**\nConfidence: **${d.confidence || "unknown"}**\nUpdated: <t:${Math.floor(Number(d.updated_at||Date.now())/1000)}:R>\n\n_Community estimate — verify in-game before trading._`, false);
  } catch { return interaction("⚪ Price source request failed.", false); }
}

async function commandDailyQuest(env) {
  try {
    const r=await fetch(`${BASE_URL}/api/growtopia/dq`); const d=await r.json();
    if(!d.success) return interaction(`📜 **Daily Quest**\n\n⚪ Today's quest data is not available from a verified source yet.\n\nBILSX will not invent a quest or completion cost.`, false);
    const items=(d.items||[]).map(x=>`• ${x.name} × ${x.amount}${x.estimated_cost ? ` — ~${x.estimated_cost}` : ""}`).join("\n") || "No item requirements.";
    return interaction(`📜 **Daily Quest**\n\n${d.title||"Today's Quest"}\n\n${items}\n\n💰 Estimated Cost: **${d.total_estimate||"-"}**\n📊 Confidence: **${d.confidence||"unknown"}**\n🕐 Updated: <t:${Math.floor(Number(d.updated_at||Date.now())/1000)}:R>`, false);
  } catch { return interaction("⚪ Daily Quest source unavailable.", false); }
}

async function ensureOperatorTable(db){await db.prepare(`CREATE TABLE IF NOT EXISTS discord_operators (id INTEGER PRIMARY KEY AUTOINCREMENT,discord_user_id TEXT NOT NULL UNIQUE,discord_username TEXT,permission TEXT NOT NULL DEFAULT 'support',status TEXT NOT NULL DEFAULT 'active',created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)`).run();}
async function getOperator(db,id,owner){if(owner&&id===String(owner))return{permission:"owner",status:"active"};return db.prepare(`SELECT permission,status FROM discord_operators WHERE discord_user_id=?1 AND status='active' LIMIT 1`).bind(id).first();}
function hasPermission(p,c){const m={owner:["user","getkey","register","setpassword"],admin:["user","getkey","register","setpassword"],support:["user","getkey"]};return(m[p]||[]).includes(c);}

async function commandUser(db,body){const username=option(body,"username");if(!username)return interaction("Usage: /user username",true);const u=await db.prepare(`SELECT id,username,email,role,status,plan,premium_expires_at FROM users WHERE lower(username)=lower(?1) LIMIT 1`).bind(username).first();if(!u)return interaction("❌ User not found.",true);const k=await db.prepare(`SELECT key,status,expires_at FROM license_keys WHERE user_id=?1 ORDER BY id DESC LIMIT 1`).bind(u.id).first();const now=Date.now(),e=Number(k?.expires_at||0),active=k?.status==="active"&&e>now,p=u.plan==="premium"&&(u.premium_expires_at==null||Number(u.premium_expires_at)>now);return interaction(`👤 **BILSX Account**\n\nUsername: \`${u.username}\`\nEmail: ||${u.email}||\nRole: \`${u.role}\`\nStatus: \`${u.status}\`\nPlan: \`${p?"premium":"free"}\`\n\n🔑 **Free Key**\nKey: \`${k?.key||"Not Created"}\`\nStatus: \`${active?"active":"inactive"}\`\nRemaining: \`${active?formatDuration(e-now):"Inactive"}\`\nExpires: \`${active?formatDate(e):"-"}\``,true);}

async function commandGetKey(env,body){const username=option(body,"user");if(!username)return interaction("Usage: /getkey user:username",true);const u=await env.DB.prepare(`SELECT id,username,role,status,plan,premium_expires_at FROM users WHERE lower(username)=lower(?1) LIMIT 1`).bind(username).first();if(!u)return interaction(`❌ User \`${username}\` tidak ditemukan.`,true);if(String(u.status).toLowerCase()!=="active")return interaction(`❌ Akun \`${u.username}\` tidak aktif.`,true);const now=Date.now(),premium=String(u.plan).toLowerCase()==="premium"&&(u.premium_expires_at==null||Number(u.premium_expires_at)>now),admin=String(u.role).toLowerCase()==="admin";if(admin||premium)return interaction(`👤 **${u.username}**\n\n${admin?"👑 Admin":"💎 Premium"}\n\nFree Key tidak diperlukan.`,true);let k=await env.DB.prepare(`SELECT id,key,status,expires_at FROM license_keys WHERE user_id=?1 ORDER BY id DESC LIMIT 1`).bind(u.id).first();if(!k){const key=generateKey();await env.DB.prepare(`INSERT INTO license_keys(key,user_id,duration_days,status,created_at) VALUES(?1,?2,0,'unused',?3)`).bind(key,u.id,now).run();k=await env.DB.prepare(`SELECT id,key,status,expires_at FROM license_keys WHERE user_id=?1 ORDER BY id DESC LIMIT 1`).bind(u.id).first();}const e=Number(k?.expires_at||0),active=k.status==="active"&&e>now;if(active&&e>=now+MAX_MS)return interaction(`🔑 **${u.username}**\n\nKey: \`${k.key}\`\nStatus: \`ACTIVE\`\nExpires: \`${formatDate(e)}\`\nRemaining: \`${formatDuration(e-now)}\`\n\n⚠️ Maximum 72 hours reached.`,true);let c=await env.DB.prepare(`SELECT claim_token,expires_at FROM free_key_claims WHERE user_id=?1 AND key_id=?2 AND status='pending' AND expires_at>?3 ORDER BY created_at DESC LIMIT 1`).bind(u.id,k.id,now).first();if(!c){const t=generateToken();const ce=now+CLAIM_MS;await env.DB.prepare(`INSERT INTO free_key_claims(user_id,key_id,claim_token,status,created_at,expires_at) VALUES(?1,?2,?3,'pending',?4,?5)`).bind(u.id,k.id,t,now,ce).run();c={claim_token:t,expires_at:ce};}if(!String(env.LINKVERTISE_URL||"").trim())return interaction("❌ LINKVERTISE_URL belum dikonfigurasi.",true);const start=new URL("/api/free-key/start",BASE_URL);start.searchParams.set("claim",c.claim_token);return interaction(`🔑 **BILSX Free Key — ${u.username}**\n\nKey: \`${k.key}\`\nStatus: \`${active?"ACTIVE":"NOT ACTIVE"}\`\nExpires: \`${active?formatDate(e):"Belum aktif"}\`\nRemaining: \`${active?formatDuration(e-now):"0h 0m"}\`\n\n🎁 Complete Linkvertise untuk **+6 jam**.\nMaximum: **72 jam**.\n\n🔗 **START LINKVERTISE**\n${start}\n\nClaim expires: \`${formatDate(Number(c.expires_at))}\``,true);}

async function commandRegister(db,body){const username=option(body,"username"),email=option(body,"email"),password=option(body,"password");if(!username||!email||!password)return interaction("Usage: /register username email password",true);if(username.length<3||username.length>32)return interaction("❌ Invalid username length.",true);if(password.length<8)return interaction("❌ Password must be at least 8 characters.",true);if(await db.prepare(`SELECT id FROM users WHERE lower(username)=lower(?1) OR lower(email)=lower(?2) LIMIT 1`).bind(username,email).first())return interaction("❌ Username or email already exists.",true);const salt=randomHex(32),hash=await hashPassword(password,salt),now=Date.now(),r=await db.prepare(`INSERT INTO users(username,email,password_hash,password_salt,role,status,plan,premium_expires_at,created_at,last_login_at) VALUES(?1,?2,?3,?4,'user','active','free',NULL,?5,NULL)`).bind(username,email,hash,salt,now).run();return interaction(`✅ Account created.\nUsername: \`${username}\`\nEmail: \`${email}\`\nID: \`${r.meta.last_row_id}\``,true);}
async function commandSetPassword(db,body){const username=option(body,"username"),password=option(body,"password");if(!username||!password)return interaction("Usage: /setpassword username password",true);if(password.length<8)return interaction("❌ Password must be at least 8 characters.",true);const u=await db.prepare(`SELECT id FROM users WHERE lower(username)=lower(?1) LIMIT 1`).bind(username).first();if(!u)return interaction("❌ User not found.",true);const salt=randomHex(32),hash=await hashPassword(password,salt);await db.prepare(`UPDATE users SET password_hash=?1,password_salt=?2 WHERE id=?3`).bind(hash,salt,u.id).run();return interaction(`✅ Password reset completed for \`${username}\`.`,true);}

function option(body,name){const x=(body.data?.options||[]).find(v=>v.name===name);return x==null?"":String(x.value??"").trim();}
function generateKey(){const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let r="BLSX-FREE-";for(let g=0;g<2;g++){if(g)r+="-";for(let i=0;i<4;i++)r+=c[Math.floor(Math.random()*c.length)];}return r;}
function generateToken(){const b=new Uint8Array(32);crypto.getRandomValues(b);return[...b].map(x=>x.toString(16).padStart(2,"0")).join("");}
function randomHex(n){const b=new Uint8Array(n);crypto.getRandomValues(b);return[...b].map(x=>x.toString(16).padStart(2,"0")).join("");}
async function hashPassword(password,salt){let d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(salt+password));const sb=new TextEncoder().encode(salt);for(let i=0;i<100000;i++){const x=new Uint8Array(sb.length+d.byteLength);x.set(sb);x.set(new Uint8Array(d),sb.length);d=await crypto.subtle.digest("SHA-256",x);}return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");}
async function verifyDiscordSignature(pk,sig,ts,body){try{const key=await crypto.subtle.importKey("raw",hexToBytes(pk),{name:"Ed25519"},false,["verify"]);return await crypto.subtle.verify("Ed25519",key,hexToBytes(sig),new TextEncoder().encode(ts+body));}catch{return false;}}
function hexToBytes(hex){const out=new Uint8Array(hex.length/2);for(let i=0;i<out.length;i++)out[i]=parseInt(hex.slice(i*2,i*2+2),16);return out;}
function formatDuration(ms){let s=Math.max(0,Math.floor(ms/1000)),h=Math.floor(s/3600);s%=3600;const m=Math.floor(s/60);return `${h}h ${m}m`;}
function formatDate(ms){return new Date(Number(ms)).toLocaleString("en-US",{timeZone:"Asia/Jakarta",hour12:false});}
function safeDebugMessage(m){return String(m||"unknown").replace(/\s+/g," ").replace(/[`\\]/g,"").slice(0,180);}
function interaction(content,ephemeral=false){return json({type:4,data:{content,flags:ephemeral?64:0}});}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8"}});}
