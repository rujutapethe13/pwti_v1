function formatYmd(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
function parseDateForPaste(str) {
  const s = str.trim();
  let m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return formatYmd(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/);
  if (m) { const yy = +m[3]; return formatYmd(yy < 50 ? 2000 + yy : 1900 + yy, +m[2], +m[1]); }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[Ts])/);
  if (m) return formatYmd(+m[1], +m[2], +m[3]);
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 59 && n < 100000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n * 86400000));
      return formatYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
  }
  return null;
}
const tests = ['05-01-2026','5/1/2026','05/01/2026','2026-01-05','5-1-26','01-05-2026','31 Feb 2026','44500','abc','05-01-26','1/1/26','5/1/2026 '];
for (const t of tests) console.log(JSON.stringify(t), '->', parseDateForPaste(t));