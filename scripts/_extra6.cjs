const fs=require("fs"),path=require("path");
const {createClient}=require("@supabase/supabase-js");
function loadEnv(p){const e={};for(const l of fs.readFileSync(p,"utf8").split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith("#"))continue;const i=t.indexOf("=");if(i<0)continue;e[t.slice(0,i).trim()]=t.slice(i+1).trim()}return e}
const env=loadEnv(path.join(process.cwd(),".env.local"));
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
const ORG="org-1792039761662-m59i0f8";
const norm=s=>String(s??"").toLowerCase().replace(/[’']/g,"").replace(/&/g,"and").replace(/[_-]+/g," ").replace(/\s+/g," ").trim();
async function all(table,cols,filters=[]){let out=[],from=0;for(;;){let q=db.from(table).select(cols).range(from,from+999);for(const f of filters)q=f(q);const {data,error}=await q;if(error)throw {table,error};out=out.concat(data||[]);if(!data||data.length<1000)break;from+=1000;}return out;}
function cellText(col,cv){
  if(!cv) return ""; let raw=""; const val=cv.value; const settings=col?.settings||{};
  if(val==null) raw=cv.value_text||""; else if(typeof val==="string") raw=val; else if(typeof val==="number"||typeof val==="boolean") raw=String(val);
  else if(Array.isArray(val)) raw=val.map(x=>typeof x==="object"?(x.label||x.name||x.text||x.value||JSON.stringify(x)):String(x)).join(", ");
  else if(typeof val==="object"){ if(col?.type==="timeline") raw=val.start||val.end||""; else raw=val.label||val.name||val.text||val.title||val.value||(cv.value_text||""); }
  else raw=String(val); raw=String(raw||cv.value_text||"").trim();
  if(col && ["status","priority","dropdown","multi_select"].includes(col.type)){
    const opts=Array.isArray(settings.labels)?settings.labels:settings.options;
    if(Array.isArray(opts)){ const resolve=v=>{const vs=String(v??"");for(const o of opts){if(o&&(String(o.id)===vs||String(o.value)===vs||String(o.label)===vs))return String(o.label||o.value||o.id);}return null;};
      if(Array.isArray(val)){const labs=val.map(resolve).filter(Boolean); if(labs.length) raw=labs.join(", ");} else {const lab=resolve(val??raw); if(lab) raw=lab;} }
  } return raw;
}
(async()=>{
  const extra=["board-1792047259966-qpmvnh6","board-1792039790753-5o1nfgh","3ba6c406-7b1e-4c25-ba01-6144da60d5ff","f38771a6-69e5-491a-b9bd-9cf35f116fe2","b768cfeb-3c4f-451a-aa58-1d5e79d318e2","60370ba1-f6e6-4a3c-acb4-d9158e32b6e1"];
  const boardsAny=await db.from("boards").select("*").in("id",extra);
  const colsExtra=await all("columns","id,board_id,label,type,settings,sort_order,group_id,key",[q=>q.in("board_id",extra)]);
  const maps=await all("client_360_field_mappings","*",[q=>q.eq("organization_id",ORG)]);
  const recs=await all("records","id,board_id,status",[q=>q.eq("organization_id",ORG)]);
  const cells=await all("cell_values","record_id,column_id,value,value_text,board_id",[q=>q.in("board_id",extra).eq("organization_id",ORG)]);
  const colById=new Map(colsExtra.map(c=>[c.id,c]));
  const cellIdx=new Map(); for(const cv of cells){ cellIdx.set(`${cv.board_id}:${cv.record_id}:${cv.column_id}`,cv); }
  const clientMap=new Map(maps.filter(m=>m.field_type==="client").map(m=>[m.board_id,m.resolved_column_ref]));
  const statusMap=new Map(maps.filter(m=>m.field_type==="status").map(m=>[m.board_id,m.resolved_column_ref]));
  const safariNames=new Set(["safari","safari select","safari-genie"]);
  const levisNames=new Set(["levis","levi's","levis strauss & co","levis strauss and co"]);
  function rawClient(bid,rid){ const cid=clientMap.get(bid); if(!cid) return null; return cellText(colById.get(cid), cellIdx.get(`${bid}:${rid}:${cid}`)); }
  const inv={};
  for(const id of extra){
    const br=recs.filter(r=>r.board_id===id);
    let lev=0,saf=0; for(const r of br.filter(r=>r.status==="active")){ const n=norm(rawClient(id,r.id)||""); if(levisNames.has(n)) lev++; if(safariNames.has(n)) saf++; }
    const counts={active:0,archived:0,total:0}; for(const r of br){counts.total++; if(r.status==="active")counts.active++; else if(r.status==="archived")counts.archived++;}
    const sc=statusMap.get(id); const sCol=colById.get(sc); const sCounts={}; if(sc){ for(const r of br.filter(r=>r.status==="active")){ const v=cellText(sCol,cellIdx.get(`${id}:${r.id}:${sc}`)); const k=v===""?"(empty)":v; sCounts[k]=(sCounts[k]||0)+1; } }
    inv[id]={boardRow:boardsAny.data?.find(b=>b.id===id)||null,counts,clientMapped:clientMap.has(id),clientColId:clientMap.get(id)||null,statusCol:sCol?{label:sCol.label,id:sCol.id,type:sCol.type}:null,statusCounts:sCounts,levis:lev,safari:saf,columns:colsExtra.filter(c=>c.board_id===id&&!c.group_id).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)).map(c=>({label:c.label,type:c.type,id:c.id,key:c.key}))};
  }
  console.log(JSON.stringify(inv,null,2));
})().catch(e=>{console.error(e);process.exit(1)});
