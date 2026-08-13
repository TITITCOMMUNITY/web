export async function onRequestGet({env}){try{const r=await env.DB.prepare("SELECT COUNT(*) AS total FROM users").first();return json({success:true,database:"connected",users:Number(r?.total??0)})}catch(e){return json({success:false,error:String(e)},500)}}
function json(x,s=200){return new Response(JSON.stringify(x),{status:s,headers:{"Content-Type":"application/json"}})}
