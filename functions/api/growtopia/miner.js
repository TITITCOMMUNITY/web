const SOURCES = {
  detail: "https://growtopiagame.com/detail",
  website: "https://growtopiagame.com/",
  shop: "https://xsolla.growtopiagame.com/"
};

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") === "1";
  const results = {};
  const errors = [];

  await Promise.all([
    fetchSource("detail", SOURCES.detail, refresh).then(x => results.detail = x).catch(e => errors.push({source:"detail", error:String(e?.message || e)})),
    fetchSource("website", SOURCES.website, refresh).then(x => results.website = x).catch(e => errors.push({source:"website", error:String(e?.message || e)})),
    fetchSource("shop", SOURCES.shop, refresh).then(x => results.shop = x).catch(e => errors.push({source:"shop", error:String(e?.message || e)}))
  ]);

  const data = {
    success: Object.keys(results).length > 0,
    generated_at: new Date().toISOString(),
    sources: results,
    errors
  };

  return json(data, data.success ? 200 : 502);
}

async function fetchSource(name, target, refresh) {
  const response = await fetch(target, {
    headers: {
      "User-Agent": "BILSX-Growtopia-Miner/1.0 (+https://web-d8a.pages.dev)",
      "Accept": "text/html,application/json;q=0.9,*/*;q=0.8"
    },
    cf: refresh ? { cacheTtl: 0, cacheEverything: false } : { cacheTtl: 300, cacheEverything: true }
  });

  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (name === "detail") return parseDetail(text, contentType);
  if (name === "website") return parseWebsite(text);
  if (name === "shop") return parseShop(text);
  return { url: target };
}

function parseDetail(text, contentType) {
  let data = null;
  try { data = JSON.parse(text); } catch (_) {}
  if (!data) throw new Error("DETAIL_NOT_JSON");
  return {
    url: SOURCES.detail,
    online_user: String(data.online_user ?? "0"),
    world_day_images: data.world_day_images || null,
    shopLink: data.shopLink ?? null,
    ratingLogo: data.ratingLogo || null,
    raw_fields: Object.keys(data)
  };
}

function parseWebsite(html) {
  const links = unique([...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>/gi)].map(m => ({
    url: absoluteUrl(m[1], SOURCES.website),
    title: cleanText(m[2])
  })).filter(x => x.url));

  const images = unique([...html.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi)].map(m => absoluteUrl(m[1], SOURCES.website)).filter(Boolean));

  const twitter = links.filter(x => /twitter\.com|x\.com/i.test(x.url));
  const forums = links.filter(x => /forum/i.test(x.url));

  return {
    url: SOURCES.website,
    title: extractTitle(html),
    links: links.slice(0, 80),
    images: images.slice(0, 80),
    official_social: twitter.slice(0, 10),
    forums: forums.slice(0, 10)
  };
}

function parseShop(html) {
  const text = cleanText(html);
  const products = [];
  const seen = new Set();

  // Xsolla's markup changes over time, so mine visible product headings conservatively.
  for (const m of html.matchAll(/<(?:h1|h2|h3|h4|div|span)[^>]*class=["'][^"']*(?:title|name|product)[^"']*["'][^>]*>([\\s\\S]*?)<\\/(?:h1|h2|h3|h4|div|span)>/gi)) {
    const name = cleanText(m[1]);
    if (name && name.length >= 2 && name.length <= 100 && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      products.push({ name });
    }
  }

  const images = unique([...html.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi)].map(m => absoluteUrl(m[1], SOURCES.shop)).filter(Boolean));
  return { url: SOURCES.shop, products: products.slice(0, 100), images: images.slice(0, 100), text_sample: text.slice(0, 1200) };
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\\s\\S]*?)<\\/title>/i);
  return m ? cleanText(m[1]) : "Growtopia";
}
function cleanText(v) { return String(v || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\\s+/g, " ").trim(); }
function absoluteUrl(value, base) {
  try { return new URL(value, base).href; } catch (_) { return null; }
}
function unique(arr) { return [...new Set(arr)]; }
function json(data, status=200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"public, max-age=300, stale-while-revalidate=600" } });
}
