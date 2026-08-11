'use strict';

const { execFile } = require('child_process');
const fs = require('fs');

const config = require('./config');
const { TtlCache } = require('./cache');

const infoCache = new TtlCache(300);

let runner = null;

/** Tim cach goi yt-dlp: binary rieng hoac module python. */
function resolveRunner() {
  if (runner) return runner;
  const candidates = [
    { cmd: 'yt-dlp', base: [] },
    { cmd: 'yt-dlp.exe', base: [] },
    { cmd: 'python', base: ['-m', 'yt_dlp'] },
    { cmd: 'python3', base: ['-m', 'yt_dlp'] },
  ];
  for (const candidate of candidates) {
    try {
      require('child_process').execFileSync(
        candidate.cmd,
        [...candidate.base, '--version'],
        { stdio: 'ignore', timeout: 20000 }
      );
      runner = candidate;
      return runner;
    } catch {
      // thu ung vien tiep theo
    }
  }
  throw new Error(
    'Khong tim thay yt-dlp. Cai bang: python -m pip install --upgrade yt-dlp'
  );
}

/** Tham so xac thuc: cookie do nguoi dung tu cung cap. */
function authArgs() {
  const args = [];
  if (config.COOKIES_BROWSER) {
    args.push('--cookies-from-browser', config.COOKIES_BROWSER);
  } else if (config.COOKIES_FILE && fs.existsSync(config.COOKIES_FILE)) {
    args.push('--cookies', config.COOKIES_FILE);
  }
  return args;
}

function hasCookies() {
  return authArgs().length > 0;
}

function cookieStatus() {
  if (config.COOKIES_BROWSER) {
    return { mode: 'browser', source: config.COOKIES_BROWSER, ready: true };
  }
  if (fs.existsSync(config.COOKIES_FILE)) {
    const stat = fs.statSync(config.COOKIES_FILE);
    return {
      mode: 'file',
      source: config.COOKIES_FILE,
      ready: true,
      savedAt: stat.mtime,
      size: stat.size,
    };
  }
  return { mode: 'none', ready: false };
}

/**
 * Kiem tra so bo noi dung nguoi dung dan vao co dung dang Netscape khong,
 * de bao loi ngay thay vi de yt-dlp that bai kho hieu sau nay.
 */
function inspectCookies(text) {
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

function saveCookies(text) {
  const report = inspectCookies(text);
  if (!report.ok) throw new Error(report.reason);
  fs.writeFileSync(config.COOKIES_FILE, report.content, 'utf8');
  infoCache.map.clear();
  return report;
}

function clearCookies() {
  fs.rmSync(config.COOKIES_FILE, { force: true });
  infoCache.map.clear();
}

/** Goi thu mot video cong khai de biet cookie con dung khong. */
async function verify() {
  const probeId = 'jNQXAC9IVRw';
  await run(
    ['--simulate', '--print', '%(id)s', `https://www.youtube.com/watch?v=${probeId}`],
    60000
  );
  return true;
}

function run(args, timeoutMs = 90000) {
  const { cmd, base } = resolveRunner();
  const fullArgs = [
    ...base,
    '--no-warnings',
    '--no-playlist',
    '--no-progress',
    '--js-runtimes',
    'node',
    '--socket-timeout',
    '20',
    '--retries',
    '2',
    ...authArgs(),
    ...args,
  ];
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      fullArgs,
      { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          const detail = String(stderr || err.message)
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.startsWith('ERROR'))
            .join(' ');
          reject(new Error(detail || `yt-dlp that bai: ${err.message}`));
          return;
        }
        resolve(stdout);
      }
    );
  });
}

function normalizeFormat(raw) {
  return {
    id: String(raw.format_id),
    ext: raw.ext,
    url: raw.url,
    width: raw.width || 0,
    height: raw.height || 0,
    fps: raw.fps || 0,
    vcodec: raw.vcodec && raw.vcodec !== 'none' ? raw.vcodec : null,
    acodec: raw.acodec && raw.acodec !== 'none' ? raw.acodec : null,
    abr: raw.abr || 0,
    tbr: raw.tbr || 0,
    filesize: raw.filesize || raw.filesize_approx || 0,
    protocol: raw.protocol || '',
    note: raw.format_note || '',
  };
}

/** Chi giu format tai truc tiep qua HTTP (bo HLS/DASH manifest). */
function isPlainHttp(format) {
  return /^https?$/.test(format.protocol) && Boolean(format.url);
}

async function fetchInfo(videoId) {
  const stdout = await run(['-J', `https://www.youtube.com/watch?v=${videoId}`]);
  const raw = JSON.parse(stdout);
  const formats = (raw.formats || []).map(normalizeFormat).filter(isPlainHttp);
  return {
    id: raw.id,
    title: raw.title || '(khong ro tieu de)',
    author: raw.uploader || raw.channel || '',
    duration: raw.duration || 0,
    views: raw.view_count || 0,
    likes: raw.like_count || 0,
    uploadDate: raw.upload_date || '',
    description: raw.description || '',
    isLive: Boolean(raw.is_live),
    formats,
  };
}

function getInfo(videoId) {
  return infoCache.wrap(`info:${videoId}`, config.INFO_TTL_MS, () => fetchInfo(videoId));
}

/**
 * MP4 gop san (H.264 + AAC) — dien thoai Symbian mo thang duoc, khong can chuyen ma.
 * Uu tien do phan giai <= maxHeight, cao nhat trong so do.
 */
function pickProgressive(formats, maxHeight = 360) {
  const usable = formats.filter(
    (f) =>
      f.vcodec &&
      f.acodec &&
      f.ext === 'mp4' &&
      /^avc1|^h264/.test(f.vcodec) &&
      /^mp4a/.test(f.acodec)
  );
  if (!usable.length) return null;
  const fit = usable.filter((f) => f.height && f.height <= maxHeight);
  const pool = fit.length ? fit : usable;
  return pool.sort((a, b) => b.height - a.height || b.tbr - a.tbr)[0];
}

/** Luong hinh rieng, dung lam nguon cho ffmpeg khi khong co MP4 gop san. */
function pickVideoOnly(formats, maxHeight = 360) {
  const usable = formats.filter((f) => f.vcodec && !f.acodec);
  if (!usable.length) return null;
  const avc = usable.filter((f) => /^avc1|^h264/.test(f.vcodec));
  const pool = avc.length ? avc : usable;
  const fit = pool.filter((f) => f.height && f.height <= maxHeight);
  return (fit.length ? fit : pool).sort((a, b) => b.height - a.height || b.tbr - a.tbr)[0];
}

/** Luong tieng rieng; uu tien AAC (m4a) vi Symbian doc tot nhat. */
function pickAudioOnly(formats) {
  const usable = formats.filter((f) => f.acodec && !f.vcodec);
  if (!usable.length) return null;
  const aac = usable.filter((f) => /^mp4a/.test(f.acodec));
  const pool = aac.length ? aac : usable;
  return pool.sort((a, b) => b.abr - a.abr)[0];
}

function findFormat(info, formatId) {
  return info.formats.find((f) => f.id === String(formatId)) || null;
}

module.exports = {
  getInfo,
  hasCookies,
  cookieStatus,
  inspectCookies,
  saveCookies,
  clearCookies,
  verify,
  authArgs,
  pickProgressive,
  pickVideoOnly,
  pickAudioOnly,
  findFormat,
};
