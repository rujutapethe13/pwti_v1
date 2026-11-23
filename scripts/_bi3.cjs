const fs=require("fs"); let raw=fs.readFileSync("scripts/_boardinv2.txt","utf8"); if(raw.charCodeAt(0)===0xFEFF) raw=raw.slice(1);
const d=JSON.parse(raw);
// finish unnamed (inventory list cut after first 15? check)
const all=d.inventory;
const unnamedIds=["board-1792047259966-qpmvnh6","board-1792039790753-5o1nfgh","3ba6c406-7b1e-4c25-ba01-6144da60d5ff","f38771a6-69e5-491a-b9bd-9cf35f116fe2","b768cfeb-3c4f-451a-aa58-1d5e79d318e2","60370ba1-f6e6-4a3c-acb4-d9158e32b6e1"];
const invById=new Map(all.map(b=>[b.id,b]));
console.log("###UNNAMED_INV");
for(const id of unnamedIds) console.log(JSON.stringify(invById.get(id),null,2));
console.log("###UNNAMED_COLS_KEYS");
for(const id of unnamedIds){ const cols=d.unnamedCols[id]||[]; console.log(id,cols.length,JSON.stringify(cols.map(c=>c.label))); }
console.log("###OCTVALS"); console.log(JSON.stringify(d.octDistinct,null,2));
console.log("###DENY"); console.log(JSON.stringify(d.denyWhere,null,2));
