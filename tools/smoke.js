'use strict';

// Kiem thu nhanh: goi cac trang bang User-Agent cua Nokia Symbian Belle.
const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const UA =
  'Mozilla/5.0 (Symbian/3; Series60/5.3 NokiaN8-00/111.040.1511; Profile/MIDP-2.1 Configuration/CLDC-1.1) AppleWebKit/535.1 (KHTML, like Gecko) NokiaBrowser/8.3.1.4 Mobile Safari/535.1';

const PATHS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      '/',
      '/search?q=nhac%20tre',
      '/about',
      '/settings',
      '/s60.css',
      '/mini.css',
      '/s60.js',
      '/i/home-red.png',
      '/khong-co-trang',
    ];

/**
 * Nokia Browser 8.x doc duoc CSS3 co ban (bo goc, rgba) va JavaScript, nen hai
 * thu do khong con la loi. Con lai la nhung thu no that su khong hieu, va can
 * nang cua trang.
 */
function check(path, body, type) {
  // Bo chu thich truoc khi do, tranh bao dong gia.
  const code = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  const problems = [];

  // Bieu tuong: may chu phai to duoc hinh ra PNG. Hong cho nay thi tren may
  // that moi cho co bieu tuong chi con la khoang trong.
  if (path.endsWith('.png')) {
    if (!/^image\/png/.test(String(type))) problems.push(`khong phai anh PNG (${type})`);
    else if (body.length < 100) problems.push('anh rong');
    return problems;
  }

  if (path.endsWith('.js')) {
    // Ban WebKit 535 chi chay ES5: mot chu 'const' la ca file chet, ma no chet
    // im lang nen phai bat o day.
    for (const [re, name] of [
      [/=>/, 'arrow function'],
      [/\b(let|const|class)\s/, 'tu khoa ES6'],
      [/`/, 'template string'],
      [/\?\.|\?\?/, 'optional chaining'],
    ]) {
      if (re.test(code)) problems.push(`JS dung ${name}`);
    }
  } else {
    if (/display:\s*(flex|grid)|position:\s*sticky|var\(--/i.test(code)) {
      problems.push('co CSS ma Belle khong hieu');
    }
    // Con dau chu thich sot lai sau khi da bo het cac cap /* */ nghia la co mot
    // chu thich dong som hay quen dong. Trinh duyet khong bao gi ca: no bo qua
    // doan chu roi nuot luon quy tac ngay sau do — mat mot muc bo cuc ma nhin
    // ma nguon van thay du.
    if (path.endsWith('.css') && /\/\*|\*\//.test(code)) {
      problems.push('chu thich CSS dong som hoac quen dong');
    }
    // Trinh duyet goc cua Symbian khong co bo ve SVG: dat <svg> thang vao trang
    // thi no khong bao loi gi ma cung khong ve gi. Bieu tuong phai la anh PNG.
    if (/<svg\b/i.test(code)) problems.push('co SVG dat thang trong trang');
    // Phan them bang JavaScript phai nam trong file rieng: trang van phai
    // dung duoc khi may tat script hoac tai file loi.
    if (/<script(?![^>]*\bsrc=)/i.test(code)) problems.push('co script noi tuyen');
  }

  if (code.length > 60000) problems.push(`trang nang (${code.length} byte)`);
  return problems;
}

(async () => {
  let found = 0;
  for (const p of PATHS) {
    const started = Date.now();
    try {
      const res = await fetch(BASE + p, { headers: { 'User-Agent': UA } });
      const body = await res.text();
      const links = (body.match(/watch\?v=/g) || []).length;
      const problems = check(p, body, res.headers.get('content-type'));
      found += problems.length;
      console.log(
        `[${p}] HTTP ${res.status} ${res.headers.get('content-type')} ` +
          `${body.length}B ${Date.now() - started}ms links=${links}` +
          (problems.length ? ` !! ${problems.join(', ')}` : '')
      );
    } catch (err) {
      console.log(`[${p}] LOI ${err.cause?.message || err.message}`);
    }
  }
  // Bao that bai de CI dung lai: khong thi may Nokia moi la noi phat hien ra
  // trang da hong, ma luc do anh Docker da phat hanh xong.
  if (found) {
    console.log(`\n${found} cho khong hop voi may Symbian — xem cac dong co !!`);
    process.exitCode = 1;
  }
})();
