const WIKI_API = "https://growtopia.fandom.com/api.php";

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (q.length < 2 || q.length > 80) return json({success:false,error:"QUERY_TOO_SHORT_OR_LONG"},400);
  try {
    const api = new URL(WIKI_API);
    api.searchParams.set("action","query"); api.searchParams.set("generator","search");
    api.searchParams.set("gsrsearch",q); api.searchParams.set("gsrnamespace","0"); api.searchParams.set("gsrlimit","12");
    api.searchParams.set("prop","extracts|pageimages|info"); api.searchParams.set("exintro","1"); api.searchParams.set("explaintext","1"); api.searchParams.set("exchars","700");
    api.searchParams.set("piprop","thumbnail"); api.searchParams.set("pithumbsize","240"); api.searchParams.set("inprop","url"); api.searchParams.set("format","json"); api.searchParams.set("origin","*");
    const response = await fetch(api,{headers:{"User-Agent":"BILSX-Growtopia-API/3.0"},cf:{cacheTtl:300,cacheEverything:true}});
    if(!response.ok)return json({success:false,error:`WIKI_HTTP_${response.status}`},502);
    const data=await response.json();
    const results=Object.values(data.query?.pages||{}).sort((a,b)=>(a.index||0)-(b.index||0)).map(x=>({
      title:x.title,page_id:x.pageid,description:String(x.extract||"").trim(),image:x.thumbnail?.source||null,
      source_url:x.fullurl||null,
      download_url:x.thumbnail?.source ? `/api/growtopia/image?url=${encodeURIComponent(x.thumbnail.source)}` : null
    }));
    return json({success:true,query:q,results,source:"Growtopia Wiki data API",cached_for_seconds:300});
  }catch(error){return json({success:false,error:String(error?.message||error)},502);}
}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"public, max-age=300, stale-while-revalidate=600"}});}
