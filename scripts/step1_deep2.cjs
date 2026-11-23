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
  const boardsAll=await all("boards","id,name,status,organization_id,workspace_id,created_at");
  const boardsOrg=boardsAll.filter(b=>b.organization_id===ORG);
  const boardsActive=boardsOrg.filter(b=>b.status!=="archived");
  const boardIds=boardsActive.map(b=>b.id);
  const cols=await all("columns","id,board_id,label,type,settings,sort_order,group_id",[q=>q.in("board_id",boardIds)]);
  const rootCols=cols.filter(c=>!c.group_id);
  const recsAll=await all("records","id,board_id,title,status,group_id,created_at,updated_at",[q=>q.in("board_id",boardIds)]);
  const recsActive=recsAll.filter(r=>r.status==="active");
  const cells=await all("cell_values","id,record_id,column_id,value,value_text,board_id",[q=>q.in("board_id",boardIds)]);
  const maps=await all("client_360_field_mappings","*",[q=>q.eq("organization_id",ORG)]);
  const clients=await all("client_360_clients","id,canonical_name,needs_confirmation,created_at,updated_at",[q=>q.eq("organization_id",ORG)]);
  const aliases=await all("client_360_client_aliases","id,client_id,alias_text,created_at",[q=>q.eq("organization_id",ORG)]);
  const snapshot=await all("client_360_daily_snapshot","id,record_id,board_id,client_id,volume,job_date,status,is_pending",[q=>q.eq("organization_id",ORG)]);
  const target=["lotto","uppercase","wipro","hokipo","welspun","house & kinder","one8"];
  const aliasesByClient=new Map(); for(const a of aliases){ if(!aliasesByClient.has(a.client_id)) aliasesByClient.set(a.client_id,[]); aliasesByClient.get(a.client_id).push(a); }
  const hiddenTargets=clients.filter(c=>target.includes(norm(c.canonical_name))).map(c=>({name:c.canonical_name,id:c.id,needs_confirmation:c.needs_confirmation,aliases:(aliasesByClient.get(c.id)||[]).map(a=>({t:a.alias_text,at:a.created_at})),created_at:c.created_at}));
  const deny=["a","apperals","backpack","bag","bottle","flatlay","footwear","product","trolley bag"];
  const denyHits=clients.filter(c=>deny.includes(norm(c.canonical_name)));
  const denyAliasHits=aliases.filter(a=>deny.includes(norm(a.alias_text)));
  const clientMapBoards=new Set(maps.filter(m=>m.field_type==="client").map(m=>m.board_id));
  const unmappedBoards=boardsActive.filter(b=>!clientMapBoards.has(b.id));
  const colByBoard=new Map(); for(const c of rootCols){ if(!colByBoard.has(c.board_id)) colByBoard.set(c.board_id,[]); colByBoard.get(c.board_id).push(c); }
  const cellIdx=new Map(); for(const cv of cells){ const k=cv.column_id; if(!cellIdx.has(k)) cellIdx.set(k,[]); if(cellIdx.get(k).length<3) cellIdx.get(k).push(cv); }
  function boardColsDetail(bid){ const cs=(colByBoard.get(bid)||[]).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)); return cs.map(c=>({id:c.id,label:c.label,type:c.type,samples:(cellIdx.get(c.id)||[]).map(cv=>cellText(c,cv)).filter(x=>x!=="").slice(0,3)})); }
  const oct=boardsActive.find(b=>/oct/i.test(b.name));
  const jobsData=boardsOrg.map(b=>({name:b.name,id:b.id,status:b.status,workspace_id:b.workspace_id})).filter(b=>/job|data/i.test(b.name));
  const allBoardsStatus=boardsOrg.map(b=>({name:b.name,id:b.id,status:b.status,workspace_id:b.workspace_id}));
  // status counts per board across ALL statuses (active boards scope for recsAll already limited; get all org records?)
  const recsAllOrg=await all("records","id,board_id,status",[q=>q.eq("organization_id",ORG)]);
  const boardName=id=>(boardsOrg.find(b=>b.id===id)||{}).name||id;
  const statusByBoard={};
  for(const r of recsAllOrg){ const bn=boardName(r.board_id); if(!statusByBoard[bn]) statusByBoard[bn]={}; statusByBoard[bn][r.status]=(statusByBoard[bn][r.status]||0)+1; }
  // snapshot vs records Levis/Safari
  const clientsAll=clients; const clientById=new Map(clientsAll.map(c=>[c.id,c]));
  const snapByClient={}; for(const s of snapshot){ snapByClient[s.client_id]=(snapByClient[s.client_id]||0)+1; }
  const safariNames=["safari","safari select","safari-genie"]; const levisNames=["levis","levi's","levis strauss & co","levis strauss and co"];
  const safariClients=clientsAll.filter(c=>safariNames.includes(norm(c.canonical_name)));
  const levisClients=clientsAll.filter(c=>levisNames.includes(norm(c.canonical_name))||norm(c.canonical_name)==="levi's");
  const snapSafari=safariClients.map(c=>({name:c.canonical_name,id:c.id,rows:snapByClient[c.id]||0,needs_confirmation:c.needs_confirmation}));
  const snapLevis=levisClients.map(c=>({name:c.canonical_name,id:c.id,rows:snapByClient[c.id]||0,needs_confirmation:c.needs_confirmation}));
  const clientMapByBoard2=new Map(maps.filter(m=>m.field_type==="client").map(m=>[m.board_id,m.resolved_column_ref]));
  const colById=new Map(rootCols.map(c=>[c.id,c]));
  const recCellIdx=new Map(); for(const cv of cells){ recCellIdx.set(`${cv.board_id}:${cv.record_id}:${cv.column_id}`,cv); }
  function rawClientFor(r){ const cid=clientMapByBoard2.get(r.board_id); if(!cid) return null; return cellText(colById.get(cid), recCellIdx.get(`${r.board_id}:${r.id}:${cid}`)); }
  let recSafari=0,recLevis=0; const safBoards={},levBoards={};
  for(const r of recsActive){ const raw=rawClientFor(r); const n=norm(raw||""); const bn=boardName(r.board_id); if(safariNames.includes(n)){recSafari++; safBoards[bn]=(safBoards[bn]||0)+1;} if(levisNames.includes(n)){recLevis++; levBoards[bn]=(levBoards[bn]||0)+1;} }
  // snapshot duplicate analysis
  const snapRecCount={}; for(const s of snapshot){ snapRecCount[s.record_id]=(snapRecCount[s.record_id]||0)+1; }
  const dupSnap=Object.values(snapRecCount).filter(x=>x>1).length;
  const maxSnapPerRec=Math.max(0,...Object.values(snapRecCount));
  // detection per board
  const det=boardsActive.map(b=>{
    const bm=maps.filter(m=>m.board_id===b.id); const cs=(colByBoard.get(b.id)||[]);
    const pick=t=>{const m=bm.find(x=>x.field_type===t); if(!m) return null; const c=colById.get(m.resolved_column_ref); return {field:t,column:c?c.label:m.resolved_column_ref,columnId:m.resolved_column_ref,type:c?.type,source:m.source,confidence:m.confidence};};
    const hint=(pred)=>{const c=cs.find(pred); return c?{label:c.label,type:c.type,id:c.id}:null;};
    return {board:b.name,boardId:b.id,
      mapped:{client:pick("client"),job_date:pick("job_date"),receive_date:pick("receive_date"),due_date:pick("due_date"),status:pick("status"),job_status:pick("job_status"),volume:pick("volume"),job_type:pick("job_type"),batch_job_id:pick("batch_job_id"),image_count:pick("image_count"),upload_date:pick("upload_date"),invoice_amount:pick("invoice_amount"),invoice_status:pick("invoice_status"),assignee_owner:pick("assignee_owner")},
      detect:{receive_date:pick("receive_date")||pick("job_date")||hint(c=>/receiv|inward/i.test(c.label)&&["date","timeline"].includes(c.type)), job_status:pick("status")||pick("job_status")||hint(c=>c.type==="status"||/status|stage/i.test(c.label)), batch_job_id:pick("batch_job_id")||hint(c=>/batch|job id|job no|job code|batch detail/i.test(c.label)), image_count:pick("image_count")||pick("volume")||hint(c=>/image|asset|sku|quantity|qty|count|no\.? of/i.test(c.label)), upload_date:pick("upload_date")||hint(c=>/upload|delivered|delivery/i.test(c.label)&&["date","timeline"].includes(c.type)), invoice_amount:pick("invoice_amount")||hint(c=>/invoice amount|amount|value|revenue|price|total/i.test(c.label)), invoice_status:pick("invoice_status")||hint(c=>/invoice status|payment|paid/i.test(c.label)), assignee_owner:pick("assignee_owner")||hint(c=>/assign|owner/i.test(c.label)||c.type==="person")}
    };
  });
  // try to read check constraint via rpc unlikely; also query information_schema via rpc not exposed. inspect migrations
  console.log(JSON.stringify({org:ORG,counts:{boardsOrg:boardsOrg.length,boardsActive:boardsActive.length,recordsAllOrg:recsAllOrg.length,recordsActiveInActiveBoards:recsActive.length,snapshotRows:snapshot.length,distinctSnapshotRecords:Object.keys(snapRecCount).length,dupSnapshotRecordKeys:dupSnap,maxRowsPerRecord:maxSnapPerRec},hiddenTargets,denyHits:denyHits.map(c=>({name:c.canonical_name,id:c.id,needs_confirmation:c.needs_confirmation})),denyAliasHits:denyAliasHits.map(a=>({alias:a.alias_text,client_id:a.client_id})),allBoardsStatus,jobsDataBoards:jobsData,october:oct?{id:oct.id,name:oct.name,columns:boardColsDetail(oct.id)}:null,otherUnmapped:unmappedBoards.filter(b=>!oct||b.id!==oct.id).map(b=>({id:b.id,name:b.name,columns:boardColsDetail(b.id)})),statusByBoard,snapSafari,snapLevis,recSafari,recLevis,safBoards,levBoards,det},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
