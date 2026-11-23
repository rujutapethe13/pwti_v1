const fs=require("fs"); let raw=fs.readFileSync("scripts/_step1deep2.txt","utf8"); if(raw.charCodeAt(0)===0xFEFF) raw=raw.slice(1);
const d=JSON.parse(raw);
console.log("===OCT===\n"+JSON.stringify(d.october,null,2));
console.log("\n===OTHER_UNMAPPED===\n"+JSON.stringify(d.otherUnmapped,null,2));
console.log("\n===JOBS_DATA===\n"+JSON.stringify(d.jobsDataBoards,null,2));
console.log("\n===ALL_BOARDS===\n"+JSON.stringify(d.allBoardsStatus,null,2));
console.log("\n===STATUS_BY_BOARD===\n"+JSON.stringify(d.statusByBoard,null,2));
console.log("\n===COUNTS_SAFLEV===\n"+JSON.stringify({counts:d.counts,snapSafari:d.snapSafari,snapLevis:d.snapLevis,recSafari:d.recSafari,recLevis:d.recLevis,safBoards:d.safBoards,levBoards:d.levBoards},null,2));
