'use strict';

const { execFile } = require('child_process');

const config = require('./config');
const { TtlCache } = require('./cache');
const { formatCount, isVideoId } = require('./util');

const infoCache = new TtlCache(300);
const feedCache = new TtlCache(60);

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

let cachedVersion = null;

/** Phien ban yt-dlp dang dung — de biet container da tu cap nhat chua. */
function version() {
  if (cachedVersion) return cachedVersion;
  try {
    const { cmd, base } = resolveRunner();
    cachedVersion = require('child_process')
      .execFileSync(cmd, [...base, '--version'], {
        timeout: 20000,
        windowsHide: true,
        encoding: 'utf8',
      })
      .trim();
  } catch {
    cachedVersion = 'chưa cài';
  }
  return cachedVersion;
}

/** Quen thong tin da dem cua mot bo cookie — goi sau khi may do nap cookie moi. */
function forgetAuth(authKey) {
  const prefix = `info:${authKey}:`;
  for (const key of infoCache.map.keys()) {
    if (key.startsWith(prefix)) infoCache.map.delete(key);
  }
  for (const key of feedCache.map.keys()) {
    if (key.indexOf(`:${authKey}:`) > -1) feedCache.map.delete(key);
  }
}

/** Goi thu mot video cong khai de biet cookie con dung khong. */
async function verify(auth) {
  const probeId = 'jNQXAC9IVRw';
  await run(
    [
      '--simulate',
      '-f',
      'all',
      '--print',
      '%(id)s',
      `https://www.youtube.com/watch?v=${probeId}`,
    ],
    auth,
    60000
  );
  return true;
}

/** @param auth Bo cookie cua may goi — xem lib/cookies.js. */
function run(args, auth, timeoutMs = 90000) {
  const { cmd, base } = resolveRunner();
  const fullArgs = [
    ...base,
    '--no-warnings',
    '--no-playlist',
    '--no-progress',
    '--js-runtimes',
    'node',
    '--cache-dir',
    config.YTDLP_CACHE_DIR,
    '--socket-timeout',
    '20',
    '--retries',
    '2',
    ...(auth?.args || []),
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

async function fetchInfo(videoId, auth) {
  // '-f all' de yt-dlp khong tu chon dinh dang. Bo chon mac dinh cua no la
  // bestvideo*+bestaudio/best, khong khop duoc thi bao "Requested format is not
  // available" va hong ca lenh — trong khi minh chi can danh sach de tu loc.
  // Khong dung --ignore-no-formats-error: co no thi loi that su (vi du cookie
  // het han, YouTube doi dang nhap) bi nuot mat, chi con bao chung chung.
  const stdout = await run(
    ['-J', '-f', 'all', `https://www.youtube.com/watch?v=${videoId}`],
    auth
  );
  const raw = JSON.parse(stdout);
  const formats = (raw.formats || []).map(normalizeFormat).filter(isPlainHttp);

  if (!formats.length) {
    throw new Error(
      'KHONG_CO_DINH_DANG: YouTube khong tra ve luong tai truc tiep nao cho video nay.'
    );
  }

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

// Cung mot video nhung hai tai khoan co the thay hai ket qua khac nhau (video
// gioi han do tuoi, danh cho thanh vien...), nen bo nho dem tach theo bo cookie.
function getInfo(videoId, auth) {
  const key = `info:${auth?.key || 'none'}:${videoId}`;
  return infoCache.wrap(key, config.INFO_TTL_MS, () => fetchInfo(videoId, auth));
}

/**
 * Trang rieng cua tai khoan. yt-dlp goi tat: ':ytrec' la /feed/recommended,
 * ':ytsubs' la /feed/subscriptions.
 *
 * Hai trang nay doi cookie la mot phien dang nhap that o ngoi thu nhat. Cookie
 * chi co phan '3P' (__Secure-3PSID, __Secure-3PAPISID) van phat video duoc
 * nhung YouTube se tra ve trang cua nguoi chua dang nhap: :ytrec ra danh sach
 * rong, con :ytsubs bao thang "Login details are needed".
 */
const FEEDS = {
  recommended: ':ytrec',
  subscriptions: ':ytsubs',
};

function mapFeedEntry(entry) {
  if (!entry || !isVideoId(entry.id)) return null;
  const views = formatCount(entry.view_count);
  return {
    id: entry.id,
    title: entry.title || '(khong ro tieu de)',
    author: entry.channel || entry.uploader || '',
    duration: Math.round(Number(entry.duration) || 0),
    durationText: '',
    // '--flat-playlist' khong noi video dang len bao lau, chi co so luot xem.
    views: views ? `${views} lượt xem` : '',
    published: '',
    live: entry.live_status === 'is_live',
  };
}

async function fetchFeed(name, auth, limit) {
  try {
    return await askFeed(name, auth, limit);
  } catch (err) {
    // Goi y chi la phan them cua trang chinh, nen hong thi tra ve rong de bo nho
    // dem giu lai 10 phut. Nem loi ra thi bo dem khong giu, moi lan mo trang
    // chinh la mot lan ngoi cho yt-dlp that bai lan nua.
    console.error(`goi y (${name}) that bai:`, err.message);
    return [];
  }
}

async function askFeed(name, auth, limit) {
  const stdout = await run(
    [
      // run() dat san '--no-playlist' cho trang xem video; feed thi chinh la
      // playlist nen phai noi lai. Hai co ghi vao cung mot o, co sau thang.
      '--yes-playlist',
      '--flat-playlist',
      '--playlist-end',
      String(limit),
      '-J',
      FEEDS[name],
    ],
    auth,
    // Day la trang dau tien may goi, khong the de no cho lau. Qua han thi trang
    // chinh van ra, chi thieu phan goi y.
    25000
  );
  const raw = JSON.parse(stdout);
  return (raw.entries || []).map(mapFeedEntry).filter(Boolean);
}

/**
 * Tra ve mang video; mang rong nghia la YouTube coi bo cookie nay la chua dang
 * nhap. Dem theo tung bo cookie va theo dung TTL cua danh sach: moi lan lay la
 * mot lan goi yt-dlp, tren NAS yeu mat vai giay.
 */
function getFeed(name, auth, limit) {
  if (!FEEDS[name]) throw new Error(`Khong co feed '${name}'`);
  const key = `feed:${name}:${auth?.key || 'none'}:${limit}`;
  return feedCache.wrap(key, config.LIST_TTL_MS, () => fetchFeed(name, auth, limit));
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

/**
 * Nokia Belle doc duoc H.264 ca ba profile (base/main/high) toi 720p va AAC-LC,
 * theo dung bang thong so cua Nokia cho E6. Nghia la luong san co cua YouTube
 * may mo thang duoc, khong phai ma hoa lai.
 */
function isBelleVideo(format) {
  return Boolean(format && format.vcodec && /^avc1|^h264/.test(format.vcodec));
}

function isBelleAudio(format) {
  return Boolean(format && format.acodec && /^mp4a/.test(format.acodec));
}

/**
 * Tim cap luong hinh + tieng ma Belle doc duoc san, de ffmpeg chi phai ghep vo
 * chua (-c copy) thay vi ma hoa. Ghep vo chi la chep du lieu nen nhanh gap boi,
 * quan trong voi NAS chip ARM. Tra ve null khi thieu mot trong hai.
 */
function pickForRemux(formats, maxHeight = 240) {
  const video = pickVideoOnly(formats, maxHeight);
  const audio = pickAudioOnly(formats);
  if (!isBelleVideo(video) || !isBelleAudio(audio)) return null;
  return { video, audio };
}

module.exports = {
  getInfo,
  getFeed,
  version,
  forgetAuth,
  verify,
  pickProgressive,
  pickVideoOnly,
  pickAudioOnly,
  pickForRemux,
  isBelleVideo,
  isBelleAudio,
  findFormat,
};
