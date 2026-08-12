'use strict';

// Kiem thu luong dang nhap bang ma: lay ma tren "may Nokia", nop cookie tu "may tinh".
// Chay hai "may Nokia" song song de chac chan cookie cua may nay khong dinh sang may kia.
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

/** Vai buoc can may chu ra duoc YouTube; khong co mang thi bo qua chu khong bao hong. */
function skip(name, why) {
  console.log(`  BO QUA ${name} — ${why}`);
}

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  OK   ${name}`);
  } else {
    failed += 1;
    console.log(`  LOI  ${name} ${detail}`);
  }
}

/** Undici cu chua co getSetCookie(); luc do phai tu tach header da bi gop. */
function setCookies(res) {
  if (typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie();
  const raw = res.headers.get('set-cookie');
  return raw ? raw.split(/,\s*(?=[A-Za-z0-9_-]+=)/) : [];
}

/** Mot "may" giu rieng hu cookie cua no, giong het trinh duyet that. */
function device(ua = UA_NOKIA) {
  const jar = new Map();

  function absorb(res) {
    for (const line of setCookies(res)) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  async function get(path) {
    const headers = { 'User-Agent': ua };
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(BASE + path, { headers, redirect: 'manual' });
    absorb(res);
    return { res, body: await res.text() };
  }

  return { get, jar };
}

async function post(path, form) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
  return { res, body: await res.text() };
}

const codeOf = (body) => (body.match(/\/qr\?c=([A-Z0-9]+)/) || [])[1];

(async () => {
  const nokia = device();
  const hangXom = device();

  console.log('1. May Nokia mo trang dang nhap');
  const login = await nokia.get('/login');
  const code = codeOf(login.body);
  check('trang tra ve 200', login.res.status === 200);
  check('co ma ghep noi', Boolean(code), `code=${code}`);
  check('may duoc phat ma thiet bi', /^[0-9a-f]{32}$/.test(nokia.jar.get('did') || ''));
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
  const link = await device('Mozilla/5.0 Chrome/125').get(`/link?c=${code}`);
  check('trang link 200', link.res.status === 200);
  check('dien san ma', link.body.includes(`${code.slice(0, 3)}-${code.slice(3)}`));

  console.log('4. Nop sai');
  // 429 khi bo dem do ma con nong tu lan chay truoc — van la tu choi.
  const wrongCode = await post('/link', { code: 'AAA-AAA', cookies: FAKE_COOKIES });
  check(
    'tu choi ma sai',
    wrongCode.res.status >= 400 && /hết hạn|quá nhiều lần/.test(wrongCode.body),
    `HTTP ${wrongCode.res.status}`
  );

  const junk = await post('/link', { code, cookies: 'day khong phai cookie' });
  check('tu choi noi dung rac', junk.res.status === 400 && /Netscape/.test(junk.body));

  const empty = await post('/link', { code, cookies: '' });
  check('tu choi noi dung rong', empty.res.status === 400);

  console.log('5. Nop dung');
  const ok = await post('/link', { code, cookies: FAKE_COOKIES });
  check('nhan cookie hop le', ok.res.status === 200 && /Đã kết nối/.test(ok.body));

  const reuse = await post('/link', { code, cookies: FAKE_COOKIES });
  check('ma chi dung duoc mot lan', reuse.res.status >= 400, `HTTP ${reuse.res.status}`);

  console.log('6. May Nokia thay trang thai moi');
  const after = await nokia.get('/login');
  check('bao da dang nhap', /Đã đăng nhập/.test(after.body));
  check('noi ro la tai khoan rieng', /tài khoản riêng của bạn/.test(after.body));
  check('het tu lam moi', !/http-equiv="refresh"/.test(after.body));

  const home = await nokia.get('/');
  check('trang chinh het canh bao', !/chưa nối tài khoản/.test(home.body));

  console.log('7. May thu hai khong an theo cookie cua may thu nhat');
  const other = await hangXom.get('/login');
  check(
    'may khac co ma thiet bi khac',
    hangXom.jar.get('did') && hangXom.jar.get('did') !== nokia.jar.get('did')
  );
  check('may khac van phai dang nhap', /class="code"/.test(other.body));
  check('ma cua may khac la ma moi', codeOf(other.body) !== code);

  // May thu ba thu dung lai ma dang hien tren may hang xom: phai bi phat ma
  // khac, khong thi cookie nap vao se roi nham may.
  const otherCode = codeOf(other.body);
  const stolen = await device().get(`/login?c=${otherCode}`);
  check('khong muon duoc ma cua may khac', codeOf(stolen.body) !== otherCode);

  console.log('8. Khoa phat trong dia chi');
  const watch = await nokia.get('/watch?v=jNQXAC9IVRw');
  const streamKey = (watch.body.match(/\/(?:stream|audio)\/[\w-]{11}\?k=([0-9a-f]{24})/) ||
    [])[1];
  if (streamKey) {
    check('trang xem co khoa phat', true);
    // Trinh phat khong gui cookie, chi co khoa — khong duoc phat them ma thiet bi.
    const player = await fetch(`${BASE}/about?k=${streamKey}`);
    check('khoa nhan ra dung may', /Tài khoản riêng của máy này/.test(await player.text()));
    check('khoa khong sinh ma thiet bi moi', !setCookies(player).length);
  } else {
    skip('khoa phat trong dia chi', 'may chu khong lay duoc thong tin video (mang?)');
  }
  const badKey = await fetch(`${BASE}/about?k=${'0'.repeat(24)}`);
  check('khoa bay khong nhan ra may nao', !/Tài khoản riêng/.test(await badKey.text()));

  console.log('9. Xoa dang nhap phai dung may va dung ma chong CSRF');
  const token = (
    (await nokia.get('/login')).body.match(/\/logout\?t=([0-9a-f]{16})/) || []
  )[1];
  check('trang dang nhap co ma chong CSRF', Boolean(token));

  await fetch(`${BASE}/logout?t=${token}`);
  const stillIn = await nokia.get('/login');
  check('nguoi la co ma van khong xoa duoc', /Đã đăng nhập/.test(stillIn.body));

  const noToken = await nokia.get('/logout');
  check('thieu ma chong CSRF thi khong xoa', noToken.res.status === 302);
  check('van con dang nhap', /Đã đăng nhập/.test((await nokia.get('/login')).body));

  console.log('10. Dang xuat that, tra may ve trang thai sach');
  const out = await nokia.get(`/logout?t=${token}`);
  check('chuyen huong ve /login', out.res.status === 302);
  const final = await nokia.get('/login');
  check('quay lai man hinh ma', /class="code"/.test(final.body));

  if (streamKey) {
    const revoked = await fetch(`${BASE}/about?k=${streamKey}`);
    check('khoa phat cu het hieu luc', !/Tài khoản riêng/.test(await revoked.text()));
  }

  console.log(`\nDat ${passed}, hong ${failed}`);
  process.exitCode = failed ? 1 : 0;
})();
