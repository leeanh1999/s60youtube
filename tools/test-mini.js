'use strict';

/**
 * Kiem thu duong danh cho Opera Mini — khong can mang, khong can yt-dlp that.
 *
 * Opera Mini khong ve trang tren dien thoai: may chu cua Opera ve ho roi gui
 * xuong may mot anh chup bam duoc. Nen moi thu can chay TRONG may deu khong co:
 * khong JavaScript, khong meta refresh, khong the <video>, khong phim tat. Bai
 * thu nay canh dung nhung cho do — va canh ca chieu nguoc lai: may Symbian phai
 * nhan y nguyen trang cu, khong dinh gi cua khuon mini.
 *
 * Chay: node tools/test-mini.js
 */

process.env.PORT = '8096';
process.env.WATCH_WAIT_MS = '400';

const path = require('path');

const ROOT = path.join(__dirname, '..');
const ytdlp = require(path.join(ROOT, 'lib', 'ytdlp'));
const innertube = require(path.join(ROOT, 'lib', 'innertube'));

const BASE = 'http://127.0.0.1:8096';
const VIDEO = 'dQw4w9WgXcQ';

// Ten may that cua Opera Mini tren dien thoai Java, va bo header ma chinh proxy
// cua Opera them vao moi lan goi.
const MINI_UA =
  'Opera/9.80 (J2ME/MIDP; Opera Mini/9.80/37.8082; U; vi) Presto/2.12.423 Version/12.16';
const MINI_HEADERS = {
  'User-Agent': MINI_UA,
  'X-OperaMini-Phone-UA': 'NokiaN95/21.0.016 Profile/MIDP-2.0 Configuration/CLDC-1.1',
  'X-OperaMini-Features': 'advanced, folding, secure',
  'X-OperaMini-Phone': 'Nokia # N95',
};
const NOKIA =
  'Mozilla/5.0 (Symbian/3; Series60/5.3 NokiaN8-00) AppleWebKit/535.1 NokiaBrowser/8.3.1.4';

const format = (o) => ({
  width: 0, fps: 0, abr: 0, tbr: 100, filesize: 0,
  protocol: 'https', note: '', ext: 'mp4', url: 'http://x/y', ...o,
});

const video = (i) => ({
  id: `demoVideo${i}`,
  title: 'Nhạc vàng chọn lọc — tuyển tập hay nhất dành cho buổi tối cuối tuần',
  author: 'Kênh Thử Nghiệm',
  duration: 245 + i,
  durationText: '4:05',
  views: '10,1 N lượt xem',
  published: `${i + 1} ngày trước`,
  live: false,
});

ytdlp.getInfo = async (id) => ({
  id,
  title: 'Ten tu yt-dlp',
  author: 'Kenh tu yt-dlp',
  duration: 213,
  views: 1803938823,
  likes: 0,
  uploadDate: '',
  description: 'Mo ta tu yt-dlp',
  isLive: false,
  formats: [
    format({ id: '18', height: 360, vcodec: 'avc1.42001E', acodec: 'mp4a.40.2' }),
    format({ id: '136', height: 720, vcodec: 'avc1.4d401f', acodec: null }),
    format({ id: '140', height: 0, vcodec: null, acodec: 'mp4a.40.2', abr: 128, ext: 'm4a' }),
  ],
});

innertube.related = async () => ({
  video: { title: 'Ten tu InnerTube', author: 'Kenh', views: '1 N', description: 'Mo ta' },
  videos: Array.from({ length: 12 }, (_, i) => video(i)),
});

innertube.search = async () => ({
  videos: Array.from({ length: 12 }, (_, i) => video(i)),
  nextPage: '2',
});

require(path.join(ROOT, 'server.js'));

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

async function mo(pathname, headers) {
  const res = await fetch(BASE + pathname, { headers });
  return { status: res.status, html: await res.text() };
}

const mini = (pathname) => mo(pathname, MINI_HEADERS);
const nokia = (pathname) => mo(pathname, { 'User-Agent': NOKIA });

setTimeout(async () => {
  console.log('1. Nhan ra Opera Mini');
  const home = await mini('/');
  check('trang tra ve 200', home.status === 200);
  check('nap mini.css', home.html.includes('/mini.css?v='));
  check('khong nap s60.css', !home.html.includes('s60.css'));
  // Chi co header cua proxy, ten may thi gia lam mot trinh duyet doi moi —
  // ban Opera Mini tren Android khai ten kieu do.
  const byHeader = await mo('/', {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/125 Mobile',
    'X-OperaMini-Features': 'advanced, folding, secure',
  });
  check('nhan ra bang header dù tên máy lạ', byHeader.html.includes('/mini.css?v='));
  const byUa = await mo('/', { 'User-Agent': MINI_UA });
  check('nhan ra bang ten may du khong co header', byUa.html.includes('/mini.css?v='));

  console.log('\n2. Khong gui thu gi khong chay duoc tren may');
  for (const [name, page] of [
    ['trang chính', home],
    ['trang tìm', await mini('/search?q=nhac')],
    ['trang video', await mini(`/watch?v=${VIDEO}`)],
    ['trang đăng nhập', await mini('/login')],
    ['trang cài đặt', await mini('/settings')],
    ['trang giới thiệu', await mini('/about')],
  ]) {
    check(`${name}: khong co the <script>`, !/<script/i.test(page.html));
    check(`${name}: khong co meta refresh`, !/http-equiv="refresh"/i.test(page.html));
    check(`${name}: khong co accesskey`, !/accesskey=/i.test(page.html));
    check(`${name}: khong co the <video>`, !/<video/i.test(page.html));
    // Khung tim kiem bat ra la viec cua s60.js; khong co script thi no la mot
    // khoi an vinh vien.
    check(`${name}: khong co khung tim kiem an`, !page.html.includes('id="pop"'));
    check(`${name}: co o tim nam san`, page.html.includes('action="/search"'));
  }

  console.log('\n3. Trang video: phat bang lien ket, khong bang khung');
  const watch = await mini(`/watch?v=${VIDEO}`);
  check('co lien ket thang toi luong', /href="\/stream\/dQw4w9WgXcQ\/18/.test(watch.html));
  check('co duong nghe chi tieng', watch.html.includes(`/audio/${VIDEO}`));
  check('noi ro la khong phat trong trang', watch.html.includes('Opera Mini không phát được'));

  console.log('\n4. Cho lam moi bang tay o nhung trang dang doi viec');
  const login = await mini('/login');
  check('trang dang nhap co duong lam moi', login.html.includes('Làm mới trang'));
  check('duong lam moi mang theo ma ghep noi', /href="\/login\?c=[A-Z0-9]+"/.test(login.html));
  // Ma QR di qua Opera Mini bi nen lai lan nua cho nhe duong truyen, nhoe di la
  // may khac soi khong ra — bo han, con ma chu thi go tay van dung.
  check('khong bay ma QR', !login.html.includes('/qr?c='));
  check('van co ma chu', /class="code"/.test(login.html));

  console.log('\n5. Trang ngan lai cho vua mot anh chup');
  const search = await mini('/search?q=nhac');
  const miniCards = (search.html.match(/class="card"/g) || []).length;
  check('nhieu nhat 8 video mot trang', miniCards === 8, `dem duoc ${miniCards}`);
  const searchNokia = await nokia('/search?q=nhac');
  check(
    'may Symbian van du 12 video',
    (searchNokia.html.match(/class="card"/g) || []).length === 12
  );
  check(
    'trang mini nhe hon trang Symbian',
    search.html.length < searchNokia.html.length,
    `${search.html.length} so voi ${searchNokia.html.length} byte`
  );

  console.log('\n6. Bang kieu rieng chi dung thu Presto ve dung');
  const css = await mo('/mini.css', { 'User-Agent': MINI_UA });
  check('tra ve duoc', css.status === 200);
  const rules = css.html.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [re, name] of [
    [/position\s*:/, "'position' (fixed bi coi nhu absolute)"],
    [/border-radius/, 'bo goc (khong ve)'],
    [/line-height/, 'line-height (bo han)'],
    [/display\s*:\s*(flex|grid)/, 'flexbox hoac grid'],
    [/transition|animation|@keyframes/, 'hoat hinh'],
    [/-webkit-/, 'thuoc tinh rieng cua WebKit'],
  ]) {
    check(`khong dung ${name}`, !re.test(rules));
  }

  console.log('\n7. May Symbian khong dinh gi cua khuon mini');
  const homeNokia = await nokia('/');
  check('van nap s60.css', homeNokia.html.includes('/s60.css?v='));
  check('van nap s60.js', homeNokia.html.includes('/s60.js?v='));
  check('van co khung tim kiem bat ra', homeNokia.html.includes('id="pop"'));
  check('van co phim tat', /accesskey=/.test(homeNokia.html));
  const watchNokia = await nokia(`/watch?v=${VIDEO}`);
  check('van co the <video>', /<video/.test(watchNokia.html));
  const loginNokia = await nokia('/login');
  check('van tu lam moi', /http-equiv="refresh"/.test(loginNokia.html));
  check('van co ma QR', loginNokia.html.includes('/qr?c='));

  console.log(`\nDat ${passed}, hong ${failed}`);
  process.exit(failed ? 1 : 0);
}, 400);
