const fs=require("fs"),path=require("path");
const {createClient}=require("@supabase/supabase-js");
function loadEnv(p){const e={};for(const l of fs.readFileSync(p,"utf8").split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith("#"))continue;const i=t.indexOf("=");if(i<0)continue;e[t.slice(0,i).trim()]=t.slice(i+1).trim()}return e}
const env=loadEnv(path.join(process.cwd(),".env.local"));
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
const ORG="org-1792039761662-m59i0f8";
const norm=s=>String(s??"").toLowerCase().replace(/[’']/g,"").replace(/&/g,"and").replace(/[_-]+/g," ").replace(/\s+/g," ").trim();
async function all(table,cols,filters=[]){let out=[],from=0;for(;;){let q=db.from(table).select(cols).range(from,from+999);for(const f of filters)q=f(q);const {data,error}=await q;if(error)throw {table,error};out=out.concat(data||[]);if(!data||data.length<1000)break;from+=1000;}return out;}
function cellText(col,cv){
  if(!cv) return "";
  let raw=""; const val=cv.value;
  if(val==null) raw=cv.value_text||"";
  else if(typeof val==="string") raw=val;
  else if(typeof val==="number"||typeof val==="boolean") raw=String(val);
  else if(Array.isArray(val)) raw=val.map(x=>typeof x==="object"?(x.label||x.name||x.text||x.value||JSON.stringify(x)):String(x)).join(", ");
  else if(typeof val==="object"){ if(col?.type==="timeline") raw=val.start||val.end||""; else raw=val.label||val.name||val.text||val.title||val.value||(cv.value_text||""); }
  else raw=String(val);
  raw=String(raw||cv.value_text||"").trim();
  const settings=col?.settings||{};
  if(col && ["status","priority","dropdown","multi_select"].includes(col.type)){
    const opts=Array.isArray(settings.labels)?settings.labels:settings.options;
    if(Array.isArray(opts)){
      const resolve=v=>{const vs=String(v??"");for(const o of opts){if(o&&(String(o.id)===vs||String(o.value)===vs||String(o.label)===vs))return String(o.label||o.value||o.id);}return null;};
      if(Array.isArray(val)){const labs=val.map(resolve).filter(Boolean); if(labs.length) raw=labs.join(", ");} else {const lab=resolve(val??raw); if(lab) raw=lab;}
    }
  }
  return raw;
}
(async()=>{
  const boardsAll=await all("boards","id,name,status,organization_id,workspace_id,created_at");
  const boardsOrg=boardsAll.filter(b=>b.organization_id===ORG);
  const boardsActive=boardsOrg.filter(b=>b.status!=="archived");
  const boardIds=boardsActive.map(b=>b.id);
  const cols=await all("columns","id,board_id,label,type,settings,sort_order,group_id",[q=>q.in("board_id",boardIds)]);
  const rootCols=cols.filter(c=>!c.group_id);
  const recsAll=await all("records","id,board_id,title,status,parent_id,group_id,created_at,updated_at,archived_at",[q=>q.in("board_id",boardIds)]);
  const recsActive=recsAll.filter(r=>r.status==="active");
  const cells=await all("cell_values","id,record_id,column_id,value,value_text,board_id",[q=>q.in("board_id",boardIds)]);
  const maps=await all("client_360_field_mappings","*",[q=>q.eq("organization_id",ORG)]);
  const clients=await all("client_360_clients","id,canonical_name,needs_confirmation,created_at,updated_at",[q=>q.eq("organization_id",ORG)]);
  const aliases=await all("client_360_client_aliases","id,client_id,alias_text,created_at",[q=>q.eq("organization_id",ORG)]);
  const snapshot=await all("client_360_daily_snapshot","id,record_id,board_id,client_id,volume,job_date,status",[q=>q.eq("organization_id",ORG)]);
  // 1. hidden clients detail
  const target=["lotto","uppercase","wipro","hokipo","welspun","house & kinder","one8"];
  const clientById=new Map(clients.map(c=>[c.id,c]));
  const hiddenTargets=clients.filter(c=>target.includes(norm(c.canonical_name)));
  const aliasesByClient=new Map();
  for(const a of aliases){ if(!aliasesByClient.has(a.client_id)) aliasesByClient.set(a.client_id,[]); aliasesByClient.get(a.client_id).push(a); }
  // why flagged
  const flagged=hiddenTargets.map(c=>({name:c.canonical_name,id:c.id,needs_confirmation:c.needs_confirmation,aliases:(aliasesByClient.get(c.id)||[]).map(a=>a.alias_text),created_at:c.created_at}));
  // denylist names search
  const deny=["a","apperals","backpack","bag","bottle","flatlay","footwear","product","trolley bag"];
  const denyHits=clients.filter(c=>deny.includes(norm(c.canonical_name))||deny.some(d=>norm(c.canonical_name)===d));
  const denyAliasHits=aliases.filter(a=>deny.includes(norm(a.alias_text)));
  // 2. October and unmapped boards
  const clientMapBoards=new Set(maps.filter(m=>m.field_type==="client").map(m=>m.board_id));
  const unmappedBoards=boardsActive.filter(b=>!clientMapBoards.has(b.id));
  const colByBoard=new Map();
  for(const c of rootCols){ if(!colByBoard.has(c.board_id)) colByBoard.set(c.board_id,[]); colByBoard.get(c.board_id).push(c); }
  const cellIdx=new Map();
  for(const cv of cells){ const k=cv.column_id; if(!cellIdx.has(k)) cellIdx.set(k,[]); if(cellIdx.get(k).length<3) cellIdx.get(k).push(cv); }
  function boardColsDetail(bid){ const cs=(colByBoard.get(bid)||[]).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)); return cs.map(c=>({id:c.id,label:c.label,type:c.type,samples:(cellIdx.get(c.id)||[]).map(cv=>cellText(c,cv)).filter(x=>x!=="")})); }
  const oct=boardsActive.find(b=>/oct/i.test(b.name));
  const otherUnmapped=unmappedBoards.filter(b=>!oct||b.id!==oct.id);
  // Jobs/Data boards
  const jobsData=boardsOrg.filter(b=>/job|data/i.test(b.name)).map(b=>({name:b.name,id:b.id,status:b.status,workspace_id:b.workspace_id}));
  // 4. records by board and status
  const statusByBoard={};
  for(const r of recsAll){ const bn=(boardsActive.find(b=>b.id===r.board_id)||boardsOrg.find(b=>b.id===r.board_id)||{}).name||r.board_id; const k=bn; if(!statusByBoard[k]) statusByBoard[k]={}; statusByBoard[k][r.status]=(statusByBoard[k][r.status]||0)+1; }
  // parent/child
  const withParent=recsAll.filter(r=>r.parent_id);
  const childByParent={}; for(const r of withParent){ childByParent[r.parent_id]=(childByParent[r.parent_id]||0)+1; }
  const maxChildren=Math.max(0,...Object.values(childByParent));
  // snapshot counts for levis/safari
  const snapByClient={};
  for(const s of snapshot){ snapByClient[s.client_id]=(snapByClient[s.client_id]||0)+1; }
  const safariNames=["safari","safari select","safari-genie"];
  const levisNames=["levis","levi's","levis strauss & co","levis strauss and co"];
  const safariClients=clients.filter(c=>safariNames.includes(norm(c.canonical_name)));
  const levisClients=clients.filter(c=>levisNames.includes(norm(c.canonical_name)));
  const snapSafari=safariClients.map(c=>({name:c.canonical_name,id:c.id,rows:snapByClient[c.id]||0,needs_confirmation:c.needs_confirmation}));
  const snapLevis=levisClients.map(c=>({name:c.canonical_name,id:c.id,rows:snapByClient[c.id]||0,needs_confirmation:c.needs_confirmation}));
  // record counts straight
  const clientMapByBoard2=new Map(maps.filter(m=>m.field_type==="client").map(m=>[m.board_id,m.resolved_column_ref]));
  const colById=new Map(rootCols.map(c=>[c.id,c]));
  const recCellIdx=new Map(); for(const cv of cells){ recCellIdx.set(`${cv.board_id}:${cv.record_id}:${cv.column_id}`,cv); }
  function rawClientFor(r){ const cid=clientMapByBoard2.get(r.board_id); if(!cid) return ""; return cellText(colById.get(cid), recCellIdx.get(`${r.board_id}:${r.id}:${cid}`)); }
  let recSafari=0,recLevis=0; const safBoards={},levBoards={};
  for(const r of recsActive){ const n=norm(rawClientFor(r)); const bn=(boardsActive.find(b=>b.id===r.board_id)||{}).name; if(safariNames.includes(n)){recSafari++; safBoards[bn]=(safBoards[bn]||0)+1;} if(levisNames.includes(n)||n==="levi's"){recLevis++; levBoards[bn]=(levBoards[bn]||0)+1;} }
  // snapshot row samples
  const snapSafRows=snapshot.filter(s=>safariClients.some(c=>c.id===s.client_id)).slice(0,5);
  const snapLevRows=snapshot.filter(s=>levisClients.some(c=>c.id===s.client_id)).slice(0,5);
  // detection table for receive_date/job_status per board
  const det=boardsActive.map(b=>{
    const bm=maps.filter(m=>m.board_id===b.id);
    const pick=t=>{const m=bm.find(x=>x.field_type===t); if(!m) return null; const c=colById.get(m.resolved_column_ref); return m?{field:t,column:c?c.label:m.resolved_column_ref,columnId:m.resolved_column_ref,type:c?.type,source:m.source,confidence:m.confidence}:null;};
    return {board:b.name,boardId:b.id,client:pick("client"),job_date:pick("job_date"),receive_date:pick("receive_date"),due_date:pick("due_date"),job_status:pick("status")||pick("job_status"),status:pick("status"),volume:pick("volume"),job_type:pick("job_type"),batch_job_id:pick("batch_job_id"),image_count:pick("image_count"),upload_date:pick("upload_date"),invoice_amount:pick("invoice_amount"),invoice_status:pick("invoice_status"),assignee_owner:pick("assignee_owner")};
  });
  // sample auto-detect hints for receive_date/status if missing
  const hintDetect=boardsActive.map(b=>{
    const cs=(colByBoard.get(b.id)||[]);
    const byLabel=(rx)=>cs.find(c=>rx.test(c.label));
    const recv=byLabel(/receiv|inward|job date|created/i);
    const jstat=cs.find(c=>c.type==="status"||/status|stage/i.test(c.label));
    const batch=byLabel(/batch|job id|job no|batch id|job code/i);
    const img=byLabel(/image|asset|sku|qty|quantity|count/i);
    const up=byLabel(/upload|delivered|delivery|complete/i);
    const invA=byLabel(/invoice amount|amount|value|revenue|price/i);
    const invS=byLabel(/invoice status|payment|paid/i);
    const asg=byLabel(/assign|owner/i);
    const map=bm=>bm;
    return {board:b.name,recvHint:recv?{label:recv.label,type:recv.type,id:recv.id}:null,statusHint:jstat?{label:jstat.label,type:jstat.type,id:jstat.id}:null,batchHint:batch?{label:batch.label,type:batch.type,id:batch.id}:null,imageHint:img?{label:img.label,type:img.type,id:img.id}:null,uploadHint:up?{label:up.label,type:up.type,id:up.id}:null,invAmtHint:invA?{label:invA.label,type:invA.type,id:invA.id}:null,invStHint:invS?{label:invS.label,type:invS.type,id:invS.id}:null,assigneeHint:asg?{label:asg.label,type:asg.type,id:asg.id}:null};
  });
  const out={org:ORG,counts:{boardsOrg:boardsOrg.length,boardsActive:boardsActive.length,recordsAll:recsAll.length,recordsActive:recsActive.length,snapshotRows:snapshot.length},hiddenTargets:flagged,denyHits,denyAliasHits,jobsDataBoards:jobsData,october:oct?{id:oct.id,name:oct.name,columns:boardColsDetail(oct.id)}:null,otherUnmapped:otherUnmapped.map(b=>({id:b.id,name:b.name,columns:boardColsDetail(b.id)})),statusByBoard,withParentCount:withParent.length,distinctParents:Object.keys(childByParent).length,maxChildren,snapSafari,snapLevis,recSafari,recLevis,safBoards,levBoards,snapSafSample:snapSafRows,snapLevSample:snapLevRows,det,hintDetect,fieldTypeConstraintNote:"see query"};
  console.log(JSON.stringify(out,null,2));
})().catch(e=>{console.error(e);process.exit(1)});
