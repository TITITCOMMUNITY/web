export async function onRequestGet({ request, env }) {
  const item = (new URL(request.url).searchParams.get("item") || "").trim();
  if (!item) return json({ success:false, error:"ITEM_REQUIRED" },400);

  // Preferred source: GTID's own machine-readable price endpoint.
  // The public GTID page exposes the DL tracker, but does not document its API URL.
  // Keep the endpoint configurable instead of hard-coding an unverified/guessed route.
  const source = String(env.GTID_PRICE_API_URL || env.PRICE_API_URL || "").trim();
  if (!source) return json({ success:false, configured:false, provider:"GTID", error:"GTID_PRICE_API_NOT_CONFIGURED", item,
    message:"Set GTID_PRICE_API_URL to the GTID machine-readable price endpoint." },503);

  try {
    const u = new URL(source);
    u.searchParams.set("item", item);
    const r = await fetch(u, {
      headers:{"Accept":"application/json","User-Agent":"BILSX-Price-Engine/2.0"},
      cf:{cacheTtl:30,cacheEverything:true}
    });
    const text = await r.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) { return json({success:false,error:"GTID_INVALID_JSON",provider:"GTID",http_status:r.status},502); }
    if (!r.ok) return json({success:false,error:`GTID_HTTP_${r.status}`,provider:"GTID",data},502);
    return json(normalize(data,item));
  } catch (error) { return json({success:false,error:String(error?.message||error),provider:"GTID"},502); }
}

function normalize(data,item){
  const d=data?.data ?? data?.result ?? data;
  return {
    success:true,
    provider:"GTID",
    item_name:d?.item_name ?? d?.name ?? item,
    buy:d?.buy ?? d?.buy_price ?? d?.buyPrice ?? d?.market?.buy ?? null,
    sell:d?.sell ?? d?.sell_price ?? d?.sellPrice ?? d?.market?.sell ?? null,
    estimate:d?.estimate ?? d?.average ?? d?.price ?? d?.market?.price ?? null,
    confidence:d?.confidence ?? null,
    updated_at:d?.updated_at ?? d?.updatedAt ?? d?.timestamp ?? null,
    raw:data
  };
}

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"public,max-age=30,stale-while-revalidate=60"}});}
