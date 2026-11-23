const fs=require('fs'); const d=JSON.parse(fs.readFileSync('scripts/_step1deep2.txt','utf8'));
console.log('===DET==='); console.log(JSON.stringify(d.det,null,2));
