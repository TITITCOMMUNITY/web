export async function onRequestGet({ env }) {
  const source = String(env.DAILY_QUEST_URL || "").trim();
  if (!source) return json({ success:false, configured:false, error:"DAILY_QUEST_SOURCE_NOT_CONFIGURED" },503);
  try {
    const r = await fetch(source,{headers:{"Accept":"application/json","User-Agent":"BILSX-Daily-Quest/1.0"}});
    const data = await r.json();
    if(!r.ok) return json({success:false,error:`DQ_SOURCE_HTTP_${r.status}`},502);
    return json(data);
  } catch(error){return json({success:false,error:String(error?.message||error)},502);}
}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"public,max-age=60"}});}
