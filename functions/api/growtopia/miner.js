const SOURCES = {
  detail: "https://growtopiagame.com/detail",
  website: "https://growtopiagame.com/",
  shop: "https://xsolla.growtopiagame.com/",
  forums: "https://www.growtopiagame.com/forums"
};

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") === "1";
  const results = {};
  const errors = [];
  await Promise.all([
    ...Object.entries(SOURCES).map(([name,target]) => fetchSource(name,target,refresh).then(x=>results[name]=x).catch(e=>errors.push({source:name,error:String(e?.message||e)}))),
    fetchDataset(request, refresh).then(x=>results.dataset=x).catch(e=>errors.push({source:"dataset",error:String(e?.message||e)}))
  ]);
  const data={success:Object.keys(results).length>0,generated_at:new Date().toISOString(),sources:results,errors};
  return json(data,data.success?200:502);
}

async function fetchDataset(request, refresh) {
  const target = new URL("/api/growtopia/dataset", request.url);
  target.searchParams.set("diff","1"); target.searchParams.set("limit","100");
  const response = await fetch(target, { cf: refresh ? {cacheTtl:0,cacheEverything:false} : {cacheTtl:600,cacheEverything:true} });
  if (!response.ok) throw new Error(`DATASET_HTTP_${response.status}`);
  return response.json();
}
async function fetchSource(name,target,refresh){
  const response=await fetch(target,{headers:{"User-Agent":"BILSX-Growtopia-Miner/2.0 (+https://web-d8a.pages.dev)","Accept":"text/html,application/json;q=0.9,*/*;q=0.8"},cf:refresh?{cacheTtl:0,cacheEverything:false}:{cacheTtl:300,cacheEverything:true}});
  if(!response.ok)throw new Error(`HTTP_${response.status}`);
  const text=await response.text();
  if(name==='detail')return parseDetail(text); if(name==='website')return parseWebsite(text); if(name==='shop')return parseShop(text); if(name==='forums')return parseForums(text);
  return {url:target};
}
function parseDetail(text){let data=null;try{data=JSON.parse(text);}catch(_){}if(!data)throw new Error('DETAIL_NOT_JSON');return{url:SOURCES.detail,online_user:String(data.online_user??'0'),world_day_images:data.world_day_images||null,shopLink:data.shopLink??null,ratingLogo:data.ratingLogo||null,raw_fields:Object.keys(data)};}
function parseWebsite(html){const links=unique([...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>({url:absoluteUrl(m[1],SOURCES.website),title:cleanText(m[2])})).filter(x=>x.url));const images=unique([...html.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi)].map(m=>absoluteUrl(m[1],SOURCES.website)).filter(Boolean));return{url:SOURCES.website,title:extractTitle(html),links:links.slice(0,80),images:images.slice(0,80),official_social:links.filter(x=>/twitter\.com|x\.com/i.test(x.url)).slice(0,10),forums:links.filter(x=>/forum/i.test(x.url)).slice(0,10)};}
function parseForums(html){const links=unique([...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>({url:absoluteUrl(m[1],SOURCES.forums),title:cleanText(m[2])})).filter(x=>x.url&&x.title&&x.title.length>=3));const news=links.filter(x=>/news|update|announcement|patch|event|item|release/i.test(`${x.title} ${x.url}`)).slice(0,50);return{url:SOURCES.forums,title:extractTitle(html),news,links:links.slice(0,100)};}
function parseShop(html){const text=cleanText(html),products=[],seen=new Set();for(const m of html.matchAll(/<(?:h1|h2|h3|h4|div|span)[^>]*class=["'][^"']*(?:title|name|product)[^"']*["'][^>]*>([\s\S]*?)<\/(?:h1|h2|h3|h4|div|span)>/gi)){const name=cleanText(m[1]);if(name&&name.length>=2&&name.length<=100&&!seen.has(name.toLowerCase())){seen.add(name.toLowerCase());products.push({name});}}const images=unique([...html.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi)].map(m=>absoluteUrl(m[1],SOURCES.shop)).filter(Boolean));return{url:SOURCES.shop,products:products.slice(0,100),images:images.slice(0,100),text_sample:text.slice(0,1200)};}
function extractTitle(html){const m=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);return m?cleanText(m[1]):"Growtopia";}
function cleanText(v){return String(v||"").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim();}
function absoluteUrl(value,base){try{return new URL(value,base).href;}catch(_){return null;}}
function unique(arr){return[...new Set(arr)];}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"public, max-age=300, stale-while-revalidate=900"}});}
