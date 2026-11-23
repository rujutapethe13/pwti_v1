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
  const boards=await all("boards","id,name,slug,status,organization_id,workspace_id,created_at,updated_at,archived_at,visibility",[q=>q.eq("organization_id",ORG)]);
  const workspaces=await all("workspaces","id,name,organization_id,archived_at,status");
  const wsById=new Map(workspaces.map(w=>[w.id,w]));
  const colsAll=await all("columns","id,board_id,label,type,settings,sort_order,group_id",[q=>q.eq("organization_id",ORG)]);
  const recsAll=await all("records","id,board_id,status,title,group_id",[q=>q.eq("organization_id",ORG)]);
  const maps=await all("client_360_field_mappings","*",[q=>q.eq("organization_id",ORG)]);
  const clients=await all("client_360_clients","id,canonical_name,needs_confirmation",[q=>q.eq("organization_id",ORG)]);
  const aliases=await all("client_360_client_aliases","id,client_id,alias_text",[q=>q.eq("organization_id",ORG)]);
  const snapshot=await all("client_360_daily_snapshot","record_id,board_id,client_id",[q=>q.eq("organization_id",ORG)]);
  const boardIds=boards.map(b=>b.id);
  // we need cells for: client cols, status cols, item name on Oct, and for generic clients location
  const clientMaps=maps.filter(m=>m.field_type==="client");
  const statusMaps=maps.filter(m=>m.field_type==="status");
  const neededColIds=[...new Set([...clientMaps.map(m=>m.resolved_column_ref),...statusMaps.map(m=>m.resolved_column_ref),"fbcd211a-1bad-4b7d-bbf0-9cfd7df255be","12d5c37f-c709-4c89-beb0-c1926e620f72","4a0dd15f-e67f-436b-a750-2e6ea5e4b392","7540dcf8-7112-443c-b9b2-b31ade65ac44","c96d2e65-7f2e-43f9-bb26-c4f0ce35b8c8","5f4b4720-da61-4f95-941e-04916f742ce4"])].filter(Boolean);
  const cells=await all("cell_values","record_id,column_id,value,value_text,board_id",[q=>q.in("column_id",neededColIds).eq("organization_id",ORG)]);
  const colById=new Map(colsAll.map(c=>[c.id,c]));
  const cellIdx=new Map(); for(const cv of cells){ cellIdx.set(`${cv.board_id}:${cv.record_id}:${cv.column_id}`,cv); }
  const clientMapByBoard=new Map(clientMaps.map(m=>[m.board_id,m.resolved_column_ref]));
  const statusMapByBoard=new Map(statusMaps.map(m=>[m.board_id,m.resolved_column_ref]));
  const safariNames=new Set(["safari","safari select","safari-genie","safari select / safari-genie"]);
  const levisNames=new Set(["levis","levi's","levis strauss & co","levis strauss and co"]);
  const aliasToClient=new Map(); for(const a of aliases){ aliasToClient.set(norm(a.alias_text),a.client_id); }
  const clientById=new Map(clients.map(c=>[c.id,c]));
  // sidebar heuristic: board status active and not archived_at and workspace not archived
  function inSidebar(b){ const ws=wsById.get(b.workspace_id); return b.status!=="archived" && !b.archived_at && ws && ws.organization_id===ORG && ws.archived_at==null && (ws.status==null || ws.status!=="archived"); }
  const unnamedIds=new Set(["board-1792047259966-qpmvnh6","board-1792039790753-5o1nfgh","3ba6c406-7b1e-4c25-ba01-6144da60d5ff","f38771a6-69e5-491a-b9bd-9cf35f116fe2","b768cfeb-3c4f-451a-aa58-1d5e79d318e2","60370ba1-f6e6-4a3c-acb4-d9158e32b6e1"]);
  const recsByBoard={}; for(const r of recsAll){ if(!recsByBoard[r.board_id]) recsByBoard[r.board_id]={active:0,archived:0,total:0,other:0}; recsByBoard[r.board_id].total++; if(r.status==="active") recsByBoard[r.board_id].active++; else if(r.status==="archived") recsByBoard[r.board_id].archived++; else recsByBoard[r.board_id].other=(recsByBoard[r.board_id].other||0)+1; }
  function rawClient(bid,rid){ const cid=clientMapByBoard.get(bid); if(!cid) return null; return cellText(colById.get(cid), cellIdx.get(`${bid}:${rid}:${cid}`)); }
  const inventory=boards.map(b=>{
    const counts=recsByBoard[b.id]||{active:0,archived:0,total:0};
    let lev=0,saf=0;
    const activeRecs=recsAll.filter(r=>r.board_id===b.id && r.status==="active");
    for(const r of activeRecs){ const n=norm(rawClient(b.id,r.id)||""); if(levisNames.has(n)) lev++; if(safariNames.has(n)) saf++; }
    return {id:b.id,name:b.name,status:b.status,workspace:b.workspace_id,workspaceName:wsById.get(b.workspace_id)?.name,sidebar:inSidebar(b),active:counts.active,archived:counts.archived,total:counts.total,clientMapped:clientMapByBoard.has(b.id),clientColId:clientMapByBoard.get(b.id)||null,levis:lev,safari:saf,highlightUnnamed:unnamedIds.has(b.id),archived_at:b.archived_at,visibility:b.visibility,created_at:b.created_at};
  }).sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id)));
  // unnamed columns
  const unnamedCols={};
  for(const id of unnamedIds){ const cs=colsAll.filter(c=>c.board_id===id&&!c.group_id).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)); unnamedCols[id]=cs.map(c=>({label:c.label,type:c.type,id:c.id})); }
  // Oct distinct Item Name values
  const octId="6b128f51-981f-4486-b580-4d6e4c3c16a3"; const itemCol="fbcd211a-1bad-4b7d-bbf0-9cfd7df255be";
  const octVals={}; for(const r of recsAll.filter(r=>r.board_id===octId&&r.status==="active")){ const v=cellText(colById.get(itemCol),cellIdx.get(`${octId}:${r.id}:${itemCol}`)); octVals[v]=(octVals[v]||0)+1; }
  // status distinct values per board (active boards in org)
  const statusVals={};
  for(const b of boards){ const sc=statusMapByBoard.get(b.id); if(!sc) {statusVals[b.id]={board:b.name,status:"no status mapping"}; continue;} const col=colById.get(sc); const counts={}; for(const r of recsAll.filter(r=>r.board_id===b.id&&r.status==="active")){ const v=cellText(col,cellIdx.get(`${b.id}:${r.id}:${sc}`)); const k=v===""?"(empty)":v; counts[k]=(counts[k]||0)+1; } statusVals[b.id]={board:b.name,column:col?.label,counts}; }
  // Nov receive/inward check
  const novId="4b0bd58f-ebeb-4f8d-92be-47be50033225";
  const novCols=colsAll.filter(c=>c.board_id===novId).map(c=>({label:c.label,type:c.type,id:c.id}));
  const octCols=colsAll.filter(c=>c.board_id===octId).map(c=>({label:c.label,type:c.type,id:c.id}));
  // invoice status per board
  const invStatusByBoard={};
  for(const b of boards){ const inv=colsAll.filter(c=>c.board_id===b.id && /invoice/i.test(c.label) && /status/i.test(c.label)); invStatusByBoard[b.name]=inv.map(c=>({label:c.label,type:c.type,id:c.id})); }
  // generic clients - which boards hold their records
  const deny=["a","apperals","backpack","bag","bottle","flatlay","footwear","product","trolley bag"];
  const denyClientIds=new Set(clients.filter(c=>deny.includes(norm(c.canonical_name))).map(c=>c.id));
  const denyWhere={}; for(const s of snapshot){ if(denyClientIds.has(s.client_id)){ const bn=boards.find(b=>b.id===s.board_id)?.name||s.board_id; const cn=clientById.get(s.client_id)?.canonical_name; if(!denyWhere[cn]) denyWhere[cn]={}; denyWhere[cn][bn]=(denyWhere[cn][bn]||0)+1; } }
  // unique constraint on field_mappings
  let uq=null; try{ const r=await db.rpc('exec_sql',{sql:"select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid='public.client_360_field_mappings'::regclass"}); uq=r; }catch(e){uq={error:String(e)};}
  // sum checks
  const totalActiveAll=recsAll.filter(r=>r.status==="active").length;
  const totalArchivedAll=recsAll.filter(r=>r.status==="archived").length;
  console.log(JSON.stringify({boardsCount:boards.length,inventory,unnamedCols,octValues:Object.entries(octVals).sort((a,b)=>b[1]-a[1]).map(([v,c])=>({value:v,count:c,normalized:norm(v),isJobTypeLike:/shoe|curtain|trolley|bag|bottle|apparel|apperal|footwear|flatlay|backpack|product|resize|global/i.test(v)&&!/safari|levi|levis/i.test(v)})),statusVals,novCols,octCols,invStatusByBoard,denyWhere,recordSums:{totalActiveAll,totalArchivedAll,total:recsAll.length},uniqueConstraintProbe:uq},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
