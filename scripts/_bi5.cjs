const fs=require("fs"); let raw=fs.readFileSync("scripts/_boardinv2.txt","utf8"); if(raw.charCodeAt(0)===0xFEFF) raw=raw.slice(1);
const d=JSON.parse(raw);
console.log(JSON.stringify(d.statusVals["board-1792047259966-qpmvnh6"]?null:"no",null,2));
// print status for unnamed
for(const k of Object.keys(d.statusVals)){ const v=d.statusVals[k]; if(v.id && (v.id.startsWith("board-1792")||v.id==="3ba6c406-7b1e-4c25-ba01-6144da60d5ff"||v.id==="f38771a6-69e5-491a-b9bd-9cf35f116fe2"||v.id==="b768cfeb-3c4f-451a-aa58-1d5e79d318e2"||v.id==="60370ba1-f6e6-4a3c-acb4-d9158e32b6e1")) console.log(JSON.stringify(v,null,2)); }
