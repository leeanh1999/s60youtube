'use strict';

const crypto = require('crypto');

const { escapeHtml } = require('./util');
const { toPng } = require('./raster');

/**
 * Bieu tuong cua trang: hinh ve san bang SVG, nhung gui ra may la anh PNG.
 *
 * Truoc day dat thang <svg> vao HTML. Tren may that thi hong: trinh duyet goc
 * cua Symbian (Nokia Browser 7.x/8.x) la ban WebKit dung KHONG kem bo ve SVG —
 * no khong bao loi, chi la moi cho co bieu tuong deu thanh khoang trong. Opera
 * Mobile 12 thi ve duoc, nhung khong the de trinh duyet chinh cua may thanh ra
 * trang tro tren. Nen bay gio may chu tu to hinh ra PNG (xem lib/raster.js) va
 * trang chi con the <img> — dang anh nay thi may Symbian nao cung mo duoc.
 *
 * Hinh goc van giu dang SVG vi day la dang de sua nhat: mot dong chu, doc ra
 * duoc, khong phai bang diem anh.
 *
 * Moi hinh nam trong khung 24x24. Hinh nao co lo (banh rang, con mat, kinh lup)
 * thi dung fill-rule="evenodd" cho duong ben trong thanh lo thung. Chi to nen,
 * khong ke vien: vien thi ve thanh hai duong long nhau nhu hinh 'search' duoi
 * day — bo to hinh khong phai lam viec ke vien, ma ket qua thi khong khac.
 */
const SHAPES = {
  // Khung bo tron kieu logo YouTube, tam giac phat la lo thung o giua.
  logo:
    '<path fill-rule="evenodd" d="M5 4h14a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H5a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4zm5 4.4v7.2L16.2 12z"/>',

  // Vong kinh lup la hai duong tron long nhau (ngoai 7,7 — trong 5,1), phan
  // giua hai duong chinh la net vong day 2,6.
  search:
    '<path fill-rule="evenodd" d="M10.2 2.5a7.7 7.7 0 1 0 0 15.4 7.7 7.7 0 0 0 0-15.4z' +
    'm0 2.6a5.1 5.1 0 1 1 0 10.2 5.1 5.1 0 0 1 0-10.2z"/>' +
    '<path d="M14.9 16.8 17 14.7l5.2 5.2-2.1 2.1z"/>',

  home: '<path d="M12 2 2 11h3v11h5v-7h4v7h5V11h3z"/>',

  user:
    '<path d="M12 2.6a4.6 4.6 0 1 1 0 9.2 4.6 4.6 0 0 1 0-9.2zm0 11c4.5 0 8.2 2.9 8.2 6.6v1.4H3.8v-1.4c0-3.7 3.7-6.6 8.2-6.6z"/>',

  gear:
    '<path fill-rule="evenodd" d="M13.9 1.6h-3.8l-.4 2.6-1.8.7-2.1-1.5-2.7 2.7 1.5 2.1-.7 1.8-2.6.4v3.8l2.6.4.7 1.8-1.5 2.1 2.7 2.7 2.1-1.5 1.8.7.4 2.6h3.8l.4-2.6 1.8-.7 2.1 1.5 2.7-2.7-1.5-2.1.7-1.8 2.6-.4v-3.8l-2.6-.4-.7-1.8 1.5-2.1-2.7-2.7-2.1 1.5-1.8-.7zM12 8.3a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 0 0 0-7.4z"/>',

  info:
    '<path fill-rule="evenodd" d="M12 1.4a10.6 10.6 0 1 0 0 21.2 10.6 10.6 0 0 0 0-21.2zm0 3a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zm-1.6 5.2h3.2v9.6h-3.2z"/>',

  play: '<path d="M6 3.4 20.8 12 6 20.6z"/>',

  screen:
    '<path fill-rule="evenodd" d="M1.5 3.5h21v14h-21zm8.6 3.2v7.6L16.4 10.5zM6 19.5h12v2.6H6z"/>',

  download: '<path d="M10.4 2h3.2v8.2H18L12 17.2 6 10.2h4.4zM3.6 19h16.8v3H3.6z"/>',

  music:
    '<circle cx="8.2" cy="17.4" r="3.8"/>' +
    '<path d="M10.4 17.4V6.4L19.4 3.6V.8L8.4 4.2v13.2z"/>',

  back: '<path d="M14.8 3.9 6.7 12l8.1 8.1 2.2-2.2L11.1 12l5.9-5.9z"/>',

  next: '<path d="M9.2 3.9 7 6.1l5.9 5.9L7 17.9l2.2 2.2L17.3 12z"/>',

  clock:
    '<path fill-rule="evenodd" d="M12 1.4a10.6 10.6 0 1 0 0 21.2 10.6 10.6 0 0 0 0-21.2zm0 2.8a7.8 7.8 0 1 1 0 15.6 7.8 7.8 0 0 1 0-15.6z"/>' +
    '<path d="M10.8 6.4h2.2v5.9l4.2 2.5-1.1 1.9-5.3-3.2z"/>',

  eye:
    '<path fill-rule="evenodd" d="M12 4.6c6 0 10.4 5.3 10.4 7.4S18 19.4 12 19.4 1.6 14.1 1.6 12 6 4.6 12 4.6zm0 3a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8z"/>',

  warn:
    '<path fill-rule="evenodd" d="M12 1.8 1 21.4h22zm-1.4 6.6h2.8v7h-2.8zm0 8.8h2.8v3h-2.8z"/>',

  check: '<path d="M9.2 19.4 2.4 12.6l2.2-2.2 4.6 4.6L19.4 4.8l2.2 2.2z"/>',

  refresh:
    '<path d="M20.4 12a8.4 8.4 0 1 1-3.4-6.7l-1.7 2.2A5.6 5.6 0 1 0 17.6 12z"/>' +
    '<path d="M22.2 2.6v6.2h-6.2z"/>',

  key:
    '<path fill-rule="evenodd" d="M14.6 2a7.4 7.4 0 0 0-7 9.8L2 17.4V22h4.6v-2.6h2.6v-2.6h2.6l1.2-1.2A7.4 7.4 0 1 0 14.6 2zm2.2 3.4a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4z"/>',

  film:
    '<path fill-rule="evenodd" d="M1.6 3h20.8v18H1.6zm3 2.4v2.4h2.6V5.4zm12.2 0v2.4h2.6V5.4zM7.4 10.2v3.6h9.2v-3.6zm-2.8 5.9v2.4h2.6v-2.4zm12.2 0v2.4h2.6v-2.4z"/>',

  tv:
    '<path fill-rule="evenodd" d="M2 5.4h20v13H2zm2.6 2.6v7.8h11v-7.8zm13.2 0v2.2h1.8V8zm0 3.4v2.2h1.8v-2.2z"/>' +
    '<path d="M6.6 1.3 12 4.4l5.4-3.1 1.2 2-4.2 2.4H9.6L5.4 3.3z"/>',

  star: '<path d="m12 1.6 3.2 6.6 7.2 1-5.2 5.1 1.2 7.2-6.4-3.4-6.4 3.4 1.2-7.2L1.6 9.2l7.2-1z"/>',

  ball:
    '<path fill-rule="evenodd" d="M12 1.4a10.6 10.6 0 1 0 0 21.2 10.6 10.6 0 0 0 0-21.2zm0 4.2 4.8 3.5-1.8 5.6H9L7.2 9.1z"/>',

  food:
    '<path d="M5.4 1.8h1.7v6.4h1.1V1.8h1.7v6.4h1.1V1.8h1.7v7.4a3.4 3.4 0 0 1-2.6 3.3V22H8v-9.5a3.4 3.4 0 0 1-2.6-3.3z"/>' +
    '<path d="M16.6 1.8c2.6 2 3.8 5.2 3.6 9.2h-2.4V22h-2.4V1.8z"/>',

  kid:
    '<path fill-rule="evenodd" d="M12 1.4a10.6 10.6 0 1 0 0 21.2 10.6 10.6 0 0 0 0-21.2zM8.6 7.8a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4zm6.8 0a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4zM6.6 14.2h10.8a5.4 5.4 0 0 1-10.8 0z"/>',
};

/**
 * Mau nung san vao anh. Ban SVG truoc kia to bang currentColor nen tu an theo
 * mau chu cua noi dat no; anh thi khong the, mau phai nam trong ten file. Vi
 * vay moi cho goi icon() deu noi ro no muon mau nao, va bang duoi day phai
 * dung y nhu mau chu trong s60.css.
 */
const TINTS = {
  red: '#c00000', // tieu de, muc chon duoc, o dang mo o chan trang
  white: '#ffffff', // tren thanh do va tren nut do
  gray: '#4a5058', // ba o con lai o chan trang
  mute: '#8a9099', // dong phu duoi tieu de video (thoi luong, luot xem)
  amber: '#a88600', // khung nhac
  green: '#2f9e2f', // khung bao xong viec
  blue: '#0b3fbf', // lien ket "Trang sau"
};

const DEFAULT_TINT = 'red';

/**
 * Ve o co 32 diem roi de CSS thu nho theo co chu. Cho dung nhat can hinh to
 * nhat la bon o chan trang: 1,05 lan co chu goc, tuc 27 diem khi nguoi dung
 * chon chu "Rat lon". Ve san 32 diem thi moi cho deu la thu nho — may nao thu
 * nho tho den dau cung con ra hinh, con phong to len thi hinh bet ngay.
 */
const SIZE = 32;

/**
 * Duong dan anh mang mot chuoi tinh tu chinh bo hinh: sua hinh hay doi mau la
 * duong dan doi theo, may tai lai dung mot lan. Khong sua thi may giu ban trong
 * bo dem ca thang, khong ton lan goi nao.
 */
const TAG = crypto
  .createHash('md5')
  .update(JSON.stringify(SHAPES) + JSON.stringify(TINTS) + SIZE)
  .digest('hex')
  .slice(0, 8);

// To mot hinh mat vai phan nghin giay, ma mot trang goi lai chung muoi hinh —
// giu ban da to trong bo nho, ca bo chung 30KB.
const drawn = new Map();

/** Anh PNG cua mot ten file dang 'home-red.png'. Ten sai thi tra ve null. */
function png(file) {
  const parts = /^([a-z]+)-([a-z]+)\.png$/.exec(String(file));
  if (!parts) return null;
  const [, name, tint] = parts;
  if (!SHAPES[name] || !TINTS[tint]) return null;

  const key = `${name}-${tint}`;
  if (!drawn.has(key)) drawn.set(key, toPng(SHAPES[name], TINTS[tint], SIZE));
  return drawn.get(key);
}

/**
 * @param {string} name ten hinh trong bang tren
 * @param {string} [tint] ten mau trong bang TINTS
 * @param {string} [alt] chu thay hinh — chi dat cho hinh dung mot minh, vi hinh
 *   nao cung co nhan chu ben canh thi doc len se thanh doc hai lan
 */
function icon(name, tint, alt) {
  if (!SHAPES[name]) return '';
  const color = TINTS[tint] ? tint : DEFAULT_TINT;
  return (
    `<img class="ic" src="/i/${name}-${color}.png?v=${TAG}"` +
    ` width="24" height="24" alt="${escapeHtml(alt || '')}" />`
  );
}

module.exports = { icon, png, SHAPES, TINTS, SIZE, TAG };
