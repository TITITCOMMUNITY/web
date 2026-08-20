const MAX_LEVEL=125;
function xpForLevel(level){return 50*(level*level+2);}
export async function onRequestGet({request}){
 const u=new URL(request.url),current=clampInt(u.searchParams.get("current"),0,124),target=clampInt(u.searchParams.get("target"),1,MAX_LEVEL);
 const currentXp=Math.max(0,Number(u.searchParams.get("xp")||0)),ghostXp=Math.max(1,Number(u.searchParams.get("ghostXp")||230));
 const pack=Math.max(1,clampInt(u.searchParams.get("pack"),200,100000)),price=Math.max(0,Number(u.searchParams.get("price")||0));
 if(target<=current)return json({success:false,error:"TARGET_MUST_BE_HIGHER"},400);
 const levels=[];let total=0;for(let level=current+1;level<=target;level++){const xp=xpForLevel(level);total+=xp;levels.push({level,xp,total_xp:total});}
 total=Math.max(0,total-currentXp);const jars=Math.ceil(total/ghostXp),packs=Math.ceil(jars/pack);
 return json({success:true,current_level:current,target_level:target,current_xp:currentXp,xp_needed:total,ghost_xp:ghostXp,ghost_jars:jars,jar_packs:packs,pack_size:pack,pack_price_wl:price,cost_wl:packs*price,levels});
}
function clampInt(v,min,max){const n=Number.parseInt(v,10);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):min;}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"public, max-age=60"}});}
