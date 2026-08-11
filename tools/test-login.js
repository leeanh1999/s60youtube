'use strict';

// Kiem thu luong dang nhap bang ma: lay ma tren "may Nokia", nop cookie tu "may tinh".
const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const UA_NOKIA =
  'Mozilla/5.0 (Symbian/3; Series60/5.3 NokiaN8-00/111.040.1511; Profile/MIDP-2.1 Configuration/CLDC-1.1) AppleWebKit/535.1 (KHTML, like Gecko) NokiaBrowser/8.3.1.4 Mobile Safari/535.1';

const FAKE_COOKIES = [
  '# Netscape HTTP Cookie File',
  ['.youtube.com', 'TRUE', '/', 'TRUE', '1799999999', 'SID', 'gia-lap'].join('\t'),
  ['.youtube.com', 'TRUE', '/', 'TRUE', '1799999999', '__Secure-1PSID', 'gia-lap'].join('\t'),
  ['.youtube.com', 'TRUE', '/', 'TRUE', '1799999999', 'HSID', 'gia-lap'].join('\t'),
].join('\n');

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  OK   ${name}`);
  } else {
    failed += 1;
    console.log(`  LOI  ${name} ${detail}`);
  }
}

async function get(path, ua = UA_NOKIA) {
  const res = await fetch(BASE + path, { headers: { 'User-Agent': ua }, redirect: 'manual' });
  return { res, body: await res.text() };
}

async function post(path, form) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
  return { res, body: await res.text() };
}

(async () => {
  console.log('1. May Nokia mo trang dang nhap');
  const login = await get('/login');
  const code = (login.body.match(/\/qr\?c=([A-Z0-9]+)/) || [])[1];
  check('trang tra ve 200', login.res.status === 200);
  check('co ma ghep noi', Boolean(code), `code=${code}`);
  check('co the meta refresh', /http-equiv="refresh"/.test(login.body));
  check('khong co JavaScript', !/<script/i.test(login.body));
  check('ma hien dang ABC-123', /class="code">[A-Z0-9]{3}-[A-Z0-9]{3}</.test(login.body));

  console.log('2. Anh QR');
  const qr = await fetch(`${BASE}/qr?c=${code}`);
  const png = Buffer.from(await qr.arrayBuffer());
  check('QR tra ve PNG', qr.headers.get('content-type') === 'image/png');
  check('PNG dung chu ky', png.slice(1, 4).toString('latin1') === 'PNG');
  check('QR du nho cho may cu', png.length < 20000, `${png.length} byte`);

  const badQr = await fetch(`${BASE}/qr?c=ZZZZZZ`);
  check('ma sai thi khong co QR', badQr.status === 404);

  console.log('3. May tinh mo trang /link');
  const link = await get(`/link?c=${code}`, 'Mozilla/5.0 Chrome/125');
  check('trang link 200', link.res.status === 200);
  check('dien san ma', link.body.includes(`${code.slice(0, 3)}-${code.slice(3)}`));

  console.log('4. Nop sai');
  const wrongCode = await post('/link', { code: 'AAA-AAA', cookies: FAKE_COOKIES });
  check('tu choi ma sai', wrongCode.res.status === 400 && /hết hạn/.test(wrongCode.body));

  const junk = await post('/link', { code, cookies: 'day khong phai cookie' });
  check('tu choi noi dung rac', junk.res.status === 400 && /Netscape/.test(junk.body));

  const empty = await post('/link', { code, cookies: '' });
  check('tu choi noi dung rong', empty.res.status === 400);

  console.log('5. Nop dung');
  const ok = await post('/link', { code, cookies: FAKE_COOKIES });
  check('nhan cookie hop le', ok.res.status === 200 && /Đã kết nối/.test(ok.body));

  const reuse = await post('/link', { code, cookies: FAKE_COOKIES });
  check('ma chi dung duoc mot lan', reuse.res.status === 400);

  console.log('6. May Nokia thay trang thai moi');
  const after = await get('/login');
  check('bao da dang nhap', /Đã đăng nhập/.test(after.body));
  check('het tu lam moi', !/http-equiv="refresh"/.test(after.body));

  const home = await get('/');
  check('trang chinh het canh bao', !/Chưa cấu hình cookie/.test(home.body));

  console.log('7. Dang xuat, tra may ve trang thai sach');
  const out = await get('/logout');
  check('chuyen huong ve /login', out.res.status === 302);
  const final = await get('/login');
  check('quay lai man hinh ma', /class="code"/.test(final.body));

  console.log(`\nDat ${passed}, hong ${failed}`);
  process.exitCode = failed ? 1 : 0;
})();
