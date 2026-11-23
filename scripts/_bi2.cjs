const fs=require("fs"); let raw=fs.readFileSync("scripts/_boardinv2.txt","utf8"); if(raw.charCodeAt(0)===0xFEFF) raw=raw.slice(1);
const d=JSON.parse(raw);
console.log("###STATUS"); console.log(JSON.stringify(d.statusVals,null,2));
