export async function onRequestPost({ request, env }) {
  try {
    const secret = String(env.DISCORD_COMMAND_SYNC_SECRET || "").trim();
    const auth = request.headers.get("Authorization") || "";
    const supplied = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!secret) return json({ success: false, error: "COMMAND_SYNC_NOT_CONFIGURED" }, 500);
    if (!supplied || !timingSafeEqual(supplied, secret)) return json({ success: false, error: "UNAUTHORIZED" }, 401);
    return json(await registerCommands(env));
  } catch (error) {
    console.error("DISCORD COMMAND SYNC ERROR", error);
    return json({ success: false, error: "COMMAND_SYNC_FAILED" }, 500);
  }
}

async function registerCommands(env) {
  const token = String(env.DISCORD_BOT_TOKEN || "").trim();
  const applicationId = String(env.DISCORD_APPLICATION_ID || "").trim();
  if (!token || !applicationId) return { success: false, error: "DISCORD_BOT_NOT_CONFIGURED" };

  const commands = [
    { name:"status", description:"Show live Growtopia server status", type:1 },
    { name:"searchitem", description:"Search Growtopia items", type:1, options:[{name:"item",description:"Item name",type:3,required:true}] },
    { name:"getitem", description:"Show Growtopia item information", type:1, options:[{name:"item",description:"Exact or partial item name",type:3,required:true}] },
    { name:"price", description:"Show estimated item price", type:1, options:[{name:"item",description:"Item name",type:3,required:true}] },
    { name:"dq", description:"Show today's Daily Quest information", type:1 },
    { name:"user", description:"View a BILSX user account", type:1, options:[{name:"username",description:"BILSX username",type:3,required:true}] },
    { name:"getkey", description:"View a user's Free Key and Linkvertise claim link", type:1, options:[{name:"user",description:"BILSX username",type:3,required:true}] },
    { name:"register", description:"Create a BILSX user account", type:1, options:[{name:"username",description:"Username",type:3,required:true},{name:"email",description:"Email address",type:3,required:true},{name:"password",description:"Initial password",type:3,required:true}] },
    { name:"setpassword", description:"Reset a BILSX user's password", type:1, options:[{name:"username",description:"BILSX username",type:3,required:true},{name:"password",description:"New password",type:3,required:true}] }
  ];

  const guildId = String(env.DISCORD_GUILD_ID || "").trim();
  const endpoint = guildId
    ? `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`
    : `https://discord.com/api/v10/applications/${applicationId}/commands`;
  const response = await fetch(endpoint, { method:"PUT", headers:{Authorization:`Bot ${token}`,"Content-Type":"application/json"}, body:JSON.stringify(commands) });
  const text = await response.text();
  if (!response.ok) {
    console.error("DISCORD COMMAND SYNC FAILED", response.status, text.slice(0,1000));
    return { success:false, error:"DISCORD_API_REJECTED", status:response.status };
  }
  let registered = [];
  try { registered = JSON.parse(text); } catch {}
  return { success:true, scope:guildId ? "guild" : "global", count:Array.isArray(registered) ? registered.length : commands.length };
}

function timingSafeEqual(a,b){const aa=new TextEncoder().encode(a),bb=new TextEncoder().encode(b);if(aa.length!==bb.length)return false;let result=0;for(let i=0;i<aa.length;i++)result|=aa[i]^bb[i];return result===0;}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});}
