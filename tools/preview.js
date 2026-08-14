'use strict';

/**
 * Dung HTML cua tung trang ra file de xem tren may tinh, khong can chay may
 * chu hay goi YouTube. Chay: node tools/preview.js [thu-muc-dich]
 *
 * Mo file trong thu muc do bang trinh duyet, thu cua so lai con 640x480 diem
 * la thay gan dung nhu tren Nokia E6.
 */
const fs = require('fs');
const path = require('path');

const icons = require('../lib/icons');
const render = require('../lib/render');

const prefs = { thumbs: true, pageSize: 10, textSize: 'l', maxHeight: 360 };

const videos = Array.from({ length: 6 }, (_, i) => ({
  id: `demoVideo${String(i).padStart(2, '0')}`.slice(0, 11),
  title:
    i % 2
      ? 'Nhạc vàng chọn lọc — tuyển tập hay nhất dành cho buổi tối cuối tuần'
      : 'Tin nóng trong ngày',
  author: 'Kênh Thử Nghiệm',
  duration: 245 + i * 61,
  views: `${i + 1}0,1 N lượt xem`,
  published: `${i + 1} ngày trước`,
  live: i === 2,
}));

const info = {
  title: videos[0].title,
  author: videos[0].author,
  duration: 245,
  views: 1234567,
  description: 'Dòng mô tả thứ nhất.\nDòng mô tả thứ hai dài hơn một chút.',
  direct: { height: 360 },
  audioDirect: true,
};

const profiles = {
  belle: { label: 'Bản nhẹ 360p', maxHeight: 360, ext: 'mp4' },
  hd: { label: 'Bản 720p — máy đời mới', maxHeight: 720, needsHeight: 720, ext: 'mp4' },
  audio: { label: 'Chỉ tiếng (m4a)', audioOnly: true, ext: 'm4a' },
};

const pages = {
  'home.html': render.homePage({ prefs, warning: 'Máy này chưa nối tài khoản YouTube.' }),
  // Da dang nhap: trang chinh la trang goi y, chu de tut xuong duoi.
  'home-feed.html': render.homePage({ prefs, videos }),
  // Dang nhap roi ma cookie thieu phan ngoi thu nhat.
  'home-nofeed.html': render.homePage({
    prefs,
    note:
      'Chưa có gợi ý riêng: cookie của máy này thiếu phần đăng nhập gốc của' +
      ' youtube.com (LOGIN_INFO, SID) nên YouTube coi máy chủ là chưa đăng nhập.' +
      ' Xuất lại cookie khi đang mở youtube.com và đã đăng nhập là có.',
  }),
  'search.html': render.searchPage({ query: 'nhạc vàng', videos, prefs, nextPage: '2' }),
  'watch.html': render.watchPage({
    video: { id: videos[0].id, title: info.title, author: info.author, duration: 245 },
    info,
    related: videos.slice(1),
    prefs,
    profiles,
    ffmpegOk: true,
    streamKey: 'demo',
  }),
  'convert.html': render.convertPage({
    video: { id: videos[0].id, title: info.title },
    job: { videoId: videos[0].id, status: 'running', progress: 42 },
    profileId: 'belle',
    profiles,
    prefs,
  }),
  'login.html': render.loginPage({
    code: 'ABC123',
    linkUrl: 'http://192.168.1.10:9080/link?c=ABC123',
    status: { own: false, ready: false },
    minutes: 9,
    prefs,
  }),
  // Da dang nhap: co them dia chi ghi nho de luu vao Bookmark.
  'login-in.html': render.loginPage({
    code: 'ABC123',
    rememberUrl: `http://192.168.1.10:9080/remember?d=${'a1b2c3d4'.repeat(4)}`,
    logoutUrl: '/logout?t=0123456789abcdef',
    status: { own: true, ready: true, usedAt: new Date(), size: 4096 },
    minutes: 9,
    prefs,
  }),
  'remember.html': render.rememberPage({ prefs }),
  'settings.html': render.settingsPage(prefs),
  'about.html': render.aboutPage({
    ffmpegOk: true,
    cookieStatus: { own: true, ready: true, sharedAllowed: false },
    deviceCount: 2,
    address: '192.168.1.10:9080',
    build: 'preview',
    buildDate: '',
    ytdlpVersion: '2025.01.01',
    prefs,
  }),
  'error.html': render.errorPage({
    title: 'Không phát được',
    message: 'YouTube đang đòi đăng nhập.',
    back: '/',
    prefs,
  }),
  // Hai bien the de soi lai bo cuc: chu that lon, va khi tat anh thu nho.
  'search-xl.html': render.searchPage({
    query: 'nhạc vàng',
    videos,
    prefs: { ...prefs, textSize: 'xl' },
    nextPage: '2',
  }),
  'search-nothumb.html': render.searchPage({
    query: 'nhạc vàng',
    videos,
    prefs: { ...prefs, thumbs: false },
    nextPage: '2',
  }),
  // May doi moi chon 720p: dia chi xem online mang theo muc do, va hien thêm
  // muc nho may chu ghep ban 720p.
  'watch-hd.html': render.watchPage({
    video: { id: videos[0].id, title: info.title, author: info.author, duration: 245 },
    info: { ...info, direct: { height: 720 } },
    related: videos.slice(1),
    prefs: { ...prefs, maxHeight: 720 },
    profiles,
    ffmpegOk: true,
    streamKey: 'demo',
  }),
};

const outDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'preview'));
const publicDir = path.join(__dirname, '..', 'public');

fs.mkdirSync(outDir, { recursive: true });
for (const name of ['s60.css', 's60.js']) {
  fs.copyFileSync(path.join(publicDir, name), path.join(outDir, name));
}
// Ô xám thay cho ảnh thật: chỉ cần đúng khung 16:9 để soi bố cục.
fs.writeFileSync(
  path.join(outDir, 'thumb.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">' +
    '<rect width="320" height="180" fill="#3a3f45"/>' +
    '<text x="160" y="100" fill="#9aa1a8" font-family="Arial" font-size="22"' +
    ' text-anchor="middle">320 x 180</text></svg>'
);

// Bieu tuong la anh PNG do may chu to ra; ban xem thu khong co may chu nao nen
// to san ra file, dung nhung hinh ma cac trang nay that su goi toi.
const iconDir = path.join(outDir, 'i');
fs.mkdirSync(iconDir, { recursive: true });
const wanted = new Set();
for (const html of Object.values(pages)) {
  for (const hit of html.matchAll(/\/i\/([a-z]+-[a-z]+\.png)/g)) wanted.add(hit[1]);
}
for (const file of wanted) {
  fs.writeFileSync(path.join(iconDir, file), icons.png(file));
}
console.log(`i/  ${wanted.size} bieu tuong PNG`);

for (const [name, html] of Object.entries(pages)) {
  // Trang that lay tai nguyen tu goc dia chi; ban xem thu nam trong mot thu
  // muc nen phai doi sang duong dan tuong doi.
  const local = html
    .replace(/"\/s60\.(css|js)(?:\?[^"]*)?"/g, '"s60.$1"')
    .replace(/"\/i\/([^"?]+)(?:\?[^"]*)?"/g, '"i/$1"')
    .replace(/"\/thumb\/[^"]*"/g, '"thumb.svg"');
  fs.writeFileSync(path.join(outDir, name), local);
  console.log(`${name}  ${html.length} byte`);
}

/**
 * Khung tim kiem chi hien ra khi bam vao kinh lup, ma anh chup thi khong bam
 * duoc: hai ban nay tu goi ho cai bam do de con soi duoc bo cuc cua khung. Ban
 * tu trang ket qua con de xem tu khoa vua tim co con nguyen trong o nhap khong.
 */
for (const [name, from] of [
  ['find.html', 'home-feed.html'],
  ['find-search.html', 'search.html'],
]) {
  fs.writeFileSync(
    path.join(outDir, name),
    fs.readFileSync(path.join(outDir, from), 'utf8').replace(
      '</body>',
      `<script type="text/javascript">
(function () {
  var a = document.getElementsByTagName('a');
  for (var i = 0; i < a.length; i++) {
    if ((' ' + a[i].className + ' ').indexOf(' find ') > -1 && a[i].onclick) a[i].onclick();
  }
})();
</script>
</body>`
    )
  );
  console.log(`${name}  ${from} voi khung tim kiem dang mo`);
}

/**
 * Trang doi chieu hai khuon man hinh. Phai long vao <iframe> chu khong the thu
 * cua so trinh duyet: Chrome va Edge tren Windows khong cho cua so hep hon
 * chung 500 diem, thu nua thi no van ve o 492 diem roi cat bot — nhin ra y nhu
 * trang bi tran, ma media query thi chua he duoc ap. Trong iframe thi be ngang
 * la be ngang that.
 */
const SCREENS = [
  ['Nokia N8 — 360 x 640 (xem doc)', 360, 640],
  ['Nokia E6 — 640 x 480 (nam ngang)', 640, 480],
];
const shown = [
  'home.html',
  'find.html',
  'search.html',
  'find-search.html',
  'watch.html',
  'settings.html',
];
fs.writeFileSync(
  path.join(outDir, 'sizes.html'),
  `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8" /><title>Hai khuon man hinh</title>
<style>
body { margin: 0; background: #4a4f55; font: 13px Arial, sans-serif; color: #fff }
h2 { margin: 0; padding: 6px 8px; font-size: 14px }
p { margin: 0; padding: 0 8px 4px 8px; font-size: 12px; color: #d7dbdf }
iframe { border: 0; display: block; background: #fff; float: left; margin: 0 8px 8px 0 }
.row { overflow: hidden; padding-left: 8px }
</style></head><body>
${SCREENS.map(
  ([label, w, h]) => `<h2>${label}</h2>
<p>${shown.join(' · ')}</p>
<div class="row">
${shown.map((f) => `<iframe src="${f}" width="${w}" height="${h}"></iframe>`).join('\n')}
</div>`
).join('\n')}
</body></html>`
);
console.log(`sizes.html  doi chieu 360x640 va 640x480`);

console.log(`\nDa ghi vao ${outDir}`);
