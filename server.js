'use strict';

const express = require('express');
const os = require('os');
const path = require('path');
const QRCode = require('qrcode');
const { Readable } = require('stream');

const config = require('./lib/config');
const innertube = require('./lib/innertube');
const pairing = require('./lib/pairing');
const ytdlp = require('./lib/ytdlp');
const media = require('./lib/media');
const render = require('./lib/render');
const { parseVideoId, isVideoId } = require('./lib/util');

const app = express();
app.disable('x-powered-by');
app.disable('etag');

// ---------- tuy chon nguoi dung (luu bang cookie) ----------

const DEFAULT_PREFS = { thumbs: true, pageSize: config.PAGE_SIZE };

function readPrefs(req) {
  const prefs = { ...DEFAULT_PREFS };
  const header = req.headers.cookie;
  if (!header) return prefs;
  for (const part of header.split(';')) {
    const [rawKey, ...rest] = part.split('=');
    const key = rawKey.trim();
    const value = decodeURIComponent(rest.join('=').trim());
    if (key === 'thumbs') prefs.thumbs = value === '1';
    if (key === 'pageSize') {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 4 && n <= 40) prefs.pageSize = n;
    }
  }
  return prefs;
}

function sendPage(res, html, status = 200) {
  res
    .status(status)
    .set('Content-Type', 'text/html; charset=utf-8')
    .set('Cache-Control', 'no-cache')
    .send(html);
}

/** Doi loi ky thuat sang cau tieng Viet de hieu tren man hinh nho. */
function friendlyError(err) {
  const message = String(err?.message || err);
  if (/Sign in to confirm|not a bot|LOGIN_REQUIRED|cookies/i.test(message)) {
    return 'YouTube đang đòi đăng nhập từ máy chủ này. Vào mục Đăng nhập để nối lại tài khoản (cookie cũ có thể đã hết hạn).';
  }
  if (/Video unavailable|Private video|removed/i.test(message)) {
    return 'Video này không xem được (riêng tư, bị gỡ hoặc chặn theo khu vực).';
  }
  if (/KHONG_CO_DINH_DANG|Requested format is not available|No video formats/i.test(message)) {
    return 'YouTube không trả về luồng nào tải thẳng được cho video này. Thử video khác; nếu video nào cũng lỗi thì yt-dlp đã cũ, hãy khởi động lại container để nó tự cập nhật.';
  }
  if (/members-only|join this channel|Premieres in|This live event/i.test(message)) {
    return 'Video này chỉ dành cho thành viên kênh, hoặc là buổi phát trực tiếp chưa bắt đầu.';
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

app.use(
  express.static(path.join(config.ROOT, 'public'), {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.css')) res.set('Content-Type', 'text/css; charset=utf-8');
    },
  })
);

app.use(express.urlencoded({ extended: false, limit: '2mb' }));

// ---------- trang chinh ----------

app.get('/', (req, res) => {
  sendPage(
    res,
    render.homePage({
      warning: ytdlp.hasCookies()
        ? null
        : 'Chưa cấu hình cookie YouTube — tìm kiếm vẫn chạy nhưng có thể không phát được video. Xem mục Giới thiệu.',
    })
  );
});

// ---------- tim kiem ----------

app.get('/search', async (req, res) => {
  const prefs = readPrefs(req);
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

app.get('/watch', async (req, res) => {
  const prefs = readPrefs(req);
  const videoId = parseVideoId(req.query.v);
  if (!videoId) {
    sendPage(
      res,
      render.errorPage({
        title: 'Sai địa chỉ',
        message: 'Thiếu mã video hợp lệ.',
        back: '/',
      }),
      400
    );
    return;
  }

  const [infoResult, relatedResult] = await Promise.allSettled([
    ytdlp.getInfo(videoId),
    innertube.related(videoId),
  ]);

  const related =
    relatedResult.status === 'fulfilled'
      ? relatedResult.value.videos.slice(0, prefs.pageSize)
      : [];

  let info = null;
  let error = null;
  if (infoResult.status === 'fulfilled') {
    const raw = infoResult.value;
    info = { ...raw, direct: ytdlp.pickProgressive(raw.formats, 360) };
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
      related,
      prefs,
      profiles: media.PROFILES,
      ffmpegOk: media.isAvailable(),
      error,
    })
  );
});

// ---------- anh thu nho ----------

app.get('/thumb/:id', async (req, res) => {
  const { id } = req.params;
  if (!isVideoId(id)) {
    res.status(400).end();
    return;
  }
  try {
    const upstream = await fetch(`https://i.ytimg.com/vi/${id}/default.jpg`, {
      headers: { 'User-Agent': config.DESKTOP_UA },
    });
    if (!upstream.ok) {
      res.status(502).end();
      return;
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res
      .set('Content-Type', 'image/jpeg')
      .set('Cache-Control', 'public, max-age=86400')
      .send(buffer);
  } catch {
    res.status(502).end();
  }
});

// ---------- phat truc tiep (proxy MP4 co san) ----------

app.all('/stream/:id/:formatId', async (req, res) => {
  const { id, formatId } = req.params;
  if (!isVideoId(id)) {
    res.status(400).end();
    return;
  }

  try {
    const info = await ytdlp.getInfo(id);
    const format = ytdlp.findFormat(info, formatId);
    if (!format) {
      sendPage(
        res,
        render.errorPage({
          title: 'Không tìm thấy định dạng',
          message: 'Liên kết đã cũ, hãy mở lại trang video.',
          back: `/watch?v=${id}`,
        }),
        404
      );
      return;
    }

    // Dien thoai gui Range de tua; chuyen nguyen ven len YouTube va tra ve.
    const headers = { 'User-Agent': config.DESKTOP_UA };
    if (req.headers.range) headers.Range = req.headers.range;

    const upstream = await fetch(format.url, { headers });
    res.status(upstream.status === 206 ? 206 : upstream.status);
    res.set('Content-Type', 'video/mp4');
    res.set('Accept-Ranges', 'bytes');
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
  } catch (err) {
    sendPage(
      res,
      render.errorPage({
        title: 'Không phát được',
        message: friendlyError(err),
        back: `/watch?v=${id}`,
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
      }),
      503
    );
    return;
  }

  try {
    const existing = media.getJob(videoId, profileId);
    const info = await ytdlp.getInfo(videoId);

    let job = existing;
    if (!job || job.status === 'error') {
      const profile = media.PROFILES[profileId];
      const sources = [];

      if (profile.audioOnly) {
        const audio = ytdlp.pickAudioOnly(info.formats) ||
          ytdlp.pickProgressive(info.formats, 720);
        if (!audio) throw new Error('Không tìm thấy luồng tiếng phù hợp.');
        sources.push(audio.url);
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

      job = media.startJob({
        videoId,
        profileId,
        sources,
        duration: info.duration,
      });
    }

    sendPage(
      res,
      render.convertPage({
        video: { id: videoId, title: info.title },
        job: { ...job, position: media.queuePosition(job) },
        profileId,
        profiles: media.PROFILES,
      })
    );
  } catch (err) {
    sendPage(
      res,
      render.errorPage({
        title: 'Không chuẩn bị được video',
        message: friendlyError(err),
        back: `/watch?v=${videoId}`,
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
  res.set(
    'Content-Type',
    media.PROFILES[profileId].ext === 'm4a' ? 'audio/mp4' : 'video/mp4'
  );
  res.sendFile(job.file, { acceptRanges: true, cacheControl: false });
});

// ---------- dang nhap bang ma / QR ----------

app.get('/login', async (req, res) => {
  const status = ytdlp.cookieStatus();

  let notice = null;
  let error = null;
  if (status.ready && req.query.check === '1') {
    try {
      await ytdlp.verify();
      notice = 'Cookie còn tốt — YouTube nhận. Vào xem video được rồi.';
    } catch (err) {
      error = friendlyError(err);
    }
  }

  // Con hieu luc thi giu nguyen ma dang hien, tranh doi ma moi moi lan lam moi.
  let code = pairing.normalize(req.query.c);
  if (req.query.new === '1' || !pairing.isValid(code)) code = pairing.issue();

  const host = req.headers.host || `localhost:${config.PORT}`;
  sendPage(
    res,
    render.loginPage({
      code,
      linkUrl: `http://${host}/link?c=${code}`,
      status,
      minutes: pairing.remainingMinutes(code),
      notice,
      error,
    })
  );
});

app.get('/qr', async (req, res) => {
  const code = pairing.normalize(req.query.c);
  if (!pairing.isValid(code)) {
    res.status(404).end();
    return;
  }
  const host = req.headers.host || `localhost:${config.PORT}`;
  try {
    const png = await QRCode.toBuffer(`http://${host}/link?c=${code}`, {
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
  res
    .status(200)
    .set('Content-Type', 'text/html; charset=utf-8')
    .send(render.linkPage({ code: pairing.format(pairing.normalize(req.query.c) || '') }));
});

app.post('/link', (req, res) => {
  const code = pairing.normalize(req.body.code);
  const sendForm = (error, status = 400) =>
    res
      .status(status)
      .set('Content-Type', 'text/html; charset=utf-8')
      .send(render.linkPage({ code: req.body.code, error }));

  if (!pairing.isValid(code)) {
    sendForm('Mã không đúng hoặc đã hết hạn. Bấm "Lấy mã mới" trên máy Nokia rồi thử lại.');
    return;
  }

  try {
    ytdlp.saveCookies(req.body.cookies);
  } catch (err) {
    sendForm(err.message);
    return;
  }

  pairing.consume(code);
  res
    .status(200)
    .set('Content-Type', 'text/html; charset=utf-8')
    .send(render.linkPage({ done: true }));
});

app.get('/logout', (req, res) => {
  ytdlp.clearCookies();
  res.redirect(302, '/login');
});

// ---------- cai dat / gioi thieu ----------

app.get('/settings', (req, res) => {
  const prefs = readPrefs(req);
  const submitted = Object.prototype.hasOwnProperty.call(req.query, 'pageSize');

  if (submitted) {
    const pageSize = Number(req.query.pageSize) || DEFAULT_PREFS.pageSize;
    const thumbs = req.query.thumbs === '1';
    const options = 'Path=/; Max-Age=31536000';
    res.set('Set-Cookie', [
      `thumbs=${thumbs ? 1 : 0}; ${options}`,
      `pageSize=${pageSize}; ${options}`,
    ]);
    sendPage(res, render.settingsPage({ thumbs, pageSize }));
    return;
  }

  sendPage(res, render.settingsPage(prefs));
});

app.get('/about', (req, res) => {
  sendPage(
    res,
    render.aboutPage({
      ffmpegOk: media.isAvailable(),
      cookiesOk: ytdlp.hasCookies(),
      address: `${req.headers.host || 'may-chu'}`,
      build: config.BUILD_VERSION,
      buildDate: config.BUILD_DATE,
      ytdlpVersion: ytdlp.version(),
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

setInterval(() => media.cleanup(), 30 * 60 * 1000).unref();

app.listen(config.PORT, config.HOST, () => {
  console.log('YouTube cho Symbian — may chu da chay');
  console.log(
    `  ban    : ${config.BUILD_VERSION}${config.BUILD_DATE ? ` (${config.BUILD_DATE})` : ''}`
  );
  console.log(`  yt-dlp : ${ytdlp.version()}`);
  console.log(`  ffmpeg : ${media.isAvailable() ? media.FFMPEG : 'chua co'}`);
  console.log(`  cookie : ${ytdlp.hasCookies() ? 'da cau hinh' : 'chua co'}`);
  console.log('  Nhap dia chi nay tren dien thoai:');
  for (const address of localAddresses()) {
    console.log(`    http://${address}:${config.PORT}/`);
  }
});
