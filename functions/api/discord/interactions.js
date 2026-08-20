import { handleDiscordCommand } from "./commands.js";

const BASE_URL = "https://web-d8a.pages.dev";

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    if (body.type === 1) return json({ type: 1 });
    if (body.type !== 2) return json({ error: "Unsupported interaction type" }, 400);

    const command = body.data?.name;
    if (!command) return json({ error: "Missing command" }, 400);

    if (command === "status") return await commandStatus(env);
    if (command === "searchitem") return await commandSearchItem(env, body);
    if (command === "getitem") return await commandGetItem(env, body);
    if (command === "price") return await commandPrice(env, body);
    if (command === "dq") return await commandDailyQuest(env);

    return json({ type: 4, data: { content: "Unknown command.", flags: 64 } });
  } catch (error) {
    console.error("DISCORD INTERACTION ERROR", error);
    return json({ type: 4, data: { content: "Terjadi kesalahan internal.", flags: 64 } });
  }
}

async function commandStatus(env) {
  const r = await fetch(`${BASE_URL}/api/growtopia/status`, { headers: { Accept: "application/json" } });
  const d = await r.json();
  if (!d.success) return interaction("⚪ **Growtopia Status**\n\nStatus: `Unavailable`\nCould not read the public Growtopia detail endpoint.", false);
  const state = d.online > 0 ? "🟢 Online" : "🟠 Maintenance / Empty";
  return interaction(`🌎 **Growtopia Status**\n\n${state}\n👥 Players Online: **${Number(d.online).toLocaleString("en-US")}**\n🕐 Updated: <t:${Math.floor(Date.now() / 1000)}:R>\n\nSource: \`growtopiagame.com/detail\``, false);
}

async function commandSearchItem(env, body) {
  const q = option(body, "item");
  if (!q) return interaction("Usage: /searchitem item:angel", true);
  const r = await fetch(`${BASE_URL}/api/growtopia/items?q=${encodeURIComponent(q)}`);
  const d = await r.json();
  if (!d.success || !d.results?.length) return interaction(`🔎 No item found for \`${q}\`.`, true);
  return interaction(`🔎 **Item Search**\n\n${d.results.slice(0, 10).map(x => `• **${x.name}** — ID: \`${x.id}\``).join("\n")}`, false);
}

async function commandGetItem(env, body) {
  const id = option(body, "id");
  if (!id) return interaction("Usage: /getitem id:2", true);
  const r = await fetch(`${BASE_URL}/api/growtopia/item?id=${encodeURIComponent(id)}`);
  const d = await r.json();
  if (!d.success || !d.item) return interaction("❌ Item tidak ditemukan.", true);
  return interaction(`📦 **${d.item.name || "Unknown Item"}**\n\nID: \`${d.item.id}\`\nType: \`${d.item.type ?? "-"}\``, false);
}

async function commandPrice(env, body) {
  const q = option(body, "item");
  if (!q) return interaction("Usage: /price item:angel", true);
  const r = await fetch(`${BASE_URL}/api/growtopia/price?q=${encodeURIComponent(q)}`);
  const d = await r.json();
  if (!d.success) return interaction("❌ Harga item tidak ditemukan.", true);
  return interaction(`💰 **Price**\n\n${d.name || q}: **${d.price ?? "-"}**`, false);
}

async function commandDailyQuest(env) {
  const r = await fetch(`${BASE_URL}/api/growtopia/daily-quest`, { headers: { Accept: "application/json" } });
  const d = await r.json();
  if (!d.success) return interaction("❌ Daily Quest tidak tersedia saat ini.", true);
  return interaction(`📜 **Daily Quest**\n\n${d.quest || d.message || "No quest data."}`, false);
}

function option(body, name) {
  return body.data?.options?.find(x => x.name === name)?.value;
}

function interaction(content, ephemeral = false) {
  return json({ type: 4, data: { content, ...(ephemeral ? { flags: 64 } : {}) } });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
