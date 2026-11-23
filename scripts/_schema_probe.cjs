const fs=require("fs"),path=require("path");
const {createClient}=require("@supabase/supabase-js");
function loadEnv(p){const e={};for(const l of fs.readFileSync(p,"utf8").split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith("#"))continue;const i=t.indexOf("=");if(i<0)continue;e[t.slice(0,i).trim()]=t.slice(i+1).trim()}return e}
const env=loadEnv(path.join(process.cwd(),".env.local"));
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
const ORG="org-1792039761662-m59i0f8";
const norm=s=>String(s??"").toLowerCase().replace(/[’']/g,"").replace(/&/g,"and").replace(/[_-]+/g," ").replace(/\s+/g," ").trim();
async function all(table,cols,filters=[]){let out=[],from=0;for(;;){let q=db.from(table).select(cols).range(from,from+999);for(const f of filters)q=f(q);const {data,error}=await q;if(error)throw {table,error};out=out.concat(data||[]);if(!data||data.length<1000)break;from+=1000;}return out;}
(async()=>{
  // unique constraint on client_360_field_mappings
  const {data:cons,error:cerr}=await db.rpc("exec_sql",{sql:"select conname, contype, pg_get_constraintdef(c.oid) as def from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and t.relname='client_360_field_mappings'"});
  // fallback: try information_schema via direct not possible; try pg_indexes
  const {data:idx}=await db.rpc("exec_sql",{sql:"select indexname,indexdef from pg_indexes where schemaname='public' and tablename='client_360_field_mappings'"});
  // refresh function text (alias seeding logic)
  const {data:fn}=await db.rpc("exec_sql",{sql:"select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='seed_client_360_client_aliases'"});
  console.log(JSON.stringify({cons,cerr,idx,fnSnippet: fn && fn[0] ? String(fn[0].prosrc).slice(0,4000):fn},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
