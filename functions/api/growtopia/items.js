const WIKI_API = "https://growtopia.fandom.com/api.php";

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (q.length < 2 || q.length > 80) return json({ success: false, error: "QUERY_TOO_SHORT_OR_LONG" }, 400);

  try {
    const searchUrl = new URL(WIKI_API);
    searchUrl.searchParams.set("action", "query");
    searchUrl.searchParams.set("list", "search");
    searchUrl.searchParams.set("srsearch", q);
    searchUrl.searchParams.set("srnamespace", "0");
    searchUrl.searchParams.set("srlimit", "8");
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("origin", "*");

    const response = await fetch(searchUrl, { headers: { "User-Agent": "BILSX-Growtopia-API/1.0" } });
    if (!response.ok) return json({ success: false, error: `WIKI_HTTP_${response.status}` }, 502);
    const data = await response.json();
    const results = (data.query?.search || []).map(x => ({
      title: x.title,
      snippet: stripHtml(x.snippet || ""),
      url: `https://growtopia.fandom.com/wiki/${encodeURIComponent(String(x.title).replace(/ /g, "_"))}`
    }));
    return json({ success: true, query: q, results, source: "Growtopia Wiki" });
  } catch (error) {
    return json({ success: false, error: String(error?.message || error) }, 502);
  }
}

function stripHtml(value) { return String(value).replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim(); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60" } }); }
