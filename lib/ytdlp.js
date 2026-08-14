'use strict';

const { execFile } = require('child_process');

const config = require('./config');
const { TtlCache } = require('./cache');
const { formatCount, isVideoId } = require('./util');

const infoCache = new TtlCache(300);
const feedCache = new TtlCache(60);

let runner = null;

/**
 * Co '--remote-components' chi co tu ban yt-dlp cuoi 2025; ban cu hon gap no la
 * hong ca lenh. Thu mot lan luc dau roi nho lai.
 */
function acceptsRemoteComponents(cmd, base) {
  try {
    require('child_process').execFileSync(
      cmd,
      [...base, '--remote-components', 'ejs:github', '--version'],
      { stdio: 'ignore', timeout: 20000 }
    );
    return true;
  } catch {
    return false;
  }
}

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
      runner = {
        ...candidate,
        remoteEjs:
          config.YTDLP_REMOTE_EJS &&
          acceptsRemoteComponents(candidate.cmd, candidate.base),
      };
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
  const { cmd, base, remoteEjs } = resolveRunner();
  const fullArgs = [
    ...base,
    // Co y khong dat '--no-warnings': khi hong, cau ERROR cua yt-dlp thuong chi
    // noi "khong co dinh dang nao", con ly do that nam o dong WARNING truoc do.
    '--no-playlist',
    '--no-progress',
    '--js-runtimes',
    'node',
    // Khong co cookie thi yt-dlp lay luong bang may khach 'android_vr', dia chi
    // ra thang khong khoa. Co cookie thi no bo may khach do (khong nhan cookie)
    // va chuyen sang 'tv'/'web creator' — hai cai nay bat giai mot doan
    // JavaScript cua YouTube truoc. Thieu bo giai la khong con dinh dang nao,
    // dung luc vua dang nhap xong: cookie cu chua nap thi van chay binh thuong.
    ...(remoteEjs ? ['--remote-components', 'ejs:github'] : []),
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
          const text = String(stderr || err.message);
          const detail = text
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.startsWith('ERROR'))
            .join(' ');
          // Thieu bo giai JavaScript thi yt-dlp chi bao "No video formats
          // found", ly do that nam trong dong canh bao ngay truoc do. Danh dau
          // lai de con chi dung cho ma sua.
          const noSolver = /challenge solver|challenge solving failed|wiki\/EJS/i.test(text);
          reject(
            new Error(
              `${noSolver ? 'THIEU_BO_GIAI_JS: ' : ''}` +
                (detail || `yt-dlp that bai: ${err.message}`)
            )
          );
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

async function askInfo(videoId, auth) {
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

/**
 * YouTube dang thu nghiem mot kieu khoa: mot phan cac lan hoi tra ve lo dia chi
 * chi cho lay 60 giay dau. Xin ca file thi bi tu choi thang (403), xin tung
 * doan thi chi duoc nhung doan nam trong mot phut dau. Ca lo dia chi cua lan
 * hoi do deu vay, ke ca ban gop san 360p ma may Nokia dung, nen roi vao lo do
 * la video khong phat duoc chu khong phai chi mat muc net cao.
 *
 * Xem trong dia chi thi khong biet duoc — chi khac may con so thu nghiem trong
 * 'fexp', ma nhung con so do YouTube doi luon. Nen phai hoi thang duong truyen:
 * xin ca file roi buong ngay khi thay dong dau tien. Chi ton mot lan bat tay,
 * khong tai gi ve.
 */
async function servesWholeFile(url) {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 10000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': config.DESKTOP_UA },
      signal: stop.signal,
    });
    // Buong ngay: khong buong thi may chu cu do ca file ve day.
    await res.body?.cancel?.();
    return res.status < 400;
  } catch {
    // Mang truc trac thi dung do cho dia chi: hoi lai yt-dlp cung khong khac gi
    // hon ma lai ton them vai giay.
    return true;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Thu dung cai ma may cu se phat: ban gop san 360p. No vua la duong hay dung
 * nhat, vua la duong hay chet nhat — co video ca lo dia chi con tot ma rieng
 * ban gop san bi tu choi. Video khong con ban gop san thi thu luong tieng, chi
 * de biet ca lo co bi khoa hay khong.
 */
function probeFormat(formats) {
  return (
    pickProgressive(formats, 360) ||
    pickAudioOnly(formats) ||
    formats.find((f) => f.url) ||
    null
  );
}

// Bao nhieu lan hoi lai khi roi vao lo bi khoa. Moi lan hoi la mot lan boc tham
// moi (chung mot phan ba bi khoa), nen ba lan la gan nhu chac chan co lo dung —
// va lan nao cung roi vao khoa thi tra ve lo cuoi: xem duoc mot phut van hon
// khong xem duoc gi.
const MAX_ASK = 3;

async function fetchInfo(videoId, auth, ask = askInfo) {
  let info = null;
  for (let lan = 1; lan <= MAX_ASK; lan += 1) {
    info = await ask(videoId, auth);
    // Buoi phat truc tiep khong co file tron de xin, khong thu kieu nay duoc.
    if (info.isLive) break;
    const thu = probeFormat(info.formats);
    if (!thu || (await servesWholeFile(thu.url))) break;
    console.warn(
      `[${videoId}] YouTube dua lo dia chi chi xem duoc 60 giay dau` +
        (lan < MAX_ASK ? ` — hoi lai (lan ${lan}/${MAX_ASK})` : ' — hoi may lan van vay, danh chiu')
    );
  }
  return info;
}

// Cung mot video nhung hai tai khoan co the thay hai ket qua khac nhau (video
// gioi han do tuoi, danh cho thanh vien...), nen bo nho dem tach theo bo cookie.
function infoKey(videoId, auth) {
  return `info:${auth?.key || 'none'}:${videoId}`;
}

function getInfo(videoId, auth) {
  return infoCache.wrap(infoKey(videoId, auth), config.INFO_TTL_MS, () =>
    fetchInfo(videoId, auth)
  );
}

/**
 * Bo ban dang giu va hoi lai tu dau — dung khi mot dia chi trong lo hoa ra da
 * chet luc dem ra phat. Cac lan goi trung nhau dung chung mot lan hoi: mot the
 * <video> bat dau phat co the ban ra may lan xin cung luc.
 */
const refreshing = new Map();

function refreshInfo(videoId, auth) {
  const key = infoKey(videoId, auth);
  const running = refreshing.get(key);
  if (running) return running;

  const pending = fetchInfo(videoId, auth)
    .catch((err) => {
      // Hoi lai that bai thi bo luon ban cu: giu ban co dia chi chet trong bo
      // nho dem chi lam nhung lan sau hong y nhu vay.
      infoCache.delete(key);
      throw err;
    })
    .finally(() => refreshing.delete(key));

  refreshing.set(key, pending);
  infoCache.set(key, pending, config.INFO_TTL_MS);
  return pending;
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

/** MP4 gop san cua YouTube: hinh H.264 va tieng AAC nam chung mot file. */
function isProgressive(format) {
  return Boolean(
    format.vcodec &&
      format.acodec &&
      format.ext === 'mp4' &&
      /^avc1|^h264/.test(format.vcodec) &&
      /^mp4a/.test(format.acodec)
  );
}

/**
 * MP4 gop san (H.264 + AAC) — dien thoai Symbian mo thang duoc, khong can chuyen ma.
 * Uu tien do phan giai <= maxHeight, cao nhat trong so do.
 */
function pickProgressive(formats, maxHeight = 360) {
  const usable = formats.filter(isProgressive);
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

/**
 * Cac do phan giai xem thang duoc cua mot video, cao xuong thap. Moi muc mot
 * kieu duong di khac nhau:
 *
 *   'san'  — YouTube co san mot file MP4 da gop ca hinh lan tieng. May chu chi
 *            don thang no di: nhe nhat, va tua duoc vi la file that.
 *   'ghep' — chi co luong hinh rieng, phai ghep voi luong tieng ngay luc phat.
 *            Chep du lieu chu khong ma hoa nen NAS lam duoc, nhung phat toi dau
 *            ghep toi do nen khong tua duoc.
 *
 * YouTube nay gan nhu chi con giu ban gop san o 360p (itag 18), nen khong co
 * 'ghep' thi may doi moi khong bao gio thay muc nao tren 360p. Doi lai may
 * Symbian khong doc duoc muc 'ghep' — nen ai duoc thay no la viec cua noi goi
 * ham nay (xem tham so remux).
 *
 * Chi lay 'ghep' o cac muc cao hon ban gop san cao nhat: thap hon thi ban gop
 * san hon moi duong, bay ra chi tho danh sach.
 */
function streamChoices(formats, { remux = false } = {}) {
  const byHeight = new Map();

  for (const format of formats) {
    if (!format.height || !isProgressive(format)) continue;
    const seen = byHeight.get(format.height);
    if (!seen || format.tbr > seen.tbr) {
      byHeight.set(format.height, {
        height: format.height,
        kind: 'san',
        id: format.id,
        codec: format.vcodec,
        tbr: format.tbr,
      });
    }
  }

  // Ghep thi phai co ca luong tieng AAC; khong co thi ffmpeg buoc phai ma hoa
  // lai, ma ma hoa thi khong con la "xem thang" nua.
  if (remux && isBelleAudio(pickAudioOnly(formats))) {
    // Ban gop san hon ban ghep moi duong: nhe hon, tua duoc, may nao cung mo.
    // Nen chi lay ban ghep o cac muc CAO HON ban gop san cao nhat — bay ra muc
    // 144p hay 240p ghep ben canh 360p gop san thi chi tho them mot dong de
    // luot qua, khong ai chon.
    const best = Math.max(0, ...byHeight.keys());
    for (const format of formats) {
      if (!format.height || format.acodec || !isBelleVideo(format)) continue;
      if (format.height <= best) continue;
      const seen = byHeight.get(format.height);
      if (!seen || format.tbr > seen.tbr) {
        byHeight.set(format.height, {
          height: format.height,
          kind: 'ghep',
          id: format.id,
          codec: format.vcodec,
          tbr: format.tbr,
        });
      }
    }
  }

  return [...byHeight.values()].sort((a, b) => b.height - a.height);
}

module.exports = {
  getInfo,
  refreshInfo,
  // Hai cai duoi de tools/test-luong.js goi thang duoc, khong phai dung yt-dlp that.
  fetchInfo,
  servesWholeFile,
  getFeed,
  version,
  forgetAuth,
  verify,
  pickProgressive,
  pickVideoOnly,
  pickAudioOnly,
  pickForRemux,
  streamChoices,
  isBelleVideo,
  isBelleAudio,
  findFormat,
};
