'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..');

// Moi thu can giu lai qua cac lan khoi dong nam trong DATA_DIR.
// Chay bang Docker thi tro vao volume (/data) de khong mat khi dung lai container.
const DATA_DIR = process.env.DATA_DIR || ROOT;

module.exports = {
  ROOT,
  DATA_DIR,
  PORT: Number(process.env.PORT || 8080),
  HOST: process.env.HOST || '0.0.0.0',

  CACHE_DIR: path.join(DATA_DIR, 'cache'),

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

  // Cho phep chay nhieu lenh chuyen ma cung luc (may yeu nen de 1).
  MAX_JOBS: Number(process.env.MAX_JOBS || 1),

  // Toc do ma hoa cua x264. May ARM yeu nen dat 'ultrafast'.
  FFMPEG_PRESET: process.env.FFMPEG_PRESET || 'veryfast',
};
