const ALLOWED_HOSTS = new Set([
  "growtopiagame.com",
  "www.growtopiagame.com",
  "xsolla.growtopiagame.com",
  "growtopia.fandom.com",
  "static.wikia.nocookie.net",
  "s3.eu-west-1.amazonaws.com"
]);

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");
  if (!target) return new Response("Missing url", {status:400});

  let parsed;
  try { parsed = new URL(target); } catch (_) { return new Response("Invalid url", {status:400}); }
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) {
    return new Response("Host not allowed", {status:403});
  }

  const upstream = await fetch(parsed.href, {
    headers: { "User-Agent": "BILSX-Growtopia-Image/1.0" },
    cf: { cacheTtl: 86400, cacheEverything: true }
  });
  if (!upstream.ok) return new Response(`Upstream HTTP ${upstream.status}`, {status:502});

  const headers = new Headers(upstream.headers);
  headers.set("Cache-Control", "public, max-age=86400, immutable");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Content-Disposition", "attachment; filename=\"growtopia-image\"");
  return new Response(upstream.body, {status:200, headers});
}
