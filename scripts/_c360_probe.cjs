const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
function loadEnv(p){const e={};for(const l of fs.readFileSync(p,"utf8").split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith("#"))continue;const i=t.indexOf("=");if(i<0)continue;e[t.slice(0,i).trim()]=t.slice(i+1).trim()}return e}
const env=loadEnv(path.join(process.cwd(),".env.local"));
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
async function q(table,sel="*",opts={}){
  let req=db.from(table).select(sel,opts);
  return await req;
}
(async()=>{
  // check for client_360_column_config
  const tables=["client_360_column_config","client_360_field_mappings","client_360_clients","client_360_client_aliases","client_360_daily_snapshot","boards","columns","records","cell_values"];
  for(const t of tables){
    const r=await db.from(t).select("*",{count:"exact",head:true});
    console.log("TABLE",t,"err",r.error?.message||null,"count",r.count);
  }
  // sample column_config/field_mappings
  const fm=await db.from("client_360_field_mappings").select("*").limit(50);
  console.log("FM",JSON.stringify(fm.data||fm.error));
  const cc=await db.from("client_360_column_config").select("*").limit(50);
  console.log("CC",JSON.stringify(cc.data||cc.error));
})().catch(e=>{console.error(e);process.exit(1)});
