'use strict';

const express = require('express');
const os = require('os');
const path = require('path');
const QRCode = require('qrcode');
const { Readable } = require('stream');

const config = require('./lib/config');
const cookies = require('./lib/cookies');
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

// Moi trang deu can tuy chon hien thi (co chu, anh thu nho) de dung layout,
// va can biet may nao dang goi de lay dung cookie YouTube cua nguoi do.
app.use((req, res, next) => {
  req.prefs = readPrefs(req);
  // Trinh phat cua may Nokia mo lien ket .mp4 ben ngoai trinh duyet nen khong
  // gui cookie theo — luc do nhan ra may bang khoa phat dinh trong dia chi.
  req.device =
    cookies.read(req) || cookies.byStreamKey(req.query.k) || cookies.issue(res);
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

  let info = null;
  let error = null;
  if (infoResult.status === 'fulfilled') {
    const raw = infoResult.value;
    info = {
      ...raw,
      direct: ytdlp.pickProgressive(raw.formats, BELLE_MAX_HEIGHT),
      audioDirect: ytdlp.isBelleAudio(ytdlp.pickAudioOnly(raw.formats)),
    };
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
      streamKey: req.streamKey,
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
  // mqdefault la ban 320x180 dung khung 16:9, vua khop voi mot cot rong het
  // man hinh. default.jpg chi 120x90 va vien den hai ben nen de danh du phong.
  const names = ['mqdefault', 'default'];
  for (const name of names) {
    try {
      const upstream = await fetch(`https://i.ytimg.com/vi/${id}/${name}.jpg`, {
        headers: { 'User-Agent': config.DESKTOP_UA },
      });
      if (!upstream.ok) continue;
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res
        .set('Content-Type', 'image/jpeg')
        .set('Cache-Control', 'public, max-age=86400')
        .send(buffer);
      return;
    } catch {
      // thu ten tiep theo
    }
  }
  res.status(502).end();
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

// Khong co :formatId thi tu chon luong hop voi Belle. Duong dan on dinh nhu vay
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
  res
    .status(exposed && config.REQUIRE_SECURE_LINK ? 403 : 200)
    .set('Content-Type', 'text/html; charset=utf-8')
    .send(
      render.linkPage({
        code: pairing.format(pairing.normalize(req.query.c) || ''),
        exposed,
        refused: exposed && config.REQUIRE_SECURE_LINK,
      })
    );
});

app.post('/link', async (req, res) => {
  const code = pairing.normalize(req.body.code);
  const ip = clientIp(req);
  const exposed = linkIsExposed(req);
  const sendForm = (error, status = 400) =>
    res
      .status(status)
      .set('Content-Type', 'text/html; charset=utf-8')
      .send(render.linkPage({ code: req.body.code, error, exposed }));

  if (exposed && config.REQUIRE_SECURE_LINK) {
    res
      .status(403)
      .set('Content-Type', 'text/html; charset=utf-8')
      .send(render.linkPage({ exposed, refused: true }));
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
  res
    .status(200)
    .set('Content-Type', 'text/html; charset=utf-8')
    .send(
      render.linkPage({
        done: true,
        // Cookie chi co phan '3P': phat duoc video nhung khong co goi y rieng.
        // Noi ngay bay gio, luc nguoi dung con dang ngoi truoc may tinh.
        partial: cookies.hasPageSession(deviceId) === false,
      })
    );
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
    const options = 'Path=/; Max-Age=31536000';
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
