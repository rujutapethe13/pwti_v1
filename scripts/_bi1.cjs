const fs=require("fs"); let raw=fs.readFileSync("scripts/_boardinv2.txt","utf8"); if(raw.charCodeAt(0)===0xFEFF) raw=raw.slice(1);
const d=JSON.parse(raw);
console.log("###INV"); console.log(JSON.stringify(d.inventory,null,2));
console.log("###UNNAMED"); console.log(JSON.stringify(d.unnamedCols,null,2));
console.log("###OCT"); console.log(JSON.stringify(d.octDistinct,null,2));
console.log("###NOVOCT"); console.log(JSON.stringify({novInfo:d.novInfo,novCols:d.novCols,octDateCols:d.octCols.filter(c=>/date|inward|receive|upload/i.test(c.label))},null,2));
console.log("###INVSTATUS"); console.log(JSON.stringify(d.invStatus,null,2));
console.log("###DENY"); console.log(JSON.stringify(d.denyWhere,null,2));
console.log("###SUMS"); console.log(JSON.stringify({recordSums:d.recordSums,augActiveBoard:d.augActiveBoard,augArchivedBoard:d.augArchivedBoard,step1ActiveSum:d.step1ActiveSum,snapshotRows:d.snapshotRows,distinctSnap:d.distinctSnap,boardsCount:d.boardsCount},null,2));
