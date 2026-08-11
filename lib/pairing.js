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

/** Tao ma ghep noi moi, hien tren man hinh dien thoai. */
function issue() {
  sweep();
  let code = randomCode();
  while (codes.has(code)) code = randomCode();
  codes.set(code, { expires: Date.now() + TTL_MS, used: false });
  return code;
}

function normalize(input) {
  return String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function isValid(input) {
  sweep();
  const entry = codes.get(normalize(input));
  return Boolean(entry && !entry.used);
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

/** Ma dep hon khi nhin: ABC-123 */
function format(code) {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

function remainingMinutes(code) {
  const entry = codes.get(normalize(code));
  if (!entry) return 0;
  return Math.max(0, Math.ceil((entry.expires - Date.now()) / 60000));
}

module.exports = { issue, isValid, consume, format, normalize, remainingMinutes, TTL_MS };
