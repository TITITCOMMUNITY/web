const DETAIL_URL = "https://growtopiagame.com/detail";

export async function onRequestGet({ request }) {
  const started = Date.now();
  try {
    const response = await fetch(DETAIL_URL, {
      headers: { "User-Agent": "BILSX-Growtopia-Status/1.0" },
      cf: { cacheTtl: 15, cacheEverything: true }
    });
    if (!response.ok) return json({ success: false, status: "unavailable", error: `GROW_TOPIA_HTTP_${response.status}` }, 502);
    const data = await response.json();
    const online = Number.parseInt(String(data.online_user ?? ""), 10);
    if (!Number.isFinite(online)) return json({ success: false, status: "unavailable", error: "INVALID_ONLINE_COUNT" }, 502);
    return json({
      success: true,
      status: online > 0 ? "online" : "maintenance_or_empty",
      online,
      world_day_image: data.world_day_images?.full_size || null,
      shop_available: String(data.shopLink) === "true",
      updated_at: Date.now(),
      latency_ms: Date.now() - started
    });
  } catch (error) {
    return json({ success: false, status: "unavailable", error: String(error?.message || error) }, 502);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=10, s-maxage=15" } });
}
