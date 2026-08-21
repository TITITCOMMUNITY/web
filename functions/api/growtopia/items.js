const WIKI_API = "https://growtopia.fandom.com/api.php";

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const version = (url.searchParams.get("version") || "latest").trim();
  if (q.length < 2 || q.length > 80) return json({success:false,error:"QUERY_TOO_SHORT_OR_LONG"},400);

  try {
    const datasetUrl = new URL("/api/growtopia/dataset", request.url);
    datasetUrl.searchParams.set("q", q);
    datasetUrl.searchParams.set("version", version);
    datasetUrl.searchParams.set("limit", "40");
    const dsResp = await fetch(datasetUrl, { cf:{cacheTtl:300,cacheEverything:true} });
    if (!dsResp.ok) return json({success:false,error:`DATASET_HTTP_${dsResp.status}`},502);
    const dataset = await dsResp.json();
    const items = Array.isArray(dataset.results) ? dataset.results : [];
    if (!items.length) return json({success:true,query:q,version:dataset.version,results:[],source:"decoded items.dat"});

    const wiki = await enrichWiki(items.slice(0, 20));
    const results = items.map(item => {
      const w = wiki.get(item.name.toLowerCase());
      const image = w?.image || null;
      return {
        id:item.id,
        title:item.name,
        description:w?.description || "Decoded from items.dat. Wiki description not available.",
        image,
        source_url:w?.source_url || `https://growtopia.fandom.com/wiki/${encodeURIComponent(item.name.replace(/ /g,"_"))}`,
        download_url:image ? `/api/growtopia/image?url=${encodeURIComponent(image)}` : null,
        file_name:item.file_name,
        type:item.type,
        tex_x:item.tex_x,
        tex_y:item.tex_y,
        spread_type:item.spread_type,
        version:dataset.version,
        data_source:"items.dat"
      };
    });
    return json({success:true,query:q,version:dataset.version,results,source:"Growtopia decoded items.dat + Wiki enrichment",cached_for_seconds:300});
  } catch(error) {
    return json({success:false,error:String(error?.message||error)},502);
  }
}

async function enrichWiki(items) {
  const map = new Map();
  const titles = items.map(x => x.name).filter(Boolean);
  if (!titles.length) return map;
  try {
    const api = new URL(WIKI_API);
    api.searchParams.set("action","query");
    api.searchParams.set("format","json");
    api.searchParams.set("prop","extracts|pageimages|info");
    api.searchParams.set("explaintext","1");
    api.searchParams.set("exintro","1");
    api.searchParams.set("exchars","700");
    api.searchParams.set("piprop","thumbnail");
    api.searchParams.set("pithumbsize","256");
    api.searchParams.set("inprop","url");
    api.searchParams.set("titles",titles.join("|"));
    api.searchParams.set("redirects","1");
    const r = await fetch(api,{headers:{"User-Agent":"BILSX-Growtopia-API/4.0"},cf:{cacheTtl:900,cacheEverything:true}});
    if (!r.ok) return map;
    const data=await r.json();
    for(const x of Object.values(data.query?.pages||{})) {
      if(!x.title) continue;
      map.set(String(x.title).toLowerCase(),{description:String(x.extract||"").trim(),image:x.thumbnail?.source||null,source_url:x.fullurl||null});
    }
  } catch (_) {}
  return map;
}

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"public, max-age=300, stale-while-revalidate=900"}});}
