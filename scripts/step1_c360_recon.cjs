const fs = require("fs"), path = require("path");
const { createClient } = require("@supabase/supabase-js");
function loadEnv(p){const e={};for(const l of fs.readFileSync(p,"utf8").split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith("#"))continue;const i=t.indexOf("=");if(i<0)continue;e[t.slice(0,i).trim()]=t.slice(i+1).trim()}return e}
const env=loadEnv(path.join(process.cwd(),".env.local"));
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
const pickOrg="org-1792039761662-m59i0f8";
const norm=s=>String(s??"").toLowerCase().replace(/[’']/g,"").replace(/&/g,"and").replace(/[_-]+/g," ").replace(/\s+/g," ").trim();
async function all(table,cols,filters=[]){let out=[];for(let from=0;;from+=1000){let q=db.from(table).select(cols).range(from,from+999);for(const f of filters)q=f(q);const {data,error}=await q;if(error)throw error;out=out.concat(data||[]);if(!data||data.length<1000)break;}return out;}
(async()=>{
  const boards=(await all("boards","id,name,status,organization_id,workspace_id")).filter(b=>b.organization_id===pickOrg && b.status!=="archived");
  const boardIds=boards.map(b=>b.id);
  const cols=(await all("columns","id,board_id,label,type,settings,sort_order",[q=>q.in("board_id",boardIds)])).filter(c=>!c.group_id);
  const recs=(await all("records","id,board_id,title,status",[q=>q.in("board_id",boardIds).eq("status","active")]));
  const cells=(await all("cell_values","record_id,column_id,value,value_text,board_id",[q=>q.in("board_id",boardIds)]));
  const maps=(await all("client_360_field_mappings","board_id,field_type,resolved_column_ref,source,confidence",[q=>q.eq("organization_id",pickOrg)]));
  const clients=(await all("client_360_clients","id,canonical_name,needs_confirmation",[q=>q.eq("organization_id",pickOrg)]));
  const aliases=(await all("client_360_client_aliases","client_id,alias_text",[q=>q.eq("organization_id",pickOrg)]));
  const colById=new Map(cols.map(c=>[c.id,c]));
  const clientMapByBoard=new Map();
  for(const m of maps){ if(m.field_type==="client") clientMapByBoard.set(m.board_id,m.resolved_column_ref); }
  const aliasToClient=new Map();
  for(const a of aliases){ aliasToClient.set(norm(a.alias_text), a.client_id); }
  const clientById=new Map(clients.map(c=>[c.id,c]));
  // visible selector logic mirrors actions: !needs_confirmation and not generic-ish handled separately; but selector shows resolved non-hidden
  const visibleClientIds=new Set(clients.filter(c=>!c.needs_confirmation).map(c=>c.id));
  function resolveOptionLabel(settings,value){
    if(value==null) return null; const v=String(value);
    const opts = Array.isArray(settings?.labels)?settings.labels:settings?.options;
    if(!Array.isArray(opts)) return null;
    for(const o of opts){ if(o && (String(o.id)===v||String(o.value)===v||String(o.label)===v)) return String(o.label||o.value||o.id); }
    return null;
  }
  function cellText(col,cv){
    if(!cv) return "";
    let raw="";
    const val=cv.value;
    if(val==null) raw=cv.value_text||"";
    else if(typeof val==="string") raw=val;
    else if(typeof val==="number"||typeof val==="boolean") raw=String(val);
    else if(Array.isArray(val)) raw=val.map(x=>typeof x==="object"? (x.label||x.name||x.text||x.value||JSON.stringify(x)) : String(x)).join(", ");
    else if(typeof val==="object"){
      if(col?.type==="timeline") raw=val.start||val.end||"";
      else raw=val.label||val.name||val.text||val.title||val.value|| (cv.value_text||"");
    } else raw=String(val);
    raw=String(raw||cv.value_text||"").trim();
    if(col && ["status","priority","dropdown","multi_select"].includes(col.type)){
      if(Array.isArray(val)){ const labs=val.map(v=>resolveOptionLabel(col.settings,v)).filter(Boolean); if(labs.length) raw=labs.join(", "); }
      else { const lab=resolveOptionLabel(col.settings,val??raw); if(lab) raw=lab; }
    }
    return raw;
  }
  const cellIdx=new Map(); // board:record:col -> cv
  for(const cv of cells){ cellIdx.set(`${cv.board_id}:${cv.record_id}:${cv.column_id}`, cv); }
  const recsByBoard=new Map();
  for(const r of recs){ if(!recsByBoard.has(r.board_id)) recsByBoard.set(r.board_id,[]); recsByBoard.get(r.board_id).push(r); }
  const report=[]; let grand={total:0,withClient:0,visible:0,hidden:0,empty:0,unmappedBoard:0};
  const missingValues=new Map(); // key norm|raw -> {raw,count,boards:Set,reasons:Set,hiddenName?,clientId?}
  const hiddenCounts=new Map(); // client canonical -> {id,name,count,raws:Set}
  const safariCounts={records:0,byRaw:{}}; const levisCounts={records:0,byRaw:{}};
  function addMissing(raw, reason, boardName, extra={}){
    const k=norm(raw)+"||"+(raw||"");
    if(!missingValues.has(k)) missingValues.set(k,{raw:raw||"",norm:norm(raw),count:0,boards:new Set(),reasons:new Set(),...extra});
    const e=missingValues.get(k); e.count++; e.boards.add(boardName); e.reasons.add(reason);
    if(extra.hiddenName) e.hiddenName=extra.hiddenName; if(extra.clientId) e.clientId=extra.clientId;
  }
  for(const b of boards){
    const bRecs=recsByBoard.get(b.id)||[];
    const clientColId=clientMapByBoard.get(b.id)||null;
    const row={board:b.name,boardId:b.id,total:bRecs.length,withClient:0,visible:0,hidden:0,empty:0,unmappedBoard: clientColId?0:bRecs.length, hiddenByName:{}};
    if(!clientColId){
      row.empty=0; row.withClient=0; // all counted as unmapped-board records per spec? spec: "records on boards with no client mapping at all"
      // client values may exist but board has no mapping; we still must account records
      for(const r of bRecs){ addMissing("(board has no client mapping)", "unmapped board", b.name); }
    } else {
      const col=colById.get(clientColId);
      for(const r of bRecs){
        const cv=cellIdx.get(`${b.id}:${r.id}:${clientColId}`);
        const raw=cellText(col,cv);
        if(!raw){ row.empty++; addMissing("", "empty", b.name); }
        else {
          row.withClient++;
          const n=norm(raw);
          const cid=aliasToClient.get(n);
          if(cid && visibleClientIds.has(cid)){
            row.visible++;
          } else if(cid && clientById.get(cid)?.needs_confirmation){
            row.hidden++;
            const cname=clientById.get(cid).canonical_name;
            row.hiddenByName[cname]=(row.hiddenByName[cname]||0)+1;
            if(!hiddenCounts.has(cid)) hiddenCounts.set(cid,{id:cid,name:cname,count:0,raws:new Set()});
            hiddenCounts.get(cid).count++; hiddenCounts.get(cid).raws.add(raw);
            addMissing(raw,"hidden (needs_confirmation)", b.name,{hiddenName:cname,clientId:cid});
          } else if(cid){
            // has alias/client but not visible and not needs_confirmation? treat as no-alias/other
            row.hidden++; // shouldn't happen
            addMissing(raw,"not in selector", b.name,{clientId:cid});
          } else {
            // no alias mapping -> not in selector
            row.hidden++; // matched? spec says "matched only to hidden..." vs not appearing in selector - better count as unmatched-to-visible; but easier: treat as hidden bucket? no.
            // spec buckets: with non-empty client value split into matched visible / matched hidden / (implied: non-empty but not matched to any canonical?) need to be careful.
            addMissing(raw,"no alias/client mapping", b.name);
          }
        }
        // safari/levis counts straight from records by raw/normalized alias family
        const raw2 = clientColId ? cellText(col,cellIdx.get(`${b.id}:${r.id}:${clientColId}`)) : "";
        const nn=norm(raw2);
        if(["safari","safari select","safari genie"].includes(nn)){ safariCounts.records++; safariCounts.byRaw[raw2]=(safariCounts.byRaw[raw2]||0)+1; }
        if(["levis","levi s","levis strauss & co","levis strauss and co"].includes(nn) || nn.startsWith("levis " ) || nn==="levi's"){ levisCounts.records++; levisCounts.byRaw[raw2]=(levisCounts.byRaw[raw2]||0)+1; }
      }
    }
    grand.total+=row.total; grand.withClient+=row.withClient; grand.visible+=row.visible; grand.hidden+=row.hidden; grand.empty+=row.empty; grand.unmappedBoard+=row.unmappedBoard;
    report.push(row);
  }
  // refine withClient/visible/hidden: recompute properly including "no alias" as neither visible nor hidden-client-match
  // adjust: rows where non-empty but no alias to client -> not matched visible, not matched hidden(needs_confirmation); count separately
  const missingList=[...missingValues.values()].map(v=>({raw:v.raw,count:v.count,boards:[...v.boards],reasons:[...v.reasons],hiddenName:v.hiddenName||null})).sort((a,b)=>b.count-a.count);
  const out={org:pickOrg,grand,boards:report,hiddenClients:[...hiddenCounts.values()].map(h=>({name:h.name,id:h.id,count:h.count,raws:[...h.raws]})).sort((a,b)=>b.count-a.count),missingFromSelector:missingList,safariLevis:{safari:safariCounts,levis:levisCounts},counts:{boards:boards.length,activeRecords:recs.length,fieldMappings:maps.length,clients:clients.length,aliases:aliases.length}};
  console.log(JSON.stringify(out,null,2));
})().catch(e=>{console.error(e);process.exit(1)});
