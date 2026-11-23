const fs=require("fs"); let raw=fs.readFileSync("scripts/_boardinv2.txt","utf8"); if(raw.charCodeAt(0)===0xFEFF) raw=raw.slice(1);
const d=JSON.parse(raw);
// need full inventory including unnamed? earlier print cut - reconstruct from maps
const inv=d.inventory;
console.log("COUNT",inv.length);
for(const b of inv) if(b.highlightUnnamed) console.log(JSON.stringify(b));
