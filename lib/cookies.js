'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const config = require('./config');
const { parseCookies } = require('./util');

/**
 * Cookie YouTube la ca phien dang nhap Google cua mot nguoi, nen khong the de
 * ca nha xai chung mot file khi mo cong ra Internet. Moi may vao trang duoc
 * phat mot ma thiet bi (luu bang cookie trinh duyet, khong lien quan gi toi
 * cookie YouTube), va cookie no nap len duoc ghi thanh mot file rieng mang ten
 * ma do. May nao dung tai khoan may nay.
 */
const DEVICE_COOKIE = 'did';
const DEVICE_RE = /^[0-9a-f]{32}$/;
const KEY_RE = /^[0-9a-f]{24}$/;
const ONE_YEAR = 365 * 24 * 60 * 60;

fs.mkdirSync(config.DEVICES_DIR, { recursive: true });

/** Khoa ky cac thao tac doi trang thai (xoa dang nhap). Giu qua cac lan chay. */
function loadSecret() {
  const file = path.join(config.DATA_DIR, 'device-secret');
  try {
    const saved = fs.readFileSync(file, 'utf8').trim();
    if (saved.length >= 32) return saved;
  } catch {
    // chua co thi tao moi ngay duoi day
  }
  const secret = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(file, `${secret}\n`, { mode: 0o600 });
  } catch {
    // khong ghi duoc (o dia chi doc) thi dung tam trong bo nho lan chay nay
  }
  return secret;
}

const SECRET = loadSecret();

/**
 * Ma chong CSRF cho thao tac xoa dang nhap: khong co no thi chi can du nguoi
 * bam vao mot lien ket la ai cung xoa duoc cookie cua nguoi khac.
 */
function actionToken(deviceId) {
  if (!DEVICE_RE.test(String(deviceId || ''))) return '';
  return crypto
    .createHmac('sha256', SECRET)
    .update(`action:${deviceId}`)
    .digest('hex')
    .slice(0, 16);
}

function checkAction(deviceId, value) {
  const want = Buffer.from(actionToken(deviceId));
  const got = Buffer.from(String(value || ''));
  return want.length > 0 && want.length === got.length && crypto.timingSafeEqual(want, got);
}

function fileFor(deviceId) {
  if (!DEVICE_RE.test(String(deviceId || ''))) return null;
  return path.join(config.DEVICES_DIR, `${deviceId}.txt`);
}

function keyFileFor(deviceId) {
  if (!DEVICE_RE.test(String(deviceId || ''))) return null;
  return path.join(config.DEVICES_DIR, `${deviceId}.key`);
}

/**
 * Trinh phat cua Symbian mo lien ket .mp4 ben ngoai trinh duyet nen khong gui
 * cookie theo. Vi vay dia chi phat mang san mot khoa ngau nhien cua may do:
 * nhan ra may du de lay dung cookie, nhung khong lam duoc gi khac (nap cookie
 * moi, xoa dang nhap deu doi cookie 'did' that). Khoa sinh lai moi lan nap
 * cookie va mat khi xoa dang nhap, nen lo dia chi phat thi thu hoi duoc.
 */
const keyByDevice = new Map();
const deviceByKey = new Map();
let indexedAt = 0;

function remember(deviceId, key) {
  keyByDevice.set(deviceId, key);
  deviceByKey.set(key, deviceId);
}

function streamKey(deviceId) {
  if (!DEVICE_RE.test(String(deviceId || ''))) return '';
  const cached = keyByDevice.get(deviceId);
  if (cached) return cached;
  try {
    const key = fs.readFileSync(keyFileFor(deviceId), 'utf8').trim();
    if (KEY_RE.test(key)) {
      remember(deviceId, key);
      return key;
    }
  } catch {
    // may chua nap cookie thi khong can khoa nao ca
  }
  return '';
}

function rotateStreamKey(deviceId) {
  const old = keyByDevice.get(deviceId);
  if (old) deviceByKey.delete(old);
  const key = crypto.randomBytes(12).toString('hex');
  fs.writeFileSync(keyFileFor(deviceId), `${key}\n`, { mode: 0o600 });
  remember(deviceId, key);
  return key;
}

function forgetKey(deviceId) {
  const key = keyByDevice.get(deviceId);
  if (key) deviceByKey.delete(key);
  keyByDevice.delete(deviceId);
}

function reindex() {
  indexedAt = Date.now();
  let names;
  try {
    names = fs.readdirSync(config.DEVICES_DIR);
  } catch {
    return;
  }
  keyByDevice.clear();
  deviceByKey.clear();
  for (const name of names) {
    if (!name.endsWith('.key')) continue;
    const id = name.slice(0, -4);
    if (DEVICE_RE.test(id)) streamKey(id);
  }
}

function byStreamKey(value) {
  const key = String(value || '');
  if (!KEY_RE.test(key)) return null;
  if (!deviceByKey.has(key) && Date.now() - indexedAt > 5000) reindex();
  const deviceId = deviceByKey.get(key);
  // Khoa chi co gia tri khi may do that su con cookie.
  return deviceId && fs.existsSync(fileFor(deviceId)) ? deviceId : null;
}

function read(req) {
  const id = parseCookies(req.headers.cookie)[DEVICE_COOKIE];
  return DEVICE_RE.test(String(id || '')) ? id : null;
}

/** Phat ma moi cho may la. Dat cookie bang append de khong de len Set-Cookie khac. */
function issue(res) {
  const id = crypto.randomBytes(16).toString('hex');
  // HttpOnly: trang khong dung JavaScript nen khong ai can doc ma nay bang script.
  // SameSite=Lax: trang la khong muon cookie nay di theo yeu cau cua no.
  // Khong dat Secure vi may Symbian chi vao duoc HTTP thuong.
  res.append(
    'Set-Cookie',
    `${DEVICE_COOKIE}=${id}; Path=/; Max-Age=${ONE_YEAR}; HttpOnly; SameSite=Lax`
  );
  return id;
}

/**
 * Tham so cookie de dua cho yt-dlp, kem mot khoa de danh dau bo nho dem: hai
 * tai khoan khac nhau thi thong tin video cung phai de rieng.
 */
function authFor(deviceId) {
  const own = fileFor(deviceId);
  if (own && fs.existsSync(own)) {
    return { mode: 'device', key: `d:${deviceId}`, args: ['--cookies', own] };
  }
  if (config.SHARED_COOKIES) {
    if (config.COOKIES_BROWSER) {
      return {
        mode: 'browser',
        key: `b:${config.COOKIES_BROWSER}`,
        args: ['--cookies-from-browser', config.COOKIES_BROWSER],
      };
    }
    if (fs.existsSync(config.COOKIES_FILE)) {
      return { mode: 'shared', key: 'shared', args: ['--cookies', config.COOKIES_FILE] };
    }
  }
  return { mode: 'none', key: 'none', args: [] };
}

/**
 * Trang thai de hien tren dien thoai.
 * own = may nay co cookie rieng; ready nhung khong own = dang xai ke cookie
 * chung cua may chu.
 */
function status(deviceId) {
  const auth = authFor(deviceId);
  const info = {
    mode: auth.mode,
    ready: auth.mode !== 'none',
    own: auth.mode === 'device',
    sharedAllowed: config.SHARED_COOKIES,
  };
  if (auth.mode === 'browser') {
    info.source = config.COOKIES_BROWSER;
    return info;
  }
  if (auth.mode === 'device' || auth.mode === 'shared') {
    const file = auth.mode === 'device' ? fileFor(deviceId) : config.COOKIES_FILE;
    info.source = file;
    try {
      const stat = fs.statSync(file);
      // yt-dlp ghi lai file cookie sau moi lan chay, nen day la lan dung gan nhat.
      info.usedAt = stat.mtime;
      info.size = stat.size;
    } catch {
      // file vua bi xoa giua chung — cu de trong
    }
  }
  return info;
}

/**
 * Kiem tra so bo noi dung nguoi dung dan vao co dung dang Netscape khong,
 * de bao loi ngay thay vi de yt-dlp that bai kho hieu sau nay.
 */
function inspect(text) {
  const content = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!content) return { ok: false, reason: 'Nội dung rỗng.' };

  const lines = content.split('\n').filter((line) => line && !line.startsWith('#'));
  const rows = lines.filter((line) => line.split('\t').length >= 7);
  if (!rows.length) {
    return {
      ok: false,
      reason:
        'Không phải định dạng Netscape (mỗi dòng phải có 7 cột ngăn bằng dấu Tab). Hãy xuất lại bằng tiện ích cookies.txt.',
    };
  }

  const youtubeRows = rows.filter((line) => /youtube\.com|google\.com/i.test(line));
  if (!youtubeRows.length) {
    return { ok: false, reason: 'Không thấy cookie nào của youtube.com trong file.' };
  }

  const names = new Set(youtubeRows.map((line) => line.split('\t')[5]));
  const signedIn = ['SID', '__Secure-1PSID', '__Secure-3PSID'].some((name) =>
    names.has(name)
  );

  return {
    ok: true,
    total: rows.length,
    youtube: youtubeRows.length,
    signedIn,
    content: `${content}\n`,
  };
}

function save(deviceId, text) {
  const file = fileFor(deviceId);
  if (!file) {
    throw new Error(
      'Không nhận ra máy nào đang chờ. Lấy mã mới trên điện thoại rồi nhập lại.'
    );
  }
  const report = inspect(text);
  if (!report.ok) throw new Error(report.reason);
  fs.writeFileSync(file, report.content, { mode: 0o600 });
  // Khoa phat cu (neu co) het hieu luc ngay khi nap cookie moi.
  rotateStreamKey(deviceId);
  return report;
}

function clear(deviceId) {
  const file = fileFor(deviceId);
  if (!file) return;
  fs.rmSync(file, { force: true });
  fs.rmSync(keyFileFor(deviceId), { force: true });
  forgetKey(deviceId);
}

/** Co dang cho may la muon tai khoan cua chu may khong. */
function sharedInUse() {
  const auth = authFor(null);
  return auth.mode === 'shared' || auth.mode === 'browser';
}

/** So may dang giu cookie rieng — hien o muc Gioi thieu. */
function count() {
  try {
    return fs
      .readdirSync(config.DEVICES_DIR)
      .filter((name) => name.endsWith('.txt') && DEVICE_RE.test(name.slice(0, -4))).length;
  } catch {
    return 0;
  }
}

/**
 * Xoa cookie cua may lau khong dung. Moi lan yt-dlp chay la file duoc ghi lai
 * nen thoi diem sua file chinh la lan dung gan nhat.
 */
function cleanup() {
  const days = Number(config.DEVICE_TTL_DAYS);
  if (!Number.isFinite(days) || days <= 0) return;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let names;
  try {
    names = fs.readdirSync(config.DEVICES_DIR);
  } catch {
    return;
  }
  for (const name of names) {
    const id = name.slice(0, -4);
    try {
      if (name.endsWith('.txt')) {
        if (fs.statSync(path.join(config.DEVICES_DIR, name)).mtimeMs < cutoff) clear(id);
      } else if (name.endsWith('.key') && !fs.existsSync(fileFor(id))) {
        // Khoa phat con lai cua may da xoa cookie — vo dung, don di cho sach.
        clear(id);
      }
    } catch {
      // bo qua file dang duoc ghi
    }
  }
}

module.exports = {
  DEVICE_COOKIE,
  read,
  issue,
  byStreamKey,
  streamKey,
  actionToken,
  checkAction,
  authFor,
  status,
  inspect,
  save,
  clear,
  sharedInUse,
  count,
  cleanup,
};
