'use strict';

const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const QRCode = require('qrcode');
const zlib = require('zlib');
const { Readable } = require('stream');

const config = require('./lib/config');
const { TtlCache } = require('./lib/cache');
const cookies = require('./lib/cookies');
const icons = require('./lib/icons');
const innertube = require('./lib/innertube');
const pairing = require('./lib/pairing');
const ytdlp = require('./lib/ytdlp');
const media = require('./lib/media');
const render = require('./lib/render');
const { parseCookies, parseVideoId, isVideoId } = require('./lib/util');

const app = express();
app.disable('x-powered-by');
app.disable('etag');
if (config.TRUST_PROXY) app.set('trust proxy', true);

// Man hinh E6 la 640x480; luong gop san cao nhat cua YouTube duoi muc do la
// 360p (itag 18, H.264 baseline + AAC) — dung thu Belle mo thang duoc.
const BELLE_MAX_HEIGHT = 360;

/**
 * May cu hay may doi moi. Hai cho can biet, va ca hai deu la chuyen "may nay
 * doc duoc gi" chu khong phai so thich cua nguoi dung, nen khong hoi ma nhan
 * theo ten may:
 *
 *  - Do phan giai cao phai ghep ngay luc phat, ma ban ghep do nam trong vo MP4
 *    phan manh — trinh duyet Symbian khong doc duoc.
 *  - Man hinh 640x480 (va 360x640 khi xem doc) khong dung toi 720p.
 *
 * Nhan nham theo huong nao cung chi mat hoac thua vai muc chon, khong hong
 * trang: may cu van luon co duong 360p gop san o dau danh sach.
 */
function isLegacyDevice(req) {
  const ua = String(req.headers['user-agent'] || '');
  return /Symbian|Series ?60|S60|NokiaBrowser|MIDP|Opera Mini/i.test(ua);
}

// ---------- tuy chon nguoi dung (luu bang cookie) ----------

const DEFAULT_PREFS = {
  thumbs: true,
  pageSize: config.PAGE_SIZE,
  textSize: render.DEFAULT_TEXT_SIZE,
};

function readPrefs(req) {
  const prefs = { ...DEFAULT_PREFS };
  const jar = parseCookies(req.headers.cookie);
  if (jar.thumbs !== undefined) prefs.thumbs = jar.thumbs === '1';
  if (render.TEXT_SIZES[jar.textSize]) prefs.textSize = jar.textSize;
  const pageSize = Number(jar.pageSize);
  if (Number.isFinite(pageSize) && pageSize >= 4 && pageSize <= 40) {
    prefs.pageSize = pageSize;
  }
  return prefs;
}

/**
 * Dia chi de nguoi dung go tren may khac (trang /link, ma QR). Sau reverse
 * proxy thi Host la ten noi bo, phai nghe theo X-Forwarded-* moi ra dung
 * dia chi cong khai.
 */
function publicBase(req) {
  if (config.PUBLIC_URL) return config.PUBLIC_URL;
  const first = (value) => String(value || '').split(',')[0].trim();
  const proto = first(req.headers['x-forwarded-proto']) || 'http';
  const host =
    first(req.headers['x-forwarded-host']) ||
    req.headers.host ||
    `localhost:${config.PORT}`;
  return `${proto}://${host}`;
}

function clientIp(req) {
  return req.ip || req.socket.remoteAddress || '?';
}

/** Ten may cua chinh mang nha — de biet co nen doi HTTPS hay khong. */
function isLocalHost(hostname) {
  const name = String(hostname || '').split(':')[0].toLowerCase();
  return (
    name === 'localhost' ||
    name.endsWith('.local') ||
    /^127\./.test(name) ||
    /^10\./.test(name) ||
    /^192\.168\./.test(name) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(name)
  );
}

/**
 * Cookie YouTube la ca phien dang nhap Google, nen trang nop cookie ma di qua
 * HTTP tran giua Internet thi ai nam duong truyen cung doc duoc. Trong mang nha
 * thi khong sao, ra ngoai Internet la phai HTTPS.
 */
function linkIsExposed(req) {
  if (req.secure) return false;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  if (proto === 'https') return false;
  return !isLocalHost(req.headers['x-forwarded-host'] || req.headers.host);
}

/**
 * Trang cua ta gan nhu chi co chu (HTML, SVG dat thang trong trang) nen nen lai
 * con chung mot phan ba — dang ke voi mot may keo qua Wi-Fi 802.11b va ve trang
 * bang chip 680MHz. Nokia Browser tu bao "Accept-Encoding: gzip" va giai dung,
 * nhung chi nen khi may that su noi la doc duoc: may nao khong noi thi gui tran.
 */
function sendPage(res, html, status = 200) {
  const body = Buffer.from(html, 'utf8');
  res
    .status(status)
    .set('Content-Type', 'text/html; charset=utf-8')
    .set('Cache-Control', 'no-cache')
    .set('Vary', 'Accept-Encoding');

  const accepts = String(res.req?.headers['accept-encoding'] || '');
  // Trang be hon mot goi tin thi nen cung khong bot duoc lan truyen nao.
  if (body.length > 1400 && /\bgzip\b/.test(accepts)) {
    res.set('Content-Encoding', 'gzip').send(zlib.gzipSync(body));
    return;
  }
  res.send(body);
}

/** Doi loi ky thuat sang cau tieng Viet de hieu tren man hinh nho. */
function friendlyError(err) {
  const message = String(err?.message || err);
  if (/THIEU_BO_GIAI_JS/.test(message)) {
    return (
      'Máy chủ thiếu bộ giải câu đố JavaScript của YouTube nên không mở được' +
      ' luồng cho máy đã đăng nhập. Cài trên máy chủ:' +
      ' python -m pip install --upgrade yt-dlp-ejs (chạy Docker thì khởi động' +
      ' lại container, nó tự cài).'
    );
  }
  if (/Sign in to confirm|not a bot|LOGIN_REQUIRED|cookies/i.test(message)) {
    return 'YouTube đang đòi đăng nhập. Vào mục Đăng nhập trên chính máy này để nối lại tài khoản (cookie cũ có thể đã hết hạn).';
  }
  if (/Video unavailable|Private video|removed/i.test(message)) {
    return 'Video này không xem được (riêng tư, bị gỡ hoặc chặn theo khu vực).';
  }
  if (/KHONG_CO_DINH_DANG|Requested format is not available|No video formats/i.test(message)) {
    return (
      'YouTube không trả về luồng nào tải thẳng được cho video này. Thử video' +
      ' khác; nếu video nào cũng lỗi thì máy chủ đang thiếu bộ giải JavaScript' +
      ' (yt-dlp-ejs) hoặc yt-dlp đã cũ — khởi động lại container để nó tự cài lại.'
    );
  }
  if (/members-only|join this channel|Premieres in|This live event/i.test(message)) {
    return 'Video này chỉ dành cho thành viên kênh, hoặc là buổi phát trực tiếp chưa bắt đầu.';
  }
  // YouTube cat ngang giua chung (thay vi tu choi thang) khi thay mot dia chi
  // goi qua day trong thoi gian ngan. Vai phut sau la lai binh thuong, nen
  // dung bao nguoi dung di kiem tra mang — khong phai loi ben minh.
  if (/RetriableError|http\/2 stream closed|CANCEL \(0x8\)|Remote end closed/i.test(message)) {
    return (
      'YouTube vừa cắt ngang kết nối của máy chủ — thường là do gọi quá dày' +
      ' trong ít phút. Chờ một lát rồi mở lại video này.'
    );
  }
  if (/timed out|ETIMEDOUT|ECONNRESET|fetch failed|Connection aborted/i.test(message)) {
    return 'Không kết nối được tới YouTube. Kiểm tra mạng hoặc VPN của máy chủ.';
  }
  if (/Khong tim thay yt-dlp/i.test(message)) {
    return 'Chưa cài yt-dlp trên máy chủ. Chạy: python -m pip install --upgrade yt-dlp';
  }
  return message;
}

// ---------- tai nguyen tinh ----------

app.use((req, res, next) => {
  // Dia chi phat mang theo khoa cua may (?k=...), dung de no theo chan Referer
  // sang trang khac. May Symbian bo qua header la nen dat thoai mai.
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Content-Type-Options', 'nosniff');
  next();
});

/**
 * express.static khong biet nen, ma /s60.css voi /s60.js cong lai 36KB — nen lai
 * con chung mot phan tu. Duong dan da co ?v=<ma noi dung> nen giu ban da nen
 * trong bo nho luon: doi file la doi ma, khoi dong lai may chu la nen lai.
 */
const ASSET_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
};
const packedAssets = new Map();

function packedAsset(name) {
  if (!packedAssets.has(name)) {
    let packed = null;
    try {
      packed = zlib.gzipSync(fs.readFileSync(path.join(config.ROOT, 'public', name)), {
        level: 9,
      });
    } catch {
      // khong co file thi de express.static tra loi 404 nhu thuong
    }
    packedAssets.set(name, packed);
  }
  return packedAssets.get(name);
}

app.get('/*', (req, res, next) => {
  const type = ASSET_TYPES[path.extname(req.path)];
  const name = path.basename(req.path);
  // Chi nhung file nam ngay trong public/, va chi khi may noi la doc duoc ban nen.
  if (!type || req.path !== `/${name}`) {
    next();
    return;
  }
  if (!/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
    next();
    return;
  }
  const body = packedAsset(name);
  if (!body) {
    next();
    return;
  }
  res
    .set('Content-Type', type)
    .set('Content-Encoding', 'gzip')
    .set('Cache-Control', 'public, max-age=2592000')
    .set('Vary', 'Accept-Encoding')
    .send(body);
});

/**
 * Bieu tuong: may chu to hinh SVG ra anh PNG roi giu trong bo nho (xem
 * lib/icons.js). Trinh duyet goc cua Symbian khong co bo ve SVG nen dat <svg>
 * thang trong trang la mat hinh; anh PNG thi may nao cung mo duoc.
 *
 * Ten file mang san ten hinh va ten mau, con dia chi mang thay ma cua ca bo
 * hinh — doi hinh la doi dia chi, nen cho may giu that lau trong bo dem.
 */
app.get('/i/:file', (req, res) => {
  const body = icons.png(req.params.file);
  if (!body) {
    res.status(404).end();
    return;
  }
  res
    .set('Content-Type', 'image/png')
    .set('Cache-Control', 'public, max-age=2592000')
    .send(body);
});

app.use(
  express.static(path.join(config.ROOT, 'public'), {
    // Duong dan trong HTML co dinh ?v=<ASSET_TAG> theo noi dung file, nen giu
    // lau trong may cho do ton 2G: doi file la doi duong dan, may tai lai ngay.
    maxAge: '30d',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.css')) res.set('Content-Type', 'text/css; charset=utf-8');
    },
  })
);

app.use(express.urlencoded({ extended: false, limit: '2mb' }));

/** Duong dan tra ve file cho trinh phat, khong phai trang de nguoi doc. */
function isMediaPath(pathname) {
  return /^\/(stream|hd|audio|file|thumb)\//.test(pathname) || pathname === '/qr';
}

// Moi trang deu can tuy chon hien thi (co chu, anh thu nho) de dung layout,
// va can biet may nao dang goi de lay dung cookie YouTube cua nguoi do.
app.use((req, res, next) => {
  req.prefs = readPrefs(req);
  const own = cookies.read(req);
  // Trang /remember mang san ma thiet bi trong dia chi va tu dat lai cookie do,
  // nen o day khong phat ma moi: mot phan hoi co hai Set-Cookie cung ten thi
  // may cu chon cai nao la chuyen cua may cu.
  const claiming = req.path === '/remember';
  // Trinh phat cua may Nokia mo lien ket .mp4 ben ngoai trinh duyet nen khong
  // gui cookie theo — luc do nhan ra may bang khoa phat dinh trong dia chi.
  req.device =
    own || cookies.byStreamKey(req.query.k) || (claiming ? '' : cookies.issue(res));
  // Gui lai ma thiet bi o moi trang: han dung luon lui ra mot nam nua, nen may
  // dung hang ngay thi khong bao gio het han. Chi lam voi may that su dang cam
  // cookie — dat cookie theo khoa phat la nang khoa do len bang ca ma thiet bi.
  if (own && !isMediaPath(req.path)) cookies.attach(res, own);
  req.streamKey = cookies.streamKey(req.device);
  req.auth = cookies.authFor(req.device);
  next();
});

// ---------- trang chinh ----------

/**
 * Da dang nhap thi trang chinh la trang goi y cua chinh tai khoan do, giong
 * YouTube thuong. Lay duoc hay khong thi danh sach chu de van nam duoi, nen
 * moi duong hong o day chi lam mat phan goi y chu khong lam mat trang chinh:
 * day la trang dau tien may goi, khong duoc phep tra ve loi.
 */
async function homeFeed(req) {
  if (!config.HOME_FEED || !cookies.status(req.device).ready) return {};
  try {
    const videos = await ytdlp.getFeed('recommended', req.auth, config.PAGE_SIZE);
    if (videos.length) return { videos };
    return { note: feedEmptyNote(req) };
  } catch (err) {
    console.error('goi y that bai:', err.message);
    return { note: feedEmptyNote(req) };
  }
}

/** Noi ro cho de sua, khong bao chung chung "khong lay duoc". */
function feedEmptyNote(req) {
  if (cookies.hasPageSession(req.device) === false) {
    return (
      'Chưa có gợi ý riêng: cookie của máy này thiếu phần đăng nhập gốc của' +
      ' youtube.com (LOGIN_INFO, SID) nên YouTube coi máy chủ là chưa đăng nhập.' +
      ' Xuất lại cookie khi đang mở youtube.com và đã đăng nhập là có.'
    );
  }
  return 'Chưa lấy được gợi ý riêng lúc này — YouTube không trả về danh sách nào.';
}

app.get('/', async (req, res) => {
  const { videos, note } = await homeFeed(req);
  sendPage(
    res,
    render.homePage({
      prefs: req.prefs,
      videos,
      note,
      warning: cookies.status(req.device).ready
        ? null
        : 'Máy này chưa nối tài khoản YouTube — tìm kiếm vẫn chạy nhưng chưa phát được video.',
    })
  );
});

// ---------- tim kiem ----------

app.get('/search', async (req, res) => {
  const prefs = req.prefs;
  const query = String(req.query.q || '').trim();
  const page = String(req.query.p || '');

  if (!query) {
    sendPage(
      res,
      render.searchPage({ query: '', videos: [], prefs, nextPage: null })
    );
    return;
  }

  // Nguoi dung co the dan thang link YouTube vao o tim kiem.
  const pastedId = parseVideoId(query);
  if (pastedId && /https?:|youtu/i.test(query)) {
    res.redirect(302, `/watch?v=${pastedId}`);
    return;
  }

  try {
    const { videos, nextPage } = await innertube.search(query, page);
    sendPage(
      res,
      render.searchPage({
        query,
        videos: videos.slice(0, prefs.pageSize),
        prefs,
        nextPage,
      })
    );
  } catch (err) {
    sendPage(
      res,
      render.searchPage({
        query,
        videos: [],
        prefs,
        nextPage: null,
        warning: friendlyError(err),
      })
    );
  }
});

// ---------- trang xem ----------

/**
 * Bien danh sach do phan giai cua mot video thanh nhung muc bam duoc tren
 * trang: moi muc mot dia chi xem thang, va mot dia chi quay lai chinh trang
 * video de doi khung phat sang muc do.
 *
 * Muc dang xem la muc trong dia chi (?q=), khong co thi lay ban gop san cao
 * nhat: no nhe nhat va tua duoc. Khong bao gio tu chon ban ghep — no chi ra
 * khi nguoi dung that su bam vao, vi ghep thi khong tua duoc.
 */
function playChoices(videoId, formats, { legacy, streamKey, wanted }) {
  const key = streamKey ? `?k=${encodeURIComponent(streamKey)}` : '';
  const choices = ytdlp
    .streamChoices(formats, { remux: !legacy && media.isAvailable() })
    .map((choice) => ({
      ...choice,
      src:
        choice.kind === 'san'
          ? `/stream/${videoId}/${choice.id}${key}`
          : `/hd/${videoId}/${choice.height}${key}`,
      href: `/watch?v=${videoId}&amp;q=${choice.height}`,
    }));

  const ready = choices.filter((choice) => choice.kind === 'san');
  const auto =
    ready.find((choice) => !legacy || choice.height <= BELLE_MAX_HEIGHT) ||
    ready[0] ||
    // Video khong con ban gop san nao (thuong la ban moi chi co VP9/AV1): may
    // doi moi van xem duoc bang duong ghep, con may cu thi danh chiu.
    (legacy ? null : choices[0]) ||
    null;

  const chosen = choices.find((choice) => choice.height === wanted) || auto;
  return { choices, chosen };
}

/**
 * Dia chi hai luong roi (hinh, tieng) de trinh duyet cua may doi moi tu ghep
 * lay — xem public/hd.js. Ghep trong may thi tua duoc, va may chu khong phai
 * chay ffmpeg cho tung nguoi xem nua, chi con chuyen tiep byte.
 *
 * Van tra ve du lieu nay ma khong biet may kia co lam duoc hay khong: trang cu
 * do duong /hd vao the <video> nhu cu, chinh hd.js tu quyet dinh co thay hay
 * khong. May khong chay duoc JavaScript thi khong mat gi.
 */
function remuxStreams(videoId, formats, { chosen, streamKey, duration }) {
  if (!chosen || chosen.kind !== 'ghep') return null;
  const audio = ytdlp.pickAudioOnly(formats);
  if (!ytdlp.isBelleAudio(audio) || !chosen.codec) return null;
  const key = streamKey ? `?k=${encodeURIComponent(streamKey)}` : '';
  return {
    height: chosen.height,
    duration,
    video: `/stream/${videoId}/${chosen.id}${key}`,
    videoType: `video/mp4; codecs="${chosen.codec}"`,
    audio: `/stream/${videoId}/${audio.id}${key}`,
    audioType: `audio/mp4; codecs="${audio.acodec}"`,
  };
}

app.get('/watch', async (req, res) => {
  const prefs = req.prefs;
  const videoId = parseVideoId(req.query.v);
  if (!videoId) {
    sendPage(
      res,
      render.errorPage({
        title: 'Sai địa chỉ',
        message: 'Thiếu mã video hợp lệ.',
        back: '/',
        prefs,
      }),
      400
    );
    return;
  }

  const [infoResult, relatedResult] = await Promise.allSettled([
    ytdlp.getInfo(videoId, req.auth),
    innertube.related(videoId),
  ]);

  const related =
    relatedResult.status === 'fulfilled'
      ? relatedResult.value.videos.slice(0, prefs.pageSize)
      : [];

  const legacy = isLegacyDevice(req);
  let info = null;
  let choices = [];
  let chosen = null;
  let mse = null;
  let error = null;
  if (infoResult.status === 'fulfilled') {
    const raw = infoResult.value;
    info = {
      ...raw,
      audioDirect: ytdlp.isBelleAudio(ytdlp.pickAudioOnly(raw.formats)),
    };
    ({ choices, chosen } = playChoices(videoId, raw.formats, {
      legacy,
      streamKey: req.streamKey,
      wanted: Number(req.query.q) || 0,
    }));
    mse = remuxStreams(videoId, raw.formats, {
      chosen,
      streamKey: req.streamKey,
      duration: raw.duration,
    });
  } else {
    // Giu nguyen van loi trong log de con lan ra nguyen nhan, con man hinh
    // dien thoai thi chi hien cau tieng Viet ngan gon.
    console.warn(`[watch ${videoId}] ${infoResult.reason?.message || infoResult.reason}`);
    error = friendlyError(infoResult.reason);
  }

  sendPage(
    res,
    render.watchPage({
      video: { id: videoId, title: info?.title || 'Video', author: '', duration: 0 },
      info,
      choices,
      chosen,
      mse,
      related,
      prefs,
      profiles: media.PROFILES,
      ffmpegOk: media.isAvailable(),
      streamKey: req.streamKey,
      legacy,
      error,
    })
  );
});

// ---------- anh thu nho ----------

/**
 * Anh nam trong bo nho may chu, khong xuong dia: mot trang danh sach la muoi may
 * anh, moi cai mot lan goi ra i.ytimg.com. Doi lai chi lay mot lan cho moi video
 * — do la phan cho lau nhat cua mot trang danh sach.
 */
const thumbCache = new TtlCache(400);
const THUMB_TTL_MS = 24 * 60 * 60 * 1000;

async function loadThumb(id) {
  // mqdefault la ban 320x180 dung khung 16:9, vua khop voi mot cot rong het
  // man hinh. default.jpg chi 120x90 va vien den hai ben nen de danh du phong.
  for (const name of ['mqdefault', 'default']) {
    try {
      const upstream = await fetch(`https://i.ytimg.com/vi/${id}/${name}.jpg`, {
        headers: { 'User-Agent': config.DESKTOP_UA },
      });
      if (!upstream.ok) continue;
      const buffer = Buffer.from(await upstream.arrayBuffer());
      return (await media.shrinkJpeg(buffer)) || buffer;
    } catch {
      // thu ten tiep theo
    }
  }
  // Nem loi chu khong tra ve rong: bo nho dem chi giu ket qua thanh cong, khong
  // thi mot lan mang chap la anh do trong ca ngay.
  throw new Error(`khong lay duoc anh ${id}`);
}

app.get('/thumb/:id', async (req, res) => {
  const { id } = req.params;
  if (!isVideoId(id)) {
    res.status(400).end();
    return;
  }
  try {
    const buffer = await thumbCache.wrap(id, THUMB_TTL_MS, () => loadThumb(id));
    res
      .set('Content-Type', 'image/jpeg')
      // Anh bia cua mot video hau nhu khong doi, ma dia chi lai mang ma video —
      // giu ca tuan trong may cho de cac lan vao sau khoi tai lai.
      .set('Cache-Control', 'public, max-age=604800')
      .send(buffer);
  } catch {
    res.status(502).end();
  }
});

// ---------- xem online (proxy MP4 co san, khong luu gi tren dia) ----------

/**
 * Trinh phat cua Belle keo file theo tung doan bang header Range, nen chi can
 * chuyen tiep Range len YouTube la may phat duoc ngay ma khong tai het file.
 * Bat buoc de "inline": co "attachment" la trinh duyet Symbian chuyen sang tai ve.
 */
async function proxyFormat(req, res, id, format) {
  const headers = { 'User-Agent': config.DESKTOP_UA };
  if (req.headers.range) headers.Range = req.headers.range;

  const audioOnly = Boolean(format.acodec && !format.vcodec);
  const upstream = await fetch(format.url, { headers });
  res.status(upstream.status === 206 ? 206 : upstream.status);
  res.set('Content-Type', audioOnly ? 'audio/mp4' : 'video/mp4');
  res.set('Content-Disposition', `inline; filename="${id}.${audioOnly ? 'm4a' : 'mp4'}"`);
  res.set('Accept-Ranges', 'bytes');
  res.set('Cache-Control', 'no-store');
  for (const key of ['content-length', 'content-range']) {
    const value = upstream.headers.get(key);
    if (value) res.set(key, value);
  }

  if (req.method === 'HEAD') {
    upstream.body?.cancel?.();
    res.end();
    return;
  }

  const stream = Readable.fromWeb(upstream.body);
  res.on('close', () => stream.destroy());
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

// Trang video dinh san ma luong (itag) vao dia chi cho tung muc do phan giai;
// khong co :formatId thi tu chon luong hop voi Belle. Duong dan on dinh nhu vay
// thi trinh phat mo lai duoc sau khi thong tin video het han trong bo nho dem.
app.all('/stream/:id/:formatId?', async (req, res) => {
  const { id, formatId } = req.params;
  if (!isVideoId(id)) {
    res.status(400).end();
    return;
  }

  try {
    const info = await ytdlp.getInfo(id, req.auth);
    const format = formatId
      ? ytdlp.findFormat(info, formatId)
      : ytdlp.pickProgressive(info.formats, BELLE_MAX_HEIGHT);
    if (!format) {
      sendPage(
        res,
        render.errorPage({
          title: 'Không xem online được',
          message:
            'Video này không có sẵn luồng MP4 mà Belle mở thẳng được. Hãy chọn "Tạo bản nhẹ" ở trang video.',
          back: `/watch?v=${id}`,
          prefs: req.prefs,
        }),
        404
      );
      return;
    }
    await proxyFormat(req, res, id, format);
  } catch (err) {
    sendPage(
      res,
      render.errorPage({
        title: 'Không phát được',
        message: friendlyError(err),
        back: `/watch?v=${id}`,
        prefs: req.prefs,
      }),
      502
    );
  }
});

// ---------- xem o do phan giai cao (ghep ngay luc phat) ----------

/**
 * YouTube nay gan nhu chi con giu ban gop san o 360p; tu 480p tro len thi hinh
 * va tieng nam roi hai file. Duong nay ghep chung ngay trong luc phat roi do
 * thang ra may (xem media.remuxStream) — may doi moi bam mot cai la chay, khong
 * phai cho tao file.
 *
 * Chi ghep chu khong ma hoa, nhung van la mot tien trinh ffmpeg cho moi nguoi
 * xem: bo di ngay khi may kia ngat, khong thi no cu keo tiep ca video ve.
 */
app.all('/hd/:id/:height', async (req, res) => {
  const { id } = req.params;
  const height = Number(req.params.height);
  if (!isVideoId(id) || !Number.isFinite(height) || height <= 0) {
    res.status(400).end();
    return;
  }

  const fail = (title, message, status) =>
    sendPage(
      res,
      render.errorPage({ title, message, back: `/watch?v=${id}`, prefs: req.prefs }),
      status
    );

  if (!media.isAvailable()) {
    fail('Thiếu ffmpeg', 'Máy chủ chưa có ffmpeg nên không ghép được luồng.', 503);
    return;
  }

  let video = null;
  let audio = null;
  try {
    const info = await ytdlp.getInfo(id, req.auth);
    video = ytdlp.pickVideoOnly(info.formats, height);
    audio = ytdlp.pickAudioOnly(info.formats);
  } catch (err) {
    fail('Không phát được', friendlyError(err), 502);
    return;
  }

  if (!ytdlp.isBelleVideo(video) || !ytdlp.isBelleAudio(audio)) {
    fail(
      'Không ghép được',
      'Video này không có luồng H.264 và AAC để ghép thẳng. Hãy chọn mức 360p, hoặc tạo bản ở trang video.',
      404
    );
    return;
  }

  res.set('Content-Type', 'video/mp4');
  res.set('Content-Disposition', `inline; filename="${id}.mp4"`);
  res.set('Cache-Control', 'no-store');
  // Ban ghep khong co chi muc cho ca file nen khong tua duoc; noi thang ra de
  // trinh duyet khong thu doi mot doan giua chung roi bao hong.
  res.set('Accept-Ranges', 'none');

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const child = media.remuxStream(video.url, audio.url);
  let tail = '';
  child.stderr.on('data', (chunk) => {
    tail = (tail + chunk).slice(-500);
  });
  child.on('error', (err) => {
    console.warn(`[hd ${id}] khong chay duoc ffmpeg: ${err.message}`);
    res.destroy();
  });
  child.on('close', (code) => {
    if (code) console.warn(`[hd ${id}] ffmpeg thoat ${code}: ${tail.trim()}`);
  });
  res.on('close', () => child.kill('SIGKILL'));
  child.stdout.pipe(res);
});

// ---------- nghe truc tiep (luong m4a cua YouTube, khong chuyen ma) ----------

/**
 * YouTube da san luong AAC trong vo MP4 (itag 140) — dung thu Symbian nghe duoc.
 * Don thang no di la xong ngay, khong ton mot giay CPU nao cua NAS. Chi khi
 * video khong co luong AAC nao moi phai nho toi ffmpeg.
 */
app.all('/audio/:id', async (req, res) => {
  const { id } = req.params;
  if (!isVideoId(id)) {
    res.status(400).end();
    return;
  }

  try {
    const info = await ytdlp.getInfo(id, req.auth);
    const audio = ytdlp.pickAudioOnly(info.formats);
    if (!ytdlp.isBelleAudio(audio)) {
      res.redirect(302, `/convert?v=${id}&p=audio`);
      return;
    }
    await proxyFormat(req, res, id, audio);
  } catch (err) {
    sendPage(
      res,
      render.errorPage({
        title: 'Không nghe được',
        message: friendlyError(err),
        back: `/watch?v=${id}`,
        prefs: req.prefs,
      }),
      502
    );
  }
});

// ---------- chuyen ma cho may yeu ----------

app.get('/convert', async (req, res) => {
  const videoId = parseVideoId(req.query.v);
  const profileId = String(req.query.p || '');

  if (!videoId || !media.PROFILES[profileId]) {
    sendPage(
      res,
      render.errorPage({
        title: 'Sai yêu cầu',
        message: 'Thiếu mã video hoặc chất lượng không hợp lệ.',
        back: '/',
        prefs: req.prefs,
      }),
      400
    );
    return;
  }

  if (!media.isAvailable()) {
    sendPage(
      res,
      render.errorPage({
        title: 'Thiếu ffmpeg',
        message: 'Máy chủ chưa có ffmpeg nên không chuyển mã được.',
        back: `/watch?v=${videoId}`,
        prefs: req.prefs,
      }),
      503
    );
    return;
  }

  try {
    const existing = media.getJob(videoId, profileId);
    const info = await ytdlp.getInfo(videoId, req.auth);

    let job = existing;
    if (!job || job.status === 'error') {
      const profile = media.PROFILES[profileId];
      const sources = [];
      // Ghep vo chua chi la chep du lieu, nhanh gap boi so voi ma hoa lai.
      // Chi khi YouTube khong con ban H.264/AAC nao moi phai ma hoa that.
      let copy = false;

      if (profile.audioOnly) {
        const audio = ytdlp.pickAudioOnly(info.formats) ||
          ytdlp.pickProgressive(info.formats, 720);
        if (!audio) throw new Error('Không tìm thấy luồng tiếng phù hợp.');
        sources.push(audio.url);
        copy = ytdlp.isBelleAudio(audio);
      } else {
        const pair = ytdlp.pickForRemux(info.formats, profile.maxHeight);
        if (pair) {
          sources.push(pair.video.url, pair.audio.url);
          copy = true;
        } else {
          const progressive = ytdlp.pickProgressive(info.formats, profile.maxHeight);
          if (progressive) {
            sources.push(progressive.url);
          } else {
            const video = ytdlp.pickVideoOnly(info.formats, profile.maxHeight);
            const audio = ytdlp.pickAudioOnly(info.formats);
            if (!video || !audio) throw new Error('Không tìm thấy luồng hình/tiếng phù hợp.');
            sources.push(video.url, audio.url);
          }
        }
      }

      job = media.startJob({
        videoId,
        profileId,
        sources,
        duration: info.duration,
        copy,
      });
    }

    sendPage(
      res,
      render.convertPage({
        video: { id: videoId, title: info.title },
        job: { ...job, position: media.queuePosition(job) },
        profileId,
        profiles: media.PROFILES,
        prefs: req.prefs,
      })
    );
  } catch (err) {
    sendPage(
      res,
      render.errorPage({
        title: 'Không chuẩn bị được video',
        message: friendlyError(err),
        back: `/watch?v=${videoId}`,
        prefs: req.prefs,
      }),
      502
    );
  }
});

// ---------- phat file da chuyen ma ----------

app.get('/file/:id/:profileId', (req, res) => {
  const { id, profileId } = req.params;
  if (!isVideoId(id) || !media.PROFILES[profileId]) {
    res.status(400).end();
    return;
  }
  const job = media.getJob(id, profileId);
  if (!job || job.status !== 'done') {
    res.redirect(302, `/convert?v=${id}&p=${profileId}`);
    return;
  }
  const audioOnly = media.PROFILES[profileId].ext === 'm4a';
  res.set('Content-Type', audioOnly ? 'audio/mp4' : 'video/mp4');
  res.set('Content-Disposition', `inline; filename="${id}.${audioOnly ? 'm4a' : 'mp4'}"`);
  res.sendFile(job.file, { acceptRanges: true, cacheControl: false });
});

// ---------- dang nhap bang ma / QR ----------

app.get('/login', async (req, res) => {
  const status = cookies.status(req.device);

  let notice = null;
  let error = null;
  if (status.ready && req.query.check === '1') {
    try {
      await ytdlp.verify(req.auth);
      notice = 'Cookie còn tốt — YouTube nhận. Vào xem video được rồi.';
    } catch (err) {
      error = friendlyError(err);
    }
  }

  // Con hieu luc va dung la ma cua may nay thi giu nguyen, tranh doi ma moi
  // moi lan trang tu lam moi.
  let code = pairing.normalize(req.query.c);
  if (req.query.new === '1' || !pairing.isValid(code, req.device)) {
    code = pairing.issue(req.device);
  }

  sendPage(
    res,
    render.loginPage({
      code,
      linkUrl: `${publicBase(req)}/link?c=${code}`,
      // Duong ve khi trinh duyet quen ma thiet bi: mo dia chi nay la may chu
      // nhan ra may cu ngay, khong phai nop lai cookie tu may tinh lan nua.
      rememberUrl: `${publicBase(req)}/remember?d=${req.device}`,
      logoutUrl: `/logout?t=${cookies.actionToken(req.device)}`,
      status,
      minutes: pairing.remainingMinutes(code),
      notice,
      error,
      prefs: req.prefs,
    })
  );
});

app.get('/qr', async (req, res) => {
  const code = pairing.normalize(req.query.c);
  // Trang nay cung tra loi duoc cau "ma nay co that khong", nen lan hoi truot
  // o day cung phai tinh vao so lan do ma.
  if (!pairing.isValid(code)) {
    pairing.noteMiss(clientIp(req));
    res.status(404).end();
    return;
  }
  try {
    const png = await QRCode.toBuffer(`${publicBase(req)}/link?c=${code}`, {
      type: 'png',
      width: 200,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    });
    res.set('Content-Type', 'image/png').set('Cache-Control', 'no-cache').send(png);
  } catch {
    res.status(500).end();
  }
});

app.get('/link', (req, res) => {
  const exposed = linkIsExposed(req);
  sendPage(
    res,
    render.linkPage({
      code: pairing.format(pairing.normalize(req.query.c) || ''),
      exposed,
      refused: exposed && config.REQUIRE_SECURE_LINK,
    }),
    exposed && config.REQUIRE_SECURE_LINK ? 403 : 200
  );
});

app.post('/link', async (req, res) => {
  const code = pairing.normalize(req.body.code);
  const ip = clientIp(req);
  const exposed = linkIsExposed(req);
  const sendForm = (error, status = 400) =>
    sendPage(res, render.linkPage({ code: req.body.code, error, exposed }), status);

  if (exposed && config.REQUIRE_SECURE_LINK) {
    sendPage(res, render.linkPage({ exposed, refused: true }), 403);
    return;
  }

  // Ma dung thi luon di tiep, ke ca khi bo dem dang bao "sai nhieu qua": sau
  // reverse proxy moi nguoi chung mot dia chi IP, khoa cung tay la mot nguoi
  // do bua co the chan het ca nhung nguoi dang nhap that.
  const deviceId = pairing.deviceOf(code);
  if (!deviceId) {
    pairing.noteMiss(ip);
    // Cham lai mot nhip cho viec do ma khong con re.
    await new Promise((done) => setTimeout(done, 500));
    if (pairing.blocked(ip)) {
      sendForm('Nhập sai quá nhiều lần. Chờ ít phút rồi thử lại.', 429);
      return;
    }
    sendForm('Mã không đúng hoặc đã hết hạn. Bấm "Lấy mã mới" trên máy Nokia rồi thử lại.');
    return;
  }

  try {
    cookies.save(deviceId, req.body.cookies);
  } catch (err) {
    sendForm(err.message);
    return;
  }

  ytdlp.forgetAuth(cookies.authFor(deviceId).key);
  pairing.consume(code);
  sendPage(
    res,
    render.linkPage({
      done: true,
      // Cookie chi co phan '3P': phat duoc video nhung khong co goi y rieng.
      // Noi ngay bay gio, luc nguoi dung con dang ngoi truoc may tinh.
      partial: cookies.hasPageSession(deviceId) === false,
    })
  );
});

/**
 * Duong ve cua mot may bi trinh duyet xoa cookie. Trang nay KHONG chuyen huong
 * di dau: dia chi phai con nguyen tren thanh dia chi de nguoi dung luu ngay no
 * vao Bookmark — chuyen ve trang chinh thi ho luu duoc mot dia chi vo dung.
 */
app.get('/remember', (req, res) => {
  const id = String(req.query.d || '');
  if (!cookies.claim(res, id)) {
    sendPage(
      res,
      render.errorPage({
        title: 'Không nhận ra máy nào',
        message:
          'Địa chỉ ghi nhớ này không còn đúng — có thể máy đó đã xoá đăng nhập,' +
          ' hoặc cookie đã quá lâu không dùng nên máy chủ dọn đi rồi. Đăng nhập lại là có địa chỉ mới.',
        back: '/login',
        prefs: req.prefs,
      }),
      404
    );
    return;
  }
  sendPage(res, render.rememberPage({ prefs: req.prefs }));
});

app.get('/logout', (req, res) => {
  // Chi may that su dang cam cookie 'did' moi xoa duoc cookie cua chinh no, va
  // phai kem ma chong CSRF — khong thi mot lien ket la tren trang web bat ky
  // cung dang xuat ho nguoi khac.
  const own = cookies.read(req);
  if (!own || !cookies.checkAction(own, req.query.t)) {
    res.redirect(302, '/login');
    return;
  }
  const auth = cookies.authFor(own);
  cookies.clear(own);
  if (auth.mode === 'device') ytdlp.forgetAuth(auth.key);
  res.redirect(302, '/login');
});

// ---------- cai dat / gioi thieu ----------

app.get('/settings', (req, res) => {
  const submitted = Object.prototype.hasOwnProperty.call(req.query, 'pageSize');

  if (submitted) {
    const pageSize = Number(req.query.pageSize) || DEFAULT_PREFS.pageSize;
    const thumbs = req.query.thumbs === '1';
    const textSize = render.TEXT_SIZES[req.query.textSize]
      ? String(req.query.textSize)
      : DEFAULT_PREFS.textSize;
    // Cung ly do nhu ma thiet bi: may Nokia chi doc 'Expires', khong doc 'Max-Age'.
    const options = cookies.keepFor();
    // append chu khong phai set: khong duoc de len cookie ma thiet bi.
    res.append('Set-Cookie', `thumbs=${thumbs ? 1 : 0}; ${options}`);
    res.append('Set-Cookie', `pageSize=${pageSize}; ${options}`);
    res.append('Set-Cookie', `textSize=${textSize}; ${options}`);
    sendPage(res, render.settingsPage({ thumbs, pageSize, textSize }));
    return;
  }

  sendPage(res, render.settingsPage(req.prefs));
});

app.get('/about', (req, res) => {
  sendPage(
    res,
    render.aboutPage({
      ffmpegOk: media.isAvailable(),
      cookieStatus: cookies.status(req.device),
      deviceCount: cookies.count(),
      address: `${req.headers.host || 'may-chu'}`,
      build: config.BUILD_VERSION,
      buildDate: config.BUILD_DATE,
      ytdlpVersion: ytdlp.version(),
      prefs: req.prefs,
    })
  );
});

app.use((req, res) => {
  sendPage(
    res,
    render.errorPage({
      title: 'Không có trang này',
      message: `Đường dẫn ${req.path} không tồn tại.`,
      back: '/',
      prefs: req.prefs,
    }),
    404
  );
});

// ---------- khoi dong ----------

function localAddresses() {
  const result = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) result.push(net.address);
    }
  }
  return result;
}

setInterval(() => {
  media.cleanup();
  cookies.cleanup();
}, 30 * 60 * 1000).unref();

app.listen(config.PORT, config.HOST, () => {
  console.log('YouTube cho Symbian — may chu da chay');
  console.log(
    `  ban    : ${config.BUILD_VERSION}${config.BUILD_DATE ? ` (${config.BUILD_DATE})` : ''}`
  );
  console.log(`  yt-dlp : ${ytdlp.version()}`);
  console.log(`  ffmpeg : ${media.isAvailable() ? media.FFMPEG : 'chua co'}`);
  console.log(
    `  cookie : ${cookies.count()} may co cookie rieng` +
      `, cookie chung ${config.SHARED_COOKIES ? 'bat' : 'tat'}`
  );
  if (cookies.sharedInUse()) {
    console.log(
      '  !! Cookie chung dang bat: may nao chua dang nhap cung xem bang tai khoan\n' +
        '     cua chu may. Mo cong ra Internet thi dat YT_SHARED_COOKIES=0.'
    );
  }
  console.log('  Nhap dia chi nay tren dien thoai:');
  for (const address of localAddresses()) {
    console.log(`    http://${address}:${config.PORT}/`);
  }
});
