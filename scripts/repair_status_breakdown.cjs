/**
 * Idempotent repair: Status breakdown dashboard widget across all boards.
 * - Dry-run by default: prints per-board changes, writes nothing.
 * - --apply: persists changes (service_role). Run against live DB only after review.
 * - Only touches dashboard view `settings.widgets` / `columnRoles`; never deletes
 *   records, columns, or user cell data.
 *
 * Usage:
 *   node scripts/repair_status_breakdown.cjs           # dry-run
 *   node scripts/repair_status_breakdown.cjs --apply   # apply
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnv(f){const e={};for(const l of fs.readFileSync(f,"utf8").split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith("#"))continue;const i=t.indexOf("=");if(i>0)e[t.slice(0,i).trim()]=t.slice(i+1).trim()}return e}
const env = loadEnv(path.join(process.cwd(), ".env.local"));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{autoRefreshToken:false,persistSession:false} });
const APPLY = process.argv.includes("--apply");

const STATUS_LAYOUT = { x: 8, y: 2, w: 4, h: 8, minW: 3, minH: 3 };
const TEMPLATE_ROLE_BINDINGS = {
  status:{xAxisRole:"status"}, trend:{timeRole:"receivedDate"}, "trend-done":{timeRole:"completedDate"},
  "by-client":{xAxisRole:"client"}, "by-job-type":{xAxisRole:"jobType"},
  "client-x-job-type":{xAxisRole:"client",stackByRole:"jobType"}, "skus-by-client":{xAxisRole:"client"},
  "workload-by-owner":{xAxisRole:"owner"}, "turnaround-by-client":{xAxisRole:"client"},
};
function widgetKey(id){const s=String(id||"").split("-");return s.slice(0,Math.max(1,s.length-2)).join("-")}
function repairWidgets(widgets){
  return (widgets||[]).map(w=>{
    const key=widgetKey(w.id); const bind=TEMPLATE_ROLE_BINDINGS[key]; let next=w;
    if(bind && !["kpi-card","due-list","jobs-table"].includes(w.type)){
      const cfg={...(w.config||{})}; let ch=false;
      for(const [f,role] of Object.entries(bind)) if(!cfg[f]){cfg[f]=role;ch=true}
      if(key==="status"){
        const set=(k,v)=>{if(cfg[k]!==v){cfg[k]=v;ch=true}};
        set("chartType","donut"); set("yAxisMode","count"); set("showValueAs","percent");
        set("showEmptyValues",false); set("useMeasure",true);
        if(cfg.yAxisColumnId){cfg.yAxisColumnId="";ch=true}
        if(!cfg.xAxisRole){cfg.xAxisRole="status";ch=true}
      }
      if(ch) next={...next,config:cfg};
    }
    if(key==="status" && next.title==="Status breakdown"){
      const sizeBad = next.w!==STATUS_LAYOUT.w||next.h!==STATUS_LAYOUT.h||next.minW!==STATUS_LAYOUT.minW||next.minH!==STATUS_LAYOUT.minH;
      if(sizeBad) next={...next,...STATUS_LAYOUT};
    }
    return next;
  });
}
function hasStatusBreakdown(widgets){return (widgets||[]).some(w=>w.title==="Status breakdown" || (w.type==="chart"&&w.config&&w.config.xAxisRole==="status"))}
function addStatusBreakdown(widgets,statusColId,roles){
  if(hasStatusBreakdown(widgets)) return widgets;
  const w={id:`status-${Date.now()}-repair`,type:"chart",title:"Status breakdown",...STATUS_LAYOUT,
    config:{chartType:"donut",xAxisRole:"status",xAxisColumnId:statusColId||roles?.status||"",yAxisMode:"count",yAxisColumnId:"",useMeasure:true,showValueAs:"percent",showEmptyValues:false,sortBy:"y_desc",showLabels:true,showGrid:true,groups:{all:true,top:true,ids:[]},seriesColors:{},benchmarkLines:[],visibleColumns:[],showCumulative:false,stackByColumnId:"",showOnlyTopBottom:false,seriesLabelOverrides:{}},
    hasFilter:false};
  return [...(widgets||[]),w];
}
function pickStatusCol(cols,roles){
  if(roles?.status && cols.some(c=>c.id===roles.status && c.type==="status")) return cols.find(c=>c.id===roles.status);
  const byType=cols.filter(c=>c.type==="status");
  return byType.find(c=>/^\s*status\s*$/i.test(c.label))||byType.find(c=>!/(invoice|billing)/i.test(c.label))||byType[0]||null;
}

(async()=>{
  const {data:boards}=await db.from("boards").select("id,name,organization_id,workspace_id,status").eq("status","active").order("name");
  const {data:views}=await db.from("views").select("id,board_id,name,type,settings,organization_id,workspace_id").eq("type","dashboard");
  const {data:cols}=await db.from("columns").select("id,board_id,label,type").is("deleted_at",null);
  const byB={}; for(const b of boards||[]) byB[b.id]={board:b,views:[],cols:[]};
  for(const v of views||[]) if(byB[v.board_id]) byB[v.board_id].views.push(v);
  for(const c of cols||[]) if(byB[c.board_id]) byB[c.board_id].cols.push(c);
  const report=[];
  for(const b of boards||[]){
    const e=byB[b.id];
    if(e.views.length===0){report.push({board:b.name,boardId:b.id,action:"NO_DASHBOARD",changes:[]}); continue}
    for(const v of e.views){
      const s={...(v.settings||{})}; const roles={...(s.columnRoles||{})}; const statusCol=pickStatusCol(e.cols,roles);
      const changes=[];
      if(statusCol && !roles.status){roles.status=statusCol.id; changes.push(`set columnRoles.status=${statusCol.label}[${statusCol.id.slice(0,8)}]`)}
      let widgets=Array.isArray(s.widgets)?JSON.parse(JSON.stringify(s.widgets)):[];
      const before=JSON.stringify(widgets);
      if(!hasStatusBreakdown(widgets)){
        widgets=addStatusBreakdown(widgets,statusCol?.id,roles);
        changes.push(statusCol?`added Status breakdown -> ${statusCol.label}`:"added Status breakdown (no status column found; needs mapping)");
      }
      widgets=repairWidgets(widgets);
      if(JSON.stringify(widgets)!==before && !changes.some(c=>c.startsWith("added"))) changes.push("repaired Status breakdown config/layout/bindings");
      if(changes.length){
        const next={...s,widgets,columnRoles:roles};
        report.push({board:b.name,boardId:b.id,viewId:v.id,view:v.name,action:APPLY?"APPLIED":"DRY_RUN",changes,statusColumn:statusCol?`${statusCol.label}(${statusCol.id})`:null});
        if(APPLY){ const {error}=await db.from("views").update({settings:next}).eq("id",v.id); if(error) report[report.length-1].error=error.message; }
      } else {
        report.push({board:b.name,boardId:b.id,viewId:v.id,view:v.name,action:"OK",changes:[]});
      }
    }
  }
  console.log(`MODE=${APPLY?"APPLY":"DRY_RUN"}\n`);
  for(const r of report) console.log(`- ${r.board} [${r.action}] ${r.changes.join(" | ")||"already correct"}${r.error?" ERROR:"+r.error:""}`);
  const touched=report.filter(r=>r.changes.length);
  console.log(`\nSUMMARY: boards=${boards.length} dashboard-views=${(views||[]).filter(v=>byB[v.board_id]).length} touched=${touched.length} no-dashboard=${report.filter(r=>r.action==="NO_DASHBOARD").length}`);
})();
