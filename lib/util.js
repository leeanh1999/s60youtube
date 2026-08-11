'use strict';

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function isVideoId(value) {
  return typeof value === 'string' && VIDEO_ID_RE.test(value);
}

/** Chap nhan ca ID tran, link youtube.com/watch, youtu.be, shorts, embed. */
function parseVideoId(input) {
  if (!input) return null;
  const raw = String(input).trim();
  if (isVideoId(raw)) return raw;
  const match = raw.match(
    /(?:v=|\/shorts\/|\/embed\/|youtu\.be\/|\/v\/)([A-Za-z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

function formatDuration(seconds) {
  const total = Math.floor(Number(seconds) || 0);
  if (total <= 0) return '';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Doi "1:02:03" hoac "5:12" sang so giay. */
function parseDuration(text) {
  if (!text) return 0;
  const parts = String(text).split(':').map((p) => Number(p));
  if (parts.some((p) => Number.isNaN(p))) return 0;
  return parts.reduce((acc, part) => acc * 60 + part, 0);
}

function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} Tỉ`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} Tr`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} N`;
  return String(n);
}

function formatBytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

function truncate(text, max) {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Gom moi object co key cho truoc trong cay JSON (chiu duoc thay doi bo cuc). */
function collectRenderers(node, key, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const item of node) collectRenderers(item, key, out);
    return out;
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === key && v && typeof v === 'object') out.push(v);
    else collectRenderers(v, key, out);
  }
  return out;
}

/** Doc text tu cac kieu {simpleText} hoac {runs:[...]}. */
function readText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node.simpleText === 'string') return node.simpleText;
  if (Array.isArray(node.runs)) return node.runs.map((r) => r.text || '').join('');
  return '';
}

module.exports = {
  escapeHtml,
  isVideoId,
  parseVideoId,
  formatDuration,
  parseDuration,
  formatCount,
  formatBytes,
  truncate,
  collectRenderers,
  readText,
};
