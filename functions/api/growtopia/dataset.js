const GH_API = "https://api.github.com/repos/kabuokis/growtopia-data/contents";
const RAW = "https://raw.githubusercontent.com/kabuokis/growtopia-data/main";
const CACHE_TTL = 600;

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const requested = (url.searchParams.get("version") || "latest").trim();
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const diff = url.searchParams.get("diff") === "1";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);

  try {
    const versions = await getVersions();
    if (!versions.length) throw new Error("NO_DATA_VERSIONS");
    const version = requested === "latest" ? versions[0] : normalizeVersion(requested, versions);
    if (!version) return json({ success:false, error:"VERSION_NOT_FOUND", versions }, 404);

    const latestText = await fetchDecoded(version);
    const latestItems = parseItems(latestText, q, limit);
    const stats = getStats(latestText);

    let changes = null;
    if (diff) {
      const previous = versions[1];
      if (previous) {
        const previousText = await fetchDecoded(previous);
        changes = diffItems(previousText, latestText, 200);
      }
    }

    return json({
      success: true,
      source: "kabuokis/growtopia-data decoded items.dat",
      generated_at: new Date().toISOString(),
      version,
      previous_version: versions[1] || null,
      available_versions: versions,
      stats,
      results: latestItems,
      changes
    });
  } catch (error) {
    return json({ success:false, error:String(error?.message || error) }, 502);
  }
}

async function getVersions() {
  const response = await fetch(`${GH_API}?ref=main`, {
    headers: { "Accept":"application/vnd.github+json", "User-Agent":"BILSX-Growtopia-Miner/2.0" },
    cf: { cacheTtl: CACHE_TTL, cacheEverything: true }
  });
  if (!response.ok) throw new Error(`VERSIONS_HTTP_${response.status}`);
  const entries = await response.json();
  return entries.filter(x => x.type === "dir" && /^\d+\.\d+\.?$/.test(x.name))
    .map(x => x.name)
    .sort((a,b) => versionNumber(b) - versionNumber(a));
}

function normalizeVersion(v, versions) {
  if (versions.includes(v)) return v;
  if (versions.includes(`${v}.`)) return `${v}.`;
  if (versions.includes(v.replace(/\.$/, ""))) return v.replace(/\.$/, "");
  return null;
}

function versionNumber(v) {
  const m = v.match(/^(\d+)\.(\d+)/);
  return m ? Number(m[1]) * 1000 + Number(m[2]) : 0;
}

async function fetchDecoded(version) {
  const response = await fetch(`${RAW}/${encodeURIComponent(version)}/decoded/items.dat.txt`, {
    headers: { "User-Agent":"BILSX-Growtopia-Miner/2.0" },
    cf: { cacheTtl: CACHE_TTL, cacheEverything: true }
  });
  if (!response.ok) throw new Error(`ITEMS_DATA_HTTP_${response.status}`);
  return response.text();
}

function parseLine(line) {
  const p = line.split("|").map(x => x.trim());
  if (p.length < 6 || !/^\d+$/.test(p[0])) return null;
  return {
    id: Number(p[0]),
    type: Number(p[2]) || 0,
    name: p[4] || "",
    file_name: p[5] || "",
    tex_x: Number(p[9]) || 0,
    tex_y: Number(p[10]) || 0,
    spread_type: Number(p[11]) || 0,
    layer: Number(p[12]) || 0,
    collision: Number(p[13]) || 0,
    clothing_type: Number(p[16]) || 0,
    bg_col: Number(p[30]) || 0,
    bloom_time: Number(p[34]) || 0
  };
}

function parseItems(text, q, limit) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("id ")) continue;
    if (q && !line.toLowerCase().includes(q)) continue;
    const item = parseLine(line);
    if (!item || !item.name || item.name === "Blank") continue;
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

function getStats(text) {
  let count = 0, lastId = 0;
  for (const line of text.split(/\r?\n/)) {
    const item = parseLine(line);
    if (!item || !item.name) continue;
    count++;
    if (item.id > lastId) lastId = item.id;
  }
  return { item_count: count, last_id: lastId, bytes: new TextEncoder().encode(text).length };
}

function diffItems(oldText, newText, limit) {
  const old = new Map();
  for (const line of oldText.split(/\r?\n/)) {
    const item = parseLine(line);
    if (item && item.name) old.set(item.id, item);
  }
  const added = [];
  const changed = [];
  for (const line of newText.split(/\r?\n/)) {
    const item = parseLine(line);
    if (!item || !item.name) continue;
    const prev = old.get(item.id);
    if (!prev) added.push(item);
    else if (prev.name !== item.name || prev.file_name !== item.file_name || prev.type !== item.type) {
      changed.push({ before: prev, after: item });
    }
    if (added.length >= limit && changed.length >= limit) break;
  }
  return { added: added.slice(0, limit), changed: changed.slice(0, limit) };
}

function json(data, status=200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type":"application/json; charset=utf-8",
      "Cache-Control":`public, max-age=${CACHE_TTL}, stale-while-revalidate=1800`
    }
  });
}
