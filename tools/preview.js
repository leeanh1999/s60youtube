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

const render = require('../lib/render');

const prefs = { thumbs: true, pageSize: 10, textSize: 'l' };

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
  audio: { label: 'Chỉ tiếng (m4a)', audioOnly: true, ext: 'm4a' },
};

const pages = {
  'home.html': render.homePage({ prefs, warning: 'Máy này chưa nối tài khoản YouTube.' }),
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

for (const [name, html] of Object.entries(pages)) {
  // Trang that lay tai nguyen tu goc dia chi; ban xem thu nam trong mot thu
  // muc nen phai doi sang duong dan tuong doi.
  const local = html
    .replace(/"\/s60\.(css|js)(?:\?[^"]*)?"/g, '"s60.$1"')
    .replace(/"\/thumb\/[^"]*"/g, '"thumb.svg"');
  fs.writeFileSync(path.join(outDir, name), local);
  console.log(`${name}  ${html.length} byte`);
}
console.log(`\nDa ghi vao ${outDir}`);
