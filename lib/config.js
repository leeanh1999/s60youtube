'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

/**
 * Nokia Browser giu file tinh trong bo dem rat lau, va may chu cung bao giu 1
 * ngay cho do ton 2G. Sau khi cap nhat, may cu se ghep HTML moi voi CSS cu —
 * trang hien ra be nat. Nen dinh vao duong dan mot chuoi tinh tu noi dung file:
 * doi file thi duong dan doi theo, may tai lai dung mot lan; khong doi thi giu
 * nguyen bo dem.
 */
function assetTag(names) {
  const sum = crypto.createHash('md5');
  for (const name of names) {
    try {
      sum.update(fs.readFileSync(path.join(ROOT, 'public', name)));
    } catch {
      sum.update(name);
    }
  }
  return sum.digest('hex').slice(0, 8);
}

// Moi thu can giu lai qua cac lan khoi dong nam trong DATA_DIR.
// Chay bang Docker thi tro vao volume (/data) de khong mat khi dung lai container.
const DATA_DIR = process.env.DATA_DIR || ROOT;

module.exports = {
  ROOT,
  DATA_DIR,
  PORT: Number(process.env.PORT || 8080),
  HOST: process.env.HOST || '0.0.0.0',

  CACHE_DIR: path.join(DATA_DIR, 'cache'),

  // yt-dlp giu o day ban JavaScript cua trinh phat YouTube da giai ma san.
  // De trong volume thi khoi dong lai container khong phai tai va giai lai —
  // do la phan cham nhat cua lan mo video dau tien.
  YTDLP_CACHE_DIR: path.join(DATA_DIR, 'ytdlp-cache'),

  // Ngon ngu / vung dung cho YouTube InnerTube
  HL: process.env.YT_HL || 'vi',
  GL: process.env.YT_GL || 'VN',

  // So ket qua moi trang. Man hinh S60 nho nen de it.
  PAGE_SIZE: Number(process.env.PAGE_SIZE || 12),

  // URL video cua YouTube het han sau vai gio.
  INFO_TTL_MS: 2 * 60 * 60 * 1000,
  LIST_TTL_MS: 10 * 60 * 1000,

  // Xoa file da chuyen ma sau 6 tieng khong dung toi.
  CONVERT_TTL_MS: 6 * 60 * 60 * 1000,

  // UA dung khi goi YouTube tu server (khong phai UA cua dien thoai).
  DESKTOP_UA:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',

  // YouTube thuong doi dang nhap khi server goi tu IP la (VPN, VPS, mang cong ty).
  // Tro toi cookie cua chinh tai khoan ban dang dung tren may nay.
  // Vi du: YT_COOKIES_FILE=D:\s60youtube\cookies.txt
  //        YT_COOKIES_BROWSER=chrome
  COOKIES_FILE: process.env.YT_COOKIES_FILE || path.join(DATA_DIR, 'cookies.txt'),
  COOKIES_BROWSER: process.env.YT_COOKIES_BROWSER || '',

  // Moi may vao trang tu nap cookie cua chinh no; moi may mot file trong day.
  DEVICES_DIR: path.join(DATA_DIR, 'devices'),

  // Cookie chung o tren dung cho may chua tu nap cookie rieng. Mo cong ra
  // Internet thi dat YT_SHARED_COOKIES=0 — luc do moi nguoi buoc phai dang
  // nhap bang tai khoan cua chinh ho, khong ai muon nho tai khoan cua chu may.
  SHARED_COOKIES: process.env.YT_SHARED_COOKIES !== '0',

  // Cookie cua mot may khong dung toi bao nhieu ngay thi xoa han.
  DEVICE_TTL_DAYS: Number(process.env.DEVICE_TTL_DAYS || 45),

  // Dat khi chay sau reverse proxy ma proxy khong gui X-Forwarded-*.
  // Dia chi nay chi dung de in ra ma QR va duong dan trang /link.
  PUBLIC_URL: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''),

  // Dat 1 de tu choi han viec nop cookie khi trang /link khong di qua HTTPS.
  // Chac chan nhat khi mo ra Internet, doi lai la trong mang nha cung phai co
  // chung chi thi moi dang nhap duoc.
  REQUIRE_SECURE_LINK: process.env.REQUIRE_SECURE_LINK === '1',

  // Sau reverse proxy thi moi ket noi deu mang IP cua proxy, nen bo dem chan
  // do ma se nham ca lang la mot nguoi. Dat TRUST_PROXY=1 de tin X-Forwarded-For
  // — chi bat khi that su co proxy dung truoc, khong thi ai cung gia duoc IP.
  TRUST_PROXY: process.env.TRUST_PROXY === '1',

  // Cho phep chay nhieu lenh chuyen ma cung luc (may yeu nen de 1).
  MAX_JOBS: Number(process.env.MAX_JOBS || 1),

  // Toc do ma hoa cua x264. May ARM yeu nen dat 'ultrafast'.
  FFMPEG_PRESET: process.env.FFMPEG_PRESET || 'veryfast',

  // Dinh sau /s60.css va /s60.js de may khong dung lai ban cu trong bo dem.
  ASSET_TAG: assetTag(['s60.css', 's60.js']),

  // Docker nhet vao luc build; chay tu ma nguon thi khong co.
  BUILD_VERSION: process.env.BUILD_VERSION || 'chạy từ mã nguồn',
  BUILD_DATE: process.env.BUILD_DATE || '',
};
