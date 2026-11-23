const fs=require('fs'); let raw=fs.readFileSync('scripts/_step1deep2.txt','utf8'); if(raw.charCodeAt(0)===0xFEFF) raw=raw.slice(1);
const d=JSON.parse(raw);
for(const b of d.det){
  console.log(`\n## ${b.board} (${b.boardId})`);
  const m=b.mapped, dt=b.detect;
  const show=(k)=>{const x=dt[k]||m[k]; return x?`${x.label||x.column} [${x.type||""}] id=${x.columnId||x.id||""} src=${x.source||"detect"}${x.confidence!=null?"/"+x.confidence:""}`:"—";};
  console.log(JSON.stringify({client:show("client"),receive_date:show("receive_date"),job_status:show("job_status"),batch_job_id:show("batch_job_id"),image_count:show("image_count"),upload_date:show("upload_date"),invoice_amount:show("invoice_amount"),invoice_status:show("invoice_status"),assignee_owner:show("assignee_owner")},null,2));
}
