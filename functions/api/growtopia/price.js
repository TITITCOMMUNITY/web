export async function onRequestGet({ request, env }) {
  const item = (new URL(request.url).searchParams.get("item") || "").trim();
  if (!item) return json({ success:false, error:"ITEM_REQUIRED" },400);
  const source = String(env.PRICE_API_URL || "").trim();
  if (!source) return json({ success:false, configured:false, error:"PRICE_SOURCE_NOT_CONFIGURED", item },503);
  try {
    const u = new URL(source); u.searchParams.set("item", item);
    const r = await fetch(u, { headers:{"Accept":"application/json","User-Agent":"BILSX-Price-Engine/1.0"} });
    const data = await r.json();
    if (!r.ok) return json({success:false,error:`PRICE_SOURCE_HTTP_${r.status}`},502);
    return json(data);
  } catch (error) { return json({success:false,error:String(error?.message||error)},502); }
}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"public,max-age=30"}});}
