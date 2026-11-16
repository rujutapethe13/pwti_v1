const fs=require("fs"),{createClient}=require("@supabase/supabase-js");
function loadEnvFile(p){const e={};for(const line of fs.readFileSync(p,"utf8").split(/\r?\n/)){const t=line.trim();if(!t||t.startsWith("#"))continue;const i=t.indexOf("=");if(i===-1)continue;e[t.slice(0,i).trim()]=t.slice(i+1).trim();}return e;}
const env=loadEnvFile(".env.local");
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
(async()=>{
  // Find all active boards/groups with Imported row titles
  const {data:recs}=await db.from("records").select("id,board_id,group_id,title").ilike("title","Imported row %").eq("status","active");
  console.log("AFFECTED_ACTIVE",recs.length);
  const byBoard={};
  for(const r of recs||[]){ (byBoard[r.board_id]=byBoard[r.board_id]||[]).push(r); }
  console.log("BOARDS",Object.keys(byBoard).length, JSON.stringify(Object.entries(byBoard).map(([b,rs])=>({board:b,count:rs.length})),null,2));
  let total=0, touched=[];
  for(const [boardId, rows] of Object.entries(byBoard)){
    const {data:cols}=await db.from("columns").select("id,key,label,type,sort_order,group_id,hidden,deleted_at").eq("board_id",boardId).is("deleted_at",null).order("sort_order");
    // pick client/company-like text column, else primary/first text
    const clientCol=(cols||[]).find(c=>/client|company/i.test(c.label||"") && ["text","long_text","email","phone","url"].includes(c.type))
      || (cols||[]).find(c=>["text","long_text","email","phone","url"].includes(c.type));
    if(!clientCol){ console.log("SKIP no text col",boardId); continue; }
    const ids=rows.map(r=>r.id);
    const {data:cells}=await db.from("cell_values").select("record_id,value_text").in("record_id",ids).eq("column_id",clientCol.id);
    const cellMap=Object.fromEntries((cells||[]).map(c=>[c.record_id,(c.value_text||"").trim()]));
    for(const r of rows){
      const v=cellMap[r.id];
      if(!v || /^Imported row \d+$/i.test(v)) continue;
      const {error}=await db.from("records").update({title:v}).eq("id",r.id).ilike("title","Imported row %");
      if(error){ console.log("ERR",r.id,error.message); }
      else { total++; touched.push({id:r.id,board:boardId,old:r.title,new:v}); }
    }
  }
  console.log("REPAIRED",total);
  console.log("TOUCHED",JSON.stringify(touched.slice(0,40),null,2));
})();
