const SOURCES = {
  android: "https://play.google.com/store/apps/details?id=com.rtsoft.growtopia",
  ios: "https://apps.apple.com/app/growtopia/id590495115",
  windows: "https://www.growtopiagame.com/Growtopia-Installer.exe",
  official: "https://www.growtopiagame.com/"
};

export async function onRequestGet({ request }) {
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  const results = {};
  const errors = [];
  await Promise.all(Object.entries(SOURCES).map(async ([platform, url]) => {
    try {
      const r = await fetch(url, {
        redirect: "follow",
        headers: { "User-Agent": "BILSX-Version-Monitor/1.0", "Accept": "text/html,application/octet-stream;q=0.9,*/*;q=0.8" },
        cf: refresh ? { cacheTtl: 0, cacheEverything: false } : { cacheTtl: 1800, cacheEverything: true }
      });
      const finalUrl = r.url || url;
      const text = platform === "windows" ? "" : await r.text();
      results[platform] = {
        source_url: url,
        final_url: finalUrl,
        http_status: r.status,
        ok: r.ok,
        version: extractVersion(platform, text, finalUrl),
        detected_at: new Date().toISOString()
      };
    } catch (e) {
      errors.push({ platform, error: String(e?.message || e) });
    }
  }));
  return json({ success: Object.keys(results).length > 0, generated_at: new Date().toISOString(), sources: results, errors });
}

function extractVersion(platform, text, finalUrl) {
  if (platform === "ios") {
    const m = text.match(/(?:Version|versi[oó]n)\s*([0-9]+(?:\.[0-9]+)+)/i);
    return m ? m[1] : null;
  }
  if (platform === "android") {
    const m = text.match(/(?:Current Version|Versi saat ini|Version)\s*[^0-9]{0,20}([0-9]+(?:\.[0-9]+)+)/i);
    return m ? m[1] : null;
  }
  if (platform === "windows") return finalUrl.includes("Growtopia-Installer") ? "official-installer" : null;
  return null;
}

function json(data, status=200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"public,max-age=900,stale-while-revalidate=3600" } });
}
