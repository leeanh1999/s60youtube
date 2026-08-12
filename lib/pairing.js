'use strict';

const crypto = require('crypto');

// Bo ky tu da bo O/0, I/1 de khong doc nham tren man hinh nho.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const TTL_MS = 10 * 60 * 1000;

const codes = new Map();

function randomCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return code;
}

function sweep() {
  const now = Date.now();
  for (const [code, entry] of codes) {
    if (entry.expires < now) codes.delete(code);
  }
}

/**
 * Tao ma ghep noi moi, hien tren man hinh dien thoai. Ma gan lien voi may vua
 * xin no, nen cookie nop tu may tinh chi vao dung may do — nhieu nguoi cung
 * dang nhap mot luc cung khong lan sang nhau.
 */
function issue(deviceId) {
  sweep();
  let code = randomCode();
  while (codes.has(code)) code = randomCode();
  codes.set(code, { expires: Date.now() + TTL_MS, used: false, deviceId });
  return code;
}

function normalize(input) {
  return String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function isValid(input, deviceId) {
  sweep();
  const entry = codes.get(normalize(input));
  if (!entry || entry.used) return false;
  return deviceId === undefined || entry.deviceId === deviceId;
}

/** May nao dang cho cookie cua ma nay. */
function deviceOf(input) {
  sweep();
  const entry = codes.get(normalize(input));
  return entry && !entry.used ? entry.deviceId : null;
}

/** Danh dau ma da dung xong — moi ma chi nap cookie duoc mot lan. */
function consume(input) {
  const code = normalize(input);
  const entry = codes.get(code);
  if (!entry || entry.used) return false;
  entry.used = true;
  entry.expires = Date.now() + 60 * 1000;
  return true;
}

/**
 * Mo cong ra Internet thi phai chan do ma: 32^6 kha nang, doan bua mai cung
 * trung mot ma dang cho. Sai qua nhieu lan tu mot dia chi la nghi mot luc.
 * Chi dem lan sai — nguoi cam ma dung khong bao gio bi chan, vi sau reverse
 * proxy ho deu chung mot dia chi IP voi ke dang do.
 */
const MAX_MISSES = 10;
const MISS_WINDOW_MS = 10 * 60 * 1000;
const misses = new Map();

function blocked(ip) {
  const entry = misses.get(ip);
  if (!entry) return false;
  if (entry.until < Date.now()) {
    misses.delete(ip);
    return false;
  }
  return entry.count >= MAX_MISSES;
}

function noteMiss(ip) {
  const now = Date.now();
  const entry = misses.get(ip);
  if (!entry || entry.until < now) {
    misses.set(ip, { count: 1, until: now + MISS_WINDOW_MS });
    return;
  }
  entry.count += 1;
  if (misses.size > 1000) {
    for (const [key, value] of misses) {
      if (value.until < now) misses.delete(key);
    }
  }
}

/** Ma dep hon khi nhin: ABC-123 */
function format(code) {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

function remainingMinutes(code) {
  const entry = codes.get(normalize(code));
  if (!entry) return 0;
  return Math.max(0, Math.ceil((entry.expires - Date.now()) / 60000));
}

module.exports = {
  issue,
  isValid,
  deviceOf,
  consume,
  format,
  normalize,
  remainingMinutes,
  blocked,
  noteMiss,
  TTL_MS,
};
