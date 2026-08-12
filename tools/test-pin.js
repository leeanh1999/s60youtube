'use strict';

/**
 * Kiem thu phep do 'position: fixed' trong public/s60.js — khong can dien thoai,
 * khong can may chu.
 *
 * Cho nay khong the thu bang mat tren may tinh: trinh duyet nao tren may tinh
 * cung dan dung, nen moi loi chi lo ra tren dien thoai. Ma dan sai thi mat han
 * chan trang, con do sai theo huong nguoc lai thi hai thanh troi mat khi cuon —
 * dung loi da gap tren Opera Mobile 12.
 *
 * Nen dung may "may gia" o day, moi may bat chuoc dung mot kieu cua doi that,
 * roi chay chinh file s60.js that tren chung:
 *
 *  1. dan-dung  — dan that, va do cai gi cung dung (Nokia Browser doi Belle,
 *                 va moi trinh duyet may tinh). Chi may nay moi duoc dan.
 *  2. dan-gia   — nhan 'fixed' roi xu ly nhu 'absolute': cuon la thanh troi.
 *  3. khong-dan — khong biet 'fixed', ha xuong 'static'.
 *  4. opera-so  — cuon that nhung so cuon cua window khong nhich.
 *  5. opera-toa — so cuon nhich nhung toa do getBoundingClientRect khong theo.
 *  6. presto    — do cai gi cung dep nhu may dan that, nhung ten may la Opera
 *                 Mobile. Presto khong dan that: cuon thi lop dan di theo trang
 *                 roi nhay ve cho dung sau khi ngung cuon. Phai nhan ra bang
 *                 ten may va bo han viec dan — de dan thi thanh vua troi vua
 *                 nhay giat, con te hon khong dan.
 *
 * Ba may 3-4-5 cung phai ra "khong dan": do khong duoc thi coi nhu khong dan,
 * chi dan khi co bang chung.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 's60.js'), 'utf8');

/**
 * Mot chiec may gia. Toa do cua o do la cho khac nhau duy nhat giua bon may:
 *  - o 'fixed' tren may dan dung thi luon o dinh khung nhin (top = 0);
 *  - tren may dan gia thi no troi theo trang nhu o 'absolute' (top = -cuon);
 *  - tren hai may Opera thi toa do va so cuon khong an khop nhau.
 */
function machine(kind) {
  let scrolled = 0;
  const attached = [];

  const rectOf = (el) => {
    const glued = el.style.position === 'fixed';
    if (kind === 'dan-gia') return -scrolled;
    if (kind === 'opera-toa') return 0; // toa do dung im du trang da cuon
    if (glued && kind !== 'khong-dan') return 0;
    return -scrolled;
  };

  // Presto khai ten Opera Mobile; may khac khai ten Nokia Browser doi Belle.
  const userAgent =
    kind === 'presto'
      ? 'Opera/9.80 (S60; SymbOS; Opera Mobi/SYB-1202211823; U; vi) Presto/2.10.254 Version/12.00'
      : 'Mozilla/5.0 (Symbian/3; Series60/5.3 NokiaN8-00) AppleWebKit/535.1 (KHTML, like Gecko) NokiaBrowser/8.3.1.4 Mobile Safari/535.1';

  const element = (tag, className) => {
    const el = {
      tagName: tag.toUpperCase(),
      className: className || '',
      style: {},
      offsetHeight: tag === 'div' ? 46 : 58,
      offsetWidth: 640,
      offsetParent: {},
      getAttribute: () => null,
      getElementsByTagName: () => [],
      appendChild: () => {},
      focus: () => {},
      getBoundingClientRect: () => ({ top: rectOf(el), bottom: rectOf(el) + 1, left: 0, right: 1 }),
    };
    return el;
  };

  const bar = element('div', 'bar');
  const nav = element('table', 'nav');
  const body = element('body');
  body.appendChild = (el) => attached.push(el);
  body.removeChild = (el) => attached.splice(attached.indexOf(el), 1);

  const document = {
    body,
    documentElement: { clientHeight: 480, scrollHeight: 1600, scrollTop: 0 },
    activeElement: body,
    createElement: (tag) => element(tag),
    getElementById: () => null,
    getElementsByTagName: (tag) => {
      if (tag === 'div') return [bar];
      if (tag === 'table') return [nav];
      return [];
    },
  };

  const store = {};
  const window = {
    navigator: { userAgent },
    // May 'opera-so' cuon that nhung khong bao lai so cuon.
    pageYOffset: 0,
    scrollTo(_x, y) {
      scrolled = Math.max(0, y);
      if (kind !== 'opera-so') window.pageYOffset = scrolled;
    },
    scrollBy: () => {},
    addEventListener: () => {},
    getComputedStyle: (el) => ({
      // May khong biet 'fixed' thi ha xuong 'static' — y nhu trinh duyet that.
      position: kind === 'khong-dan' && el.style.position === 'fixed' ? 'static' : el.style.position,
    }),
    localStorage: {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => {
        store[key] = String(value);
      },
    },
  };

  return { window, document, bar, nav, store, left: () => attached.length };
}

function run(kind) {
  const box = machine(kind);
  vm.runInNewContext(SOURCE, { window: box.window, document: box.document });
  return {
    pinned: (' ' + box.document.body.className + ' ').indexOf(' fixnav ') > -1,
    padTop: box.document.body.style.paddingTop || '',
    padBottom: box.document.body.style.paddingBottom || '',
    remembered: box.store['s60-pin2'],
    // O do phai don sach: bo lai thi trang co mot o la nam sat dinh.
    leftBehind: box.left(),
  };
}

// 'nho' la thu phai nam trong localStorage sau khi chay. May Presto khong do gi
// nen cung khong nho gi: ten may da du de tra loi, va no khong doi.
const WANTED = [
  { kind: 'dan-dung', pin: true, remember: '1' },
  { kind: 'dan-gia', pin: false, remember: '0' },
  { kind: 'khong-dan', pin: false, remember: '0' },
  { kind: 'opera-so', pin: false, remember: '0' },
  { kind: 'opera-toa', pin: false, remember: '0' },
  { kind: 'presto', pin: false, remember: undefined },
];

let failed = 0;
for (const { kind, pin, remember } of WANTED) {
  const got = run(kind);
  const ok =
    got.pinned === pin &&
    got.leftBehind === 0 &&
    got.remembered === remember &&
    (!pin || (got.padTop === '46px' && got.padBottom === '58px'));
  if (!ok) failed += 1;
  console.log(
    `${ok ? 'OK  ' : '!!  '}${kind.padEnd(10)} dan=${got.pinned} (can ${pin})` +
      ` nho=${got.remembered} chua=${got.padTop}/${got.padBottom} o-bo-lai=${got.leftBehind}`
  );
}

// May Presto khong duoc cuon thu: no chua kip cuon la trang da giat mot cai.
const presto = machine('presto');
vm.runInNewContext(SOURCE, { window: presto.window, document: presto.document });
if (presto.window.pageYOffset !== 0) {
  console.log('!!  may Presto van bi cuon thu du khong can do');
  failed += 1;
} else {
  console.log('OK  may Presto khong bi cuon thu');
}

// Do lai lan hai phai lay ngay ket qua da nho, khong cuon thu nua.
const twice = machine('dan-gia');
vm.runInNewContext(SOURCE, { window: twice.window, document: twice.document });
const before = twice.window.pageYOffset;
vm.runInNewContext(SOURCE, { window: twice.window, document: twice.document });
if (twice.window.pageYOffset !== before) {
  console.log('!!  lan sau van cuon thu lai du da nho ket qua');
  failed += 1;
} else {
  console.log('OK  lan sau dung ngay ket qua da nho, khong cuon thu lai');
}

if (failed) {
  console.log(`\n${failed} cho sai — xem cac dong co !!`);
  process.exitCode = 1;
} else {
  console.log(`\nPhep do dan thanh: dung tren ca ${WANTED.length} kieu may.`);
}
