const fs=require('fs');
const p='C:/powerweave-studio-os/supabase/migrations/20261029120000_fix_members_uuid_mismatches.sql';
let c=fs.readFileSync(p,'utf8');
c=c.split('as \r\n').join('as \r\n');
c=c.split('\r\nend\r\n').join('\r\nend\r\n;\r\n');
fs.writeFileSync(p,c);
console.log((c.match(/\$\$/g)||[]).length);
