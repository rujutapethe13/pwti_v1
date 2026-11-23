const fs=require("fs"),path=require("path");
const {createClient}=require("@supabase/supabase-js");
function loadEnv(p){const e={};for(const l of fs.readFileSync(p,"utf8").split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith("#"))continue;const i=t.indexOf("=");if(i<0)continue;e[t.slice(0,i).trim()]=t.slice(i+1).trim()}return e}
const env=loadEnv(path.join(process.cwd(),".env.local"));
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
const ORG="org-1792039761662-m59i0f8";
const norm=s=>String(s??"").toLowerCase().replace(/[’']/g,"").replace(/&/g,"and").replace(/[_-]+/g," ").replace(/\s+/g," ").trim();
const normLoose=s=>norm(s).replace(/\s+/g," ").trim();
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
  const boards=await all("boards","*",[q=>q.eq("organization_id",ORG)]);
  let workspaces=[]; try{workspaces=await all("workspaces","*",[q=>q.eq("organization_id",ORG)]);}catch(e){workspaces=[];}
  const wsById=new Map(workspaces.map(w=>[w.id,w]));
  const colsAll=await all("columns","id,board_id,label,type,settings,sort_order,group_id,key",[q=>q.eq("organization_id",ORG)]);
  const recsAll=await all("records","id,board_id,status,title,group_id,created_at,updated_at",[q=>q.eq("organization_id",ORG)]);
  const maps=await all("client_360_field_mappings","*",[q=>q.eq("organization_id",ORG)]);
  const clients=await all("client_360_clients","id,canonical_name,needs_confirmation,created_at,updated_at",[q=>q.eq("organization_id",ORG)]);
  const aliases=await all("client_360_client_aliases","id,client_id,alias_text,created_at",[q=>q.eq("organization_id",ORG)]);
  const snapshot=await all("client_360_daily_snapshot","record_id,board_id,client_id,volume,job_date,status,is_pending",[q=>q.eq("organization_id",ORG)]);
  const clientMaps=maps.filter(m=>m.field_type==="client");
  const statusMaps=maps.filter(m=>m.field_type==="status");
  const extraCols=["fbcd211a-1bad-4b7d-bbf0-9cfd7df255be","12d5c37f-c709-4c89-beb0-c1926e620f72","4a0dd15f-e67f-436b-a750-2e6ea5e4b392","7540dcf8-7112-443c-b9b2-b31ade65ac44","c96d2e65-7f2e-43f9-bb26-c4f0ce35b8c8","5f4b4720-da61-4f95-941e-04916f742ce4","5fb7a0fe-f611-428f-9e4a-5319f60f163d","da5d3342-f8fb-4f95-9be3-4f7a31246ece","76eb16aa-ac90-4b4a-9c3d-a4e341252417","041cfcb9-9bc3-4036-898c-1a0b64d66e6a"];
  const neededColIds=[...new Set([...clientMaps.map(m=>m.resolved_column_ref),...statusMaps.map(m=>m.resolved_column_ref),...maps.map(m=>m.resolved_column_ref),...extraCols])].filter(Boolean);
  const cells=await all("cell_values","record_id,column_id,value,value_text,board_id",[q=>q.in("column_id",neededColIds).eq("organization_id",ORG)]);
  const colById=new Map(colsAll.map(c=>[c.id,c]));
  const cellIdx=new Map(); for(const cv of cells){ cellIdx.set(`${cv.board_id}:${cv.record_id}:${cv.column_id}`,cv); }
  const clientMapByBoard=new Map(clientMaps.map(m=>[m.board_id,m.resolved_column_ref]));
  const statusMapByBoard=new Map(statusMaps.map(m=>[m.board_id,m.resolved_column_ref]));
  const safariNames=new Set(["safari","safari select","safari-genie"]);
  const levisNames=new Set(["levis","levi's","levis strauss & co","levis strauss and co"]);
  const clientById=new Map(clients.map(c=>[c.id,c]));
  function inSidebar(b){ const ws=wsById.get(b.workspace_id); const wsActive=!ws || (ws.status!=="archived" && !ws.archived_at && !ws.is_archived); return b.status!=="archived" && !b.archived_at && wsActive; }
  const unnamedIds=new Set(["board-1792047259966-qpmvnh6","board-1792039790753-5o1nfgh","3ba6c406-7b1e-4c25-ba01-6144da60d5ff","f38771a6-69e5-491a-b9bd-9cf35f116fe2","b768cfeb-3c4f-451a-aa58-1d5e79d318e2","60370ba1-f6e6-4a3c-acb4-d9158e32b6e1"]);
  const recsByBoard={}; for(const r of recsAll){ if(!recsByBoard[r.board_id]) recsByBoard[r.board_id]={active:0,archived:0,total:0,other:0}; const rb=recsByBoard[r.board_id]; rb.total++; if(r.status==="active") rb.active++; else if(r.status==="archived") rb.archived++; else rb.other=(rb.other||0)+1; }
  function rawClient(bid,rid){ const cid=clientMapByBoard.get(bid); if(!cid) return null; return cellText(colById.get(cid), cellIdx.get(`${bid}:${rid}:${cid}`)); }
  const inventory=boards.map(b=>{
    const counts=recsByBoard[b.id]||{active:0,archived:0,total:0,other:0};
    let lev=0,saf=0;
    for(const r of recsAll.filter(r=>r.board_id===b.id && r.status==="active")){ const n=norm(rawClient(b.id,r.id)||""); if(levisNames.has(n)) lev++; if(safariNames.has(n)) saf++; }
    const ws=wsById.get(b.workspace_id);
    return {id:b.id,name:b.name,status:b.status,workspace_id:b.workspace_id,workspace_name:ws?.name||null,sidebar:inSidebar(b),active:counts.active,archived:counts.archived,total:counts.total,other:counts.other||0,clientMapped:clientMapByBoard.has(b.id),clientColId:clientMapByBoard.get(b.id)||null,levis:lev,safari:saf,highlightUnnamed:unnamedIds.has(b.id),archived_at:b.archived_at||null,visibility:b.visibility||null,created_at:b.created_at};
  }).sort((a,b)=>{const an=a.name??"\uffff"; const bn=b.name??"\uffff"; return String(an).localeCompare(String(bn)) || a.id.localeCompare(b.id);});
  const unnamedCols={};
  for(const id of unnamedIds){ const cs=colsAll.filter(c=>c.board_id===id&&!c.group_id).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)); unnamedCols[id]=cs.map(c=>({label:c.label,type:c.type,id:c.id,key:c.key})); }
  // Oct
  const octId="6b128f51-981f-4486-b580-4d6e4c3c16a3"; const itemCol="fbcd211a-1bad-4b7d-bbf0-9cfd7df255be";
  const octVals={}; for(const r of recsAll.filter(r=>r.board_id===octId&&r.status==="active")){ const v=cellText(colById.get(itemCol),cellIdx.get(`${octId}:${r.id}:${itemCol}`)); const k=v===""?"(empty)":v; octVals[k]=(octVals[k]||0)+1; }
  const octDistinct=Object.entries(octVals).sort((a,b)=>b[1]-a[1]).map(([v,c])=>({value:v,count:c,normalized:normLoose(v)}));
  // status vals per board (all org boards)
  const statusVals={};
  for(const b of boards){ const sc=statusMapByBoard.get(b.id); if(!sc){statusVals[b.name+"|"+b.id]={board:b.name,id:b.id,mapped:false}; continue;} const col=colById.get(sc); const counts={}; for(const r of recsAll.filter(r=>r.board_id===b.id&&r.status==="active")){ const v=cellText(col,cellIdx.get(`${b.id}:${r.id}:${sc}`)); const k=v===""?"(empty)":v; counts[k]=(counts[k]||0)+1; } statusVals[b.name+"|"+b.id]={board:b.name,id:b.id,column:col?.label,columnId:sc,counts}; }
  // Nov/Oct receive vs inward
  const colInfo=id=>{const c=colById.get(id); return c?{id,label:c.label,type:c.type}:null;};
  const novInfo={board:"November 2026",receive:colInfo("7540dcf8-7112-443c-b9b2-b31ade65ac44"),inward:colInfo("4a0dd15f-e67f-436b-a750-2e6ea5e4b392"),receiveMappedInJobDate:maps.find(m=>m.board_id==="4b0bd58f-ebeb-4f8d-92be-47be50033225"&&m.field_type==="job_date")};
  // actually Nov active board id is 4b0bd58f (November 2026). receive column in that board? list columns
  const novCols=colsAll.filter(c=>c.board_id==="4b0bd58f-ebeb-4f8d-92be-47be50033225").sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)).map(c=>({id:c.id,label:c.label,type:c.type}));
  const octCols=colsAll.filter(c=>c.board_id===octId).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)).map(c=>({id:c.id,label:c.label,type:c.type}));
  // invoice status per board (all boards)
  const invStatus={}; for(const b of boards){ invStatus[b.name+"|"+b.id]=colsAll.filter(c=>c.board_id===b.id && /invoice/i.test(c.label)&&/status/i.test(c.label)).map(c=>({id:c.id,label:c.label,type:c.type})); }
  // generic clients locations
  const deny=["a","apperals","backpack","bag","bottle","flatlay","footwear","product","trolley bag"];
  const denyClientIds=new Set(clients.filter(c=>deny.includes(norm(c.canonical_name))).map(c=>c.id));
  const denyWhere={}; for(const s of snapshot){ if(denyClientIds.has(s.client_id)){ const bn=boards.find(b=>b.id===s.board_id)?.name||s.board_id; const bs=boards.find(b=>b.id===s.board_id)?.status; const cn=clientById.get(s.client_id)?.canonical_name; if(!denyWhere[cn]) denyWhere[cn]={}; const key=`${bn} [${bs}]`; denyWhere[cn][key]=(denyWhere[cn][key]||0)+1; } }
  // sums
  const totalActiveAll=recsAll.filter(r=>r.status==="active").length;
  const totalArchivedAll=recsAll.filter(r=>r.status==="archived").length;
  // aug explanation numbers
  const augActiveBoard=inventory.find(b=>b.id==="b6e96b2b-db2a-4e78-a236-b3dcb0e3cb56");
  const augArchivedBoard=inventory.find(b=>b.id==="efa4927c-e850-4e4f-a826-d8ced606482a");
  // step1 recon scope was 12 active boards in org
  const step1Boards=inventory.filter(b=>b.sidebar && b.status!=="archived");
  const step1ActiveSum=step1Boards.reduce((s,b)=>s+b.active,0);
  const out={org:ORG,boardsCount:boards.length,workspaceSample:workspaces.slice(0,3),inventory,unnamedCols,octDistinct,novInfo,novCols,octCols,statusVals,invStatus,denyWhere,recordSums:{totalActiveAll,totalArchivedAll,total:recsAll.length},augActiveBoard,augArchivedBoard,step1Boards:step1Boards.map(b=>({name:b.name,id:b.id,active:b.active})),step1ActiveSum,snapshotRows:snapshot.length,distinctSnap:Object.keys(Object.fromEntries(snapshot.map(s=>[s.record_id,1]))).length};
  console.log(JSON.stringify(out,null,2));
})().catch(e=>{console.error(JSON.stringify(e,null,2)); process.exit(1)});
