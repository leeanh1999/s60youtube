'use strict';

// Kiem thu nhanh: goi cac trang bang User-Agent cua Nokia Symbian Belle.
const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const UA =
  'Mozilla/5.0 (Symbian/3; Series60/5.3 NokiaN8-00/111.040.1511; Profile/MIDP-2.1 Configuration/CLDC-1.1) AppleWebKit/535.1 (KHTML, like Gecko) NokiaBrowser/8.3.1.4 Mobile Safari/535.1';

const PATHS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['/', '/search?q=nhac%20tre', '/about', '/settings', '/s60.css', '/khong-co-trang'];

function check(body) {
  // Bo chu thich truoc khi do, tranh bao dong gia.
  const code = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  const problems = [];
  if (/<script/i.test(code)) problems.push('co the JavaScript');
  if (/display:\s*(flex|grid)|border-radius|rgba\(/i.test(code)) problems.push('co CSS3');
  if (code.length > 60000) problems.push(`trang nang (${code.length} byte)`);
  return problems;
}

(async () => {
  for (const p of PATHS) {
    const started = Date.now();
    try {
      const res = await fetch(BASE + p, { headers: { 'User-Agent': UA } });
      const body = await res.text();
      const links = (body.match(/watch\?v=/g) || []).length;
      const problems = check(body);
      console.log(
        `[${p}] HTTP ${res.status} ${res.headers.get('content-type')} ` +
          `${body.length}B ${Date.now() - started}ms links=${links}` +
          (problems.length ? ` !! ${problems.join(', ')}` : '')
      );
    } catch (err) {
      console.log(`[${p}] LOI ${err.cause?.message || err.message}`);
    }
  }
})();
