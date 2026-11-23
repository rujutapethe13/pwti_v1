const { execSync } = require('child_process');
const fs = require('fs');
const baseType = fs.readFileSync('docs/baseline-typecheck.txt','utf8').split(/\r?\n/).filter(Boolean);
const baseTests = fs.readFileSync('docs/baseline-tests.txt','utf8').split(/\r?\n/).filter(Boolean);
let tc = '';
try { tc = execSync('npx tsc --noEmit', { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }); } catch(e){ tc = (e.stdout||'')+(e.stderr||''); }
const curType = tc.split(/\r?\n/).filter(l=>/error TS/.test(l));
const newType = curType.filter(l=>!baseType.includes(l));
let tests = '';
try { tests = execSync('npx vitest run', { encoding: 'utf8', stdio: ['ignore','pipe','pipe'], timeout: 300000 }); } catch(e){ tests = (e.stdout||'')+(e.stderr||''); }
const curTests = tests.split(/\r?\n/).filter(l=>/^ FAIL /.test(l));
const newTests = curTests.filter(l=>!baseTests.includes(l));
if (newType.length || newTests.length) {
  console.error('NEW type errors:', newType.length);
  newType.forEach(l=>console.error(l));
  console.error('NEW test failures:', newTests.length);
  newTests.forEach(l=>console.error(l));
  process.exit(1);
}
console.log('Baseline OK');
EOF