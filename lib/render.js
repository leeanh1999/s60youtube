'use strict';

const {
  escapeHtml,
  formatDuration,
  formatCount,
  formatBytes,
  truncate,
} = require('./util');
const { format } = require('./pairing');
const { icon } = require('./icons');
const { ASSET_TAG } = require('./config');

/** Co chu chon duoc trong muc Cai dat; gia tri thanh ten lop tren the <body>. */
const TEXT_SIZES = { m: 'Vừa', l: 'Lớn', xl: 'Rất lớn' };
const DEFAULT_TEXT_SIZE = 'l';

/**
 * Symbian^3 tro len (Nokia Browser 7.x va 8.x) — ban WebKit hieu HTML5, CSS3 co
 * ban va JavaScript. Nen trang dung HTML5 that, khong con phai gioi han o XHTML
 * 1.0 nhu doi Browser 7. Rieng SVG thi ban WebKit nay khong co bo ve, nen bieu
 * tuong la anh PNG do may chu tu to (xem lib/icons.js) chu khong dat <svg>
 * thang vao trang.
 *
 * Ba nguyen tac van giu:
 *  - Moi thao tac deu chay duoc khi khong co JavaScript (link va form GET),
 *    JavaScript chi them phan dieu huong bang phim.
 *  - Chi mot cot the tu tren xuong. Rieng trong tung the thi chia doi — anh ben
 *    trai, chu ben phai — cho do cuon.
 *  - Trang khong tu doan may nao: chi khai bao be ngang that (width=device-width)
 *    roi de s60.css tu chon khuon. E6 nam ngang duoc 640 diem, N8 xem doc chi
 *    360 diem, hai khuon do nam trong cung mot file CSS.
 *
 * Trong thanh tren co mot <table> that: o cua bang tu can giua theo chieu doc
 * (vertical-align mac dinh la middle), khong phu thuoc flexbox hay line-height.
 * Ten trang nam o ben trai, kinh lup o ben phai, hai ben luon ngang giua thanh
 * du nguoi dung doi co chu hay may co man nao. Vo ngoai van la <div> vi chinh no
 * la cai duoc dan vao khung nhin — dan mot <div> thi ban WebKit nao cung lam
 * dung, dan mot <table> thi khong chac.
 *
 * O tim kiem thu con dung mot bieu tuong kinh lup: bam vao do la khung tim kiem
 * bat ra. Khong co JavaScript thi no la lien ket thuong sang /search — trang do
 * co o nhap that.
 *
 * Moi the video la DUY NHAT mot the <a>, khong long them lien ket nao khac.
 * Nho vay bam phim xuong mot cai la nhay dung mot video, khong mac ket giua
 * anh va tieu de cua cung mot muc.
 */
function layout({ title, body, back, prefs, refreshSeconds, refreshUrl, active, query }) {
  const refresh = refreshSeconds
    ? `<meta http-equiv="refresh" content="${refreshSeconds}${
        refreshUrl ? `; url=${escapeHtml(refreshUrl)}` : ''
      }" />\n`
    : '';
  const textSize = TEXT_SIZES[prefs?.textSize] ? prefs.textSize : DEFAULT_TEXT_SIZE;
  // O dang mo thi ca hinh lan chu deu do, ba o con lai mau xam nhu chu cua no.
  const tab = (href, name, label, id) =>
    `<td><a${active === id ? ' class="on"' : ''} href="${href}">${icon(
      name,
      active === id ? 'red' : 'gray'
    )}<span>${escapeHtml(label)}</span></a></td>`;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="HandheldFriendly" content="true" />
<meta name="theme-color" content="#c00000" />
${refresh}<title>${escapeHtml(title)}</title>
<link rel="stylesheet" type="text/css" href="/s60.css?v=${ASSET_TAG}" />
</head>
<body class="t-${textSize}">
<div class="bar">
<table><tr>
<td class="bl"><a class="brand" href="/" accesskey="0">${icon(
    'logo',
    'white'
  )}<span>YouTube S60</span></a></td>
<td class="br">${
    back
      ? `<a class="back" href="${escapeHtml(back)}">${icon(
          'back',
          'white'
        )}<span>Quay lại</span></a>`
      : ''
  }<a class="find" href="/search" accesskey="*" title="Tìm">${icon(
    'search',
    'white',
    'Tìm'
  )}</a></td>
</tr></table>
</div>
<div id="pop">
${searchForm(query)}
</div>
<div id="main">
${body}
</div>
<table class="nav"><tr>
${tab('/', 'home', 'Trang chính', 'home')}
${tab('/login', 'user', 'Đăng nhập', 'login')}
${tab('/settings', 'gear', 'Cài đặt', 'settings')}
${tab('/about', 'info', 'Giới thiệu', 'about')}
</tr></table>
<script type="text/javascript" src="/s60.js?v=${ASSET_TAG}"></script>
</body>
</html>`;
}

/** Tieu de muc: mot vach mau, mot bieu tuong, mot dong chu. */
function section(label, name) {
  return `<h2>${icon(name, 'red')}<span>${escapeHtml(label)}</span></h2>`;
}

/**
 * Phim `*` nam tren bieu tuong kinh lup o thanh tren, khong dat vao o nhap nua:
 * moi trang deu co bieu tuong do, con o nhap thi chi trang /search moi co.
 */
function searchForm(query = '') {
  return `<form class="search" action="/search" method="get">
<table class="sform"><tr>
<td class="qi"><input type="text" name="q" value="${escapeHtml(query)}"
 placeholder="Tìm video hoặc dán link" /></td>
<td class="qb"><button type="submit">Tìm kiếm</button></td>
</tr></table>
</form>`;
}

/**
 * Anh chiem chung mot phan tu be ngang, phan chu con lai vao khoang hai dong
 * la vua mot the cao bang anh. Tieu de dai hon thi the cao gap doi anh, mot
 * man hinh con nhin duoc it video. Chu cang to thi cang phai cat som.
 */
const TITLE_CHARS = {
  m: { thumbs: 88, wide: 130 },
  l: { thumbs: 68, wide: 104 },
  xl: { thumbs: 44, wide: 78 },
};

/**
 * Mot the video = mot lien ket. Ben trong chia hai: anh 16:9 ben trai, phan
 * chu ben phai. Toan bo la the <a> nen may bao no la MOT diem dung khi dieu
 * huong bang phim — bam xuong mot cai la sang dung mot video.
 */
function videoRow(video, index, prefs) {
  const key = index < 9 ? `${index + 1}` : null;
  const href = `/watch?v=${video.id}`;
  const duration = video.durationText || formatDuration(video.duration);

  const badge = video.live
    ? '<span class="badge live">TRỰC TIẾP</span>'
    : duration
      ? `<span class="badge">${escapeHtml(duration)}</span>`
      : '';

  const thumb = prefs.thumbs
    ? `<span class="th"><img src="/thumb/${video.id}" width="320" height="180" alt="" />` +
      `<span class="pv"></span>${badge}</span>`
    : '';

  // Tat anh thu nho thi thoi luong va nhan TRUC TIEP khong con cho dung, doi
  // xuong dong thong tin cho khoi mat.
  const meta = [
    prefs.thumbs ? '' : duration,
    video.views,
    video.published,
  ]
    .filter(Boolean)
    .join(' · ');
  const live = !prefs.thumbs && video.live ? ' · <b class="live-t">TRỰC TIẾP</b>' : '';

  const chars = TITLE_CHARS[prefs.textSize] || TITLE_CHARS[DEFAULT_TEXT_SIZE];
  const limit = prefs.thumbs ? chars.thumbs : chars.wide;

  return `<li><a class="card" href="${href}"${key ? ` accesskey="${key}"` : ''}>
${thumb}<span class="tx">
<span class="ti">${key ? `<span class="k">${key}</span> ` : ''}${escapeHtml(
    truncate(video.title, limit)
  )}</span>
${video.author ? `<span class="ch">${escapeHtml(truncate(video.author, 40))}</span>` : ''}
${meta || live ? `<span class="mt">${escapeHtml(meta)}${live}</span>` : ''}
</span>
</a></li>`;
}

function videoList(videos, prefs) {
  if (!videos.length) return '<p class="empty">Không có video nào.</p>';
  const rows = videos.map((video, i) => videoRow(video, i, prefs)).join('\n');
  return `<ul class="feed${prefs.thumbs ? '' : ' nothumb'}">\n${rows}\n</ul>`;
}

/** Chu de goi y — bam phim so tren dien thoai la vao thang. */
const TOPICS = [
  { q: 'Nhạc trẻ', icon: 'music' },
  { q: 'Nhạc vàng', icon: 'music' },
  { q: 'Hài kịch', icon: 'star' },
  { q: 'Bóng đá', icon: 'ball' },
  { q: 'Tin tức', icon: 'tv' },
  { q: 'Phim ngắn', icon: 'film' },
  { q: 'Nấu ăn', icon: 'food' },
  { q: 'Thiếu nhi', icon: 'kid' },
  { q: 'Nhạc không lời', icon: 'music' },
];

function homePage({ warning, note, videos, prefs }) {
  const feed = videos && videos.length ? videos : null;

  // Feed co roi thi so 1-9 danh cho video; chu de tut xuong duoi, khong mang so
  // nua — hai cho cung nhan mot phim thi bam so khong biet vao dau.
  const topics = TOPICS.map((topic, i) => {
    const key = feed ? null : i + 1;
    return `<li><a href="/search?q=${encodeURIComponent(topic.q)}"${
      key ? ` accesskey="${key}"` : ''
    }>${icon(topic.icon, 'red')}${
      key ? `<span class="k">${key}</span>` : ''
    }<span class="lb">${escapeHtml(topic.q)}</span></a></li>`;
  }).join('\n');

  // Khong con o tim kiem o day: no da thanh bieu tuong o thanh tren, de danh ca
  // be ngang cho video.
  const body = `${
    warning
      ? `<p class="warn">${icon('warn', 'amber')}<span>${escapeHtml(
          warning
        )} <a href="/login">Đăng nhập ngay ›</a></span></p>`
      : ''
  }
${feed ? `${section('Gợi ý cho bạn', 'play')}\n${videoList(feed, prefs)}` : ''}
${note ? `<p class="warn">${icon('warn', 'amber')}<span>${escapeHtml(note)}</span></p>` : ''}
${section('Chủ đề nhanh', 'star')}
<ul class="opts icons">
${topics}
</ul>
<p class="hint">Mẹo: bấm phím <b>*</b> hoặc kính lúp ở góc phải để tìm; dán thẳng
link YouTube vào đó là mở đúng video. Phím lên/xuống nhảy từng khối video, phím
trái/phải về đầu hay xuống cuối danh sách, phím 1–9 chọn nhanh.</p>`;
  return layout({ title: 'YouTube cho Symbian', body, prefs, active: 'home' });
}

function searchPage({ query, videos, prefs, nextPage, warning }) {
  const next = nextPage
    ? `<p class="more"><a href="/search?q=${encodeURIComponent(
        query
      )}&amp;p=${nextPage}" accesskey="#">${icon(
        'next',
        'blue'
      )}<span>Trang sau</span></a></p>`
    : '';
  // Da co ket qua thi trong trang khong con o nhap nao: bam kinh lup o thanh tren
  // la khung tim bat ra, san tu khoa vua tim trong do de sua tiep. Chua co tu
  // khoa thi day la trang de go — va la duong tim kiem cho may tat JavaScript,
  // nen o nhap phai nam ngay trong trang.
  const body = `${
    warning
      ? `<p class="warn">${icon('warn', 'amber')}<span>${escapeHtml(warning)}</span></p>`
      : ''
  }
${
  query
    ? `${section(`Kết quả: ${query}`, 'search')}\n${videoList(videos, prefs)}`
    : `${searchForm()}\n<p class="hint">Gõ từ khoá rồi bấm kính lúp. Dán link YouTube vào đây là mở đúng video đó.</p>`
}
${next}`;
  return layout({ title: query ? `Tìm: ${query}` : 'Tìm video', body, prefs, query });
}

/**
 * Nokia Browser tren Belle doc duoc the <video> HTML5 voi H.264/MP4, va no keo
 * file theo tung doan bang header Range — tuc la xem online, khong luu gi vao
 * may. Mot lien ket .mp4 tran thi nguoc lai: Symbian tai het file ve roi moi
 * mo, nen the <video> phai la duong chinh.
 *
 * preload="none" de may chua dong gi cho toi khi bam nut phat; poster de khung
 * hinh khong den si khi chua phat.
 */
function playerBox(src, label, poster, mse) {
  // Dia chi hai luong roi de public/hd.js tu ghep lay trong may (tua duoc).
  // Dat trong data-* chu khong phai mot the <script> rieng: may Symbian doc
  // qua the <video> nay va lo di het cac thuoc tinh no khong biet.
  const streams = mse
    ? ` id="hdv" data-h="${mse.height}" data-len="${mse.duration || 0}"` +
      ` data-v="${escapeHtml(mse.video)}" data-vt="${escapeHtml(mse.videoType)}"` +
      ` data-a="${escapeHtml(mse.audio)}" data-at="${escapeHtml(mse.audioType)}"`
    : '';
  // Vua dat src vua co <source>: ban WebKit cua Nokia chi doc mot trong hai
  // tuy doi may, de ca hai thi doi nao cung phat duoc.
  return `<div class="player">
<video${streams} src="${src}" width="320" height="240" controls="controls" preload="none"${
    poster ? ` poster="${poster}"` : ''
  }>
<source src="${src}" type="video/mp4" />
<a class="go" href="${src}">${icon('play', 'white')}<span>${escapeHtml(label)}</span></a>
</video>
</div>`;
}

function optionList(items) {
  const rows = items.map((item, i) => {
    if (!item.href) return `<li class="m">${escapeHtml(item.label)}</li>`;
    const key = i < 9 ? ` accesskey="${i + 1}"` : '';
    // Ghi chu nam trong chinh the <a>, giong the video: chon muc nao thi ca dong
    // ghi chu sang theo (de ngoai thi canh khung dang chon cat ngang giua dong
    // chu), va phim Xuong keo ra ca phan ghi chu chu khong bo no lai sau chan
    // trang dan — may chi cuon vua du cho thay diem dung, ma diem dung la the <a>.
    const note = item.note ? `<span class="m">${escapeHtml(item.note)}</span>` : '';
    // O so phim tat dat truoc nhan chu: no la khoi noi ben phai, phai dung
    // truoc thi dong chu moi biet duong ne ra.
    return `<li><a href="${item.href}"${key}>${item.icon ? icon(item.icon, 'red') : ''}${
      i < 9 ? `<span class="k">${i + 1}</span>` : ''
    }<span class="lb">${escapeHtml(item.label)}</span>${note}</a></li>`;
  });
  return `<ul class="opts icons">${rows.join('\n')}</ul>`;
}

/**
 * Hang chon do phan giai: moi muc mot o bam duoc, muc dang xem thi to nen do.
 * Bam mot muc la quay lai chinh trang video voi ?q=<do phan giai>, khung phat
 * doi sang muc do — khong can JavaScript, va khong dinh gi vao Cai dat: chon
 * cho video nay thoi.
 *
 * Ca hang nam tren mot dong nen phim trai/phai di duoc trong do (xem s60.js).
 */
function qualityRow(choices, chosen) {
  const cells = choices.map((choice) => {
    const label = `${choice.height}p`;
    if (choice.height === chosen?.height) return `<b class="on">${label}</b>`;
    return `<a href="${choice.href}">${label}</a>`;
  });
  return `<p class="qual"><span class="lb">Độ phân giải</span>${cells.join('')}</p>`;
}

function playOptions({ video, info, choices, chosen, mse, profiles, ffmpegOk, streamKey, legacy }) {
  const parts = [];
  const items = [];

  if (chosen) {
    parts.push(
      playerBox(chosen.src, 'Mở bằng trình phát của máy', `/thumb/${video.id}`, mse)
    );
    if (choices.length > 1) parts.push(qualityRow(choices, chosen));
    // Cau chu la cho duong lui — duong may chu ghep san, khong tua duoc. May nao
    // ghep duoc ngay trong trinh duyet thi chinh hd.js viet de len cau nay.
    parts.push(
      chosen.kind === 'ghep'
        ? `<p class="hint" id="hdnote">Xem thẳng ${chosen.height}p — máy chủ ghép hình với tiếng ngay lúc
phát nên bấm là chạy, nhưng <b>không tua được</b>. Muốn tua thì chọn mức thấp hơn,
hoặc tạo bản ở dưới.</p>`
        : `<p class="hint">Xem online ${chosen.height}p — máy chỉ tải phần đang xem, không lưu vào bộ nhớ.</p>`
    );
    items.push({
      href: chosen.src,
      icon: 'screen',
      label: 'Mở bằng trình phát của máy',
      note: 'Dùng khi khung hình ở trên không bấm được.',
    });
  } else {
    parts.push(
      '<p class="warn">' +
        icon('warn', 'amber') +
        '<span>Video này không có sẵn luồng MP4 xem online được. Hãy tạo bản nhẹ ở dưới.</span></p>'
    );
  }

  if (info?.audioDirect) {
    items.push({
      href: `/audio/${video.id}${streamKey ? `?k=${encodeURIComponent(streamKey)}` : ''}`,
      icon: 'music',
      label: 'Nghe ngay — chỉ tiếng',
      note: 'Dùng thẳng luồng tiếng của YouTube nên không phải chờ giây nào.',
    });
  }

  if (!ffmpegOk) {
    items.push({ label: 'Chưa có ffmpeg nên không tạo được bản nhẹ.' });
  } else {
    for (const [id, profile] of Object.entries(profiles)) {
      // Ban chi tieng da co duong nghe thang o tren thi khong can chuyen ma nua.
      if (profile.audioOnly && info?.audioDirect) continue;
      // Man hinh 640x480 khong dung toi ban 720p.
      if (profile.modernOnly && legacy) continue;
      items.push({
        href: `/convert?v=${video.id}&amp;p=${id}`,
        icon: profile.audioOnly ? 'music' : 'download',
        label: profile.label,
        note: 'Máy chủ ghép sẵn rồi mới phát, thường chỉ mất vài giây.',
      });
    }
  }

  parts.push(optionList(items));
  // Chi may doi moi dang xem muc phai ghep moi nap file nay — trang cua may
  // Symbian khong co the <script> nay, khong nang them mot byte nao.
  if (mse) {
    parts.push(`<script type="text/javascript" src="/hd.js?v=${ASSET_TAG}"></script>`);
  }
  return parts.join('\n');
}

function watchPage({
  video,
  info,
  choices = [],
  chosen = null,
  mse = null,
  related,
  prefs,
  profiles,
  ffmpegOk,
  streamKey,
  legacy,
  error,
}) {
  const duration = formatDuration(info?.duration || video.duration);
  const views = info?.views ? `${formatCount(info.views)} lượt xem` : video.views;

  const facts =
    [
      duration ? `${icon('clock', 'mute')}<span>${escapeHtml(duration)}</span>` : '',
      views ? `${icon('eye', 'mute')}<span>${escapeHtml(views)}</span>` : '',
    ]
      .filter(Boolean)
      .join('') || '';

  const description = info?.description
    ? `${section('Mô tả', 'info')}
<div class="desc">${escapeHtml(truncate(info.description, 500)).replace(/\n/g, '<br />')}</div>`
    : '';

  const body = `<div class="head">
<h1>${escapeHtml(info?.title || video.title)}</h1>
${
  info?.author || video.author
    ? `<div class="by">${icon('user', 'mute')}<span>${escapeHtml(
        info?.author || video.author
      )}</span></div>`
    : ''
}
${facts ? `<div class="facts">${facts}</div>` : ''}
</div>
${
  error
    ? `<p class="err">${icon('warn', 'red')}<span>${escapeHtml(error)}</span></p>`
    : playOptions({ video, info, choices, chosen, mse, profiles, ffmpegOk, streamKey, legacy })
}
${description}
${section('Video liên quan', 'film')}
${videoList(related, prefs)}`;

  return layout({ title: info?.title || video.title, body, back: '/', prefs });
}

function convertPage({ video, job, profileId, profiles, prefs }) {
  const profile = profiles[profileId];

  if (job.status === 'done') {
    const file = `/file/${job.videoId}/${profileId}`;
    const body = `<div class="head">
<h1>${icon('check', 'red')}<span>Đã xong</span></h1>
<div class="m">${escapeHtml(video.title)}</div>
<div class="m">${escapeHtml(profile.label)} · ${formatBytes(job.size)}</div>
</div>
${profile.audioOnly ? '' : playerBox(file, 'Mở bằng trình phát của máy', `/thumb/${job.videoId}`)}
${optionList([
  { href: file, icon: profile.audioOnly ? 'music' : 'screen', label: 'Mở bằng trình phát của máy' },
  { href: `/watch?v=${job.videoId}`, icon: 'back', label: 'Quay lại video' },
])}
<p class="hint">Bản này nằm trên máy chủ; xem xong máy không giữ lại file.</p>`;
    return layout({ title: 'Đã xong', body, back: `/watch?v=${job.videoId}`, prefs });
  }

  if (job.status === 'error') {
    const body = `<div class="head"><h1>Chuyển mã lỗi</h1></div>
<p class="err">${icon('warn', 'red')}<span>${escapeHtml(
      job.error || 'Không rõ nguyên nhân'
    )}</span></p>
${optionList([{ href: `/watch?v=${job.videoId}`, icon: 'back', label: 'Quay lại video' }])}`;
    return layout({ title: 'Lỗi', body, back: `/watch?v=${job.videoId}`, prefs });
  }

  const status =
    job.status === 'queued'
      ? `Đang xếp hàng (vị trí ${job.position || 1})`
      : `Đang xử lý: ${job.progress}%`;

  const body = `<div class="head">
<h1>Đang chuẩn bị video</h1>
<div class="m">${escapeHtml(video.title)}</div>
<div class="m">${escapeHtml(profile.label)}</div>
</div>
<p class="stat">${escapeHtml(status)}</p>
<div class="pbar"><div class="pfill" style="width:${Math.max(
    2,
    job.progress || 2
  )}%">&nbsp;</div></div>
<p class="hint">Trang tự làm mới sau vài giây. Video dài thì chờ lâu hơn.</p>
${optionList([
  {
    href: `/convert?v=${job.videoId}&amp;p=${profileId}`,
    icon: 'refresh',
    label: 'Làm mới ngay',
  },
])}`;

  return layout({
    title: 'Đang chuẩn bị',
    body,
    back: `/watch?v=${job.videoId}`,
    prefs,
    refreshSeconds: 6,
    refreshUrl: `/convert?v=${job.videoId}&p=${profileId}`,
  });
}

/**
 * Trang hien tren dien thoai Nokia: ma ghep noi + QR de may khac quet.
 * Cookie gan voi rieng may nay, nen chu tren trang phai noi ro "may nay" —
 * nhieu nguoi cung vao mot may chu thi khong ai dung nham tai khoan ai.
 */
function loginPage({
  code,
  linkUrl,
  rememberUrl,
  logoutUrl,
  status,
  minutes,
  notice,
  error,
  prefs,
}) {
  if (status.own) {
    // Trinh duyet Symbian co may khi don sach cookie luc thoat, ma mat ma thiet
    // bi la may chu coi day la mot may la. Dia chi ghi nho mang san khoa cua may
    // nay: luu vao Bookmark mot lan, sau nay mo bookmark do la vao lai duoc, khong
    // phai lay ma va nop cookie tu may tinh lan nua.
    const remember = rememberUrl
      ? `<p class="hint">Bấm <b>Ghi nhớ máy này</b> ở trên rồi lưu trang đó vào Bookmark
của điện thoại. Trình duyệt Symbian có khi dọn sạch cookie lúc thoát; lúc đó mở
bookmark ấy một lần là máy chủ nhận lại tài khoản, khỏi nạp cookie từ máy tính lần
nữa. Địa chỉ của nó:</p>
<p class="url">${escapeHtml(rememberUrl)}</p>`
      : '';

    const options = [
      { href: '/login?check=1', icon: 'check', label: 'Kiểm tra còn dùng được không' },
      { href: '/login?new=1', icon: 'refresh', label: 'Nạp lại cookie mới' },
    ];
    if (rememberUrl) {
      options.push({
        href: escapeHtml(rememberUrl),
        icon: 'key',
        label: 'Ghi nhớ máy này',
        note: 'Mở ra rồi lưu vào Bookmark để lần sau khỏi đăng nhập lại.',
      });
    }
    options.push({
      href: escapeHtml(logoutUrl || '/logout'),
      icon: 'warn',
      label: 'Xoá đăng nhập khỏi máy này',
    });

    const body = `<div class="head"><h1>${icon(
      'check',
      'red'
    )}<span>Đã đăng nhập</span></h1></div>
<p class="ok">${icon('check', 'green')}<span>Máy này đang dùng tài khoản riêng của bạn${
      status.usedAt
        ? ` (cookie cập nhật lúc ${new Date(status.usedAt).toLocaleString('vi-VN')}, ${formatBytes(
            status.size
          )})`
        : ''
    }.</span></p>
${notice ? `<p class="ok">${icon('check', 'green')}<span>${escapeHtml(notice)}</span></p>` : ''}
${error ? `<p class="err">${icon('warn', 'red')}<span>${escapeHtml(error)}</span></p>` : ''}
${optionList(options)}
${remember}<p class="hint">Cookie này chỉ dùng cho máy đang cầm. Máy khác vào cùng địa chỉ
phải tự đăng nhập bằng tài khoản của họ. Giữ địa chỉ ghi nhớ cho riêng mình: ai có
nó cũng xem được bằng tài khoản của bạn — xoá đăng nhập là nó hết tác dụng.</p>`;
    return layout({ title: 'Đăng nhập', body, back: '/', prefs, active: 'login' });
  }

  // Chua co cookie rieng nhung may chu co cookie chung — van xem duoc, chi la
  // dang muon tai khoan cua chu may.
  const shared = status.ready
    ? `<p class="ok">${icon(
        'info',
        'green'
      )}<span>Máy này đang tạm dùng tài khoản chung của máy chủ${
        status.mode === 'browser' ? ` (trình duyệt ${escapeHtml(status.source)})` : ''
      }. Nạp cookie riêng thì kết quả hợp với bạn hơn.</span></p>`
    : '';

  const body = `<div class="head"><h1>${icon('key', 'red')}<span>Đăng nhập</span></h1></div>
${shared}<p class="hint">Mở địa chỉ dưới đây trên máy tính hoặc điện thoại đời mới, rồi nhập mã này.</p>
<p class="code">${escapeHtml(format(code))}</p>
<p class="url">${escapeHtml(linkUrl)}</p>
<p class="hint">Hoặc quét mã vạch bằng máy khác:</p>
<p class="qr"><img src="/qr?c=${encodeURIComponent(code)}" width="200" height="200" alt="Mã QR" /></p>
<p class="hint">Mã còn dùng được ${minutes} phút và chỉ nạp cookie vào đúng máy
này. Trang tự làm mới, xong bên kia là ở đây báo ngay.</p>
<p class="hint">Máy này từng đăng nhập rồi mà giờ lại hỏi? Trình duyệt đã quên mã
thiết bị. Nếu trước đó bạn đã lưu <b>địa chỉ ghi nhớ</b> vào Bookmark thì mở
bookmark đó là vào lại được ngay, không phải nạp cookie lần nữa.</p>
${error ? `<p class="err">${icon('warn', 'red')}<span>${escapeHtml(error)}</span></p>` : ''}
${optionList([{ href: '/login?new=1', icon: 'refresh', label: 'Lấy mã mới' }])}`;

  return layout({
    title: 'Đăng nhập',
    body,
    back: '/',
    prefs,
    active: 'login',
    refreshSeconds: 5,
    refreshUrl: `/login?c=${encodeURIComponent(code)}`,
  });
}

/**
 * Trang cua dia chi ghi nho. Viec duy nhat cua no la noi cho nguoi dung luu
 * chinh trang nay vao Bookmark — con ma thiet bi thi may chu da dat lai truoc
 * khi trang nay hien ra.
 */
function rememberPage({ prefs }) {
  const body = `<div class="head"><h1>${icon(
    'check',
    'red'
  )}<span>Đã ghi nhớ máy này</span></h1></div>
<p class="ok">${icon(
    'check',
    'green'
  )}<span>Máy chủ vừa nhận lại tài khoản cho máy này.</span></p>
<p class="hint">Bây giờ lưu <b>đúng trang này</b> vào Bookmark: bấm
<b>Tuỳ chọn › Bookmark › Lưu làm bookmark</b> (hoặc bấm phím Bookmark của máy).
Lần nào trình duyệt quên đăng nhập thì mở bookmark đó một lần là xong — địa chỉ
của nó mang sẵn mã của máy này.</p>
${optionList([
  { href: '/', icon: 'home', label: 'Vào trang chính' },
  { href: '/login', icon: 'user', label: 'Xem trạng thái đăng nhập' },
])}
<p class="hint">Đừng gửi địa chỉ này cho ai: mở nó là xem YouTube bằng tài khoản
của bạn. Bấm <b>Xoá đăng nhập khỏi máy này</b> là địa chỉ đó hết tác dụng ngay.</p>`;
  return layout({ title: 'Đã ghi nhớ máy này', body, back: '/login', prefs });
}

/**
 * Trang mo tren may tinh — khong bi rang buoc Symbian nen dung duoc
 * JavaScript va CSS hien dai cho de thao tac.
 */
function linkPage({ code, error, done, exposed, refused, partial }) {
  if (done) {
    // Cookie chi co phan '3P' van phat video duoc, nhung YouTube coi cac trang
    // ngoi thu nhat (goi y, kenh dang ky) la cua nguoi chua dang nhap. Noi ngay
    // o day vi day la luc nguoi dung con dang ngoi truoc may tinh de xuat lai.
    const note = partial
      ? `<p class="error">Cookie này thiếu phần đăng nhập gốc của youtube.com
(<code>LOGIN_INFO</code>, <code>SID</code>, <code>__Secure-1PSID</code>) — chỉ có
phần "3P". Video vẫn phát được, nhưng trang <b>Gợi ý cho bạn</b> sẽ trống vì
YouTube coi máy chủ là chưa đăng nhập. Muốn có gợi ý thì xuất lại cookie khi
đang mở <b>youtube.com</b> và đã đăng nhập, lấy hết cookie của miền đó.</p>`
      : '';
    return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Xong</title><link rel="stylesheet" href="/link.css" /></head>
<body><main class="card">
<h1>Đã kết nối</h1>
<p>Cookie đã được lưu cho đúng chiếc điện thoại đang hiện mã. Quay lại máy đó — trang đăng nhập sẽ tự chuyển sang "Đã đăng nhập" trong vài giây.</p>
${note}<p class="hint">Có thể đóng cửa sổ này.</p>
</main></body></html>`;
  }

  // Cookie di qua HTTP tran giua Internet thi ai nam duong truyen cung doc duoc.
  const warning = exposed
    ? `<p class="error">Trang này đang mở bằng <b>http://</b> qua Internet, tức là
nội dung cookie sẽ đi trên đường không mã hoá — ai chen được vào giữa cũng đọc
được cả phiên đăng nhập Google của bạn. Hãy mở lại trang bằng
<b>https://</b>${refused ? '' : ', hoặc chỉ làm bước này khi đang ở cùng mạng nhà với máy chủ'}.</p>`
    : '';

  if (refused) {
    return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Cần HTTPS</title><link rel="stylesheet" href="/link.css" /></head>
<body><main class="card">
<h1>Chưa nộp cookie ở đây được</h1>
${warning}
<p class="hint">Máy chủ được đặt chỉ nhận cookie qua kết nối đã mã hoá
(<code>REQUIRE_SECURE_LINK=1</code>).</p>
</main></body></html>`;
  }

  return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Kết nối YouTube</title><link rel="stylesheet" href="/link.css" /></head>
<body><main class="card">
<h1>Kết nối tài khoản YouTube</h1>
${warning}
<p>Máy chủ cần cookie đăng nhập của chính bạn thì mới lấy được luồng video cho máy Nokia.
Cookie chỉ gắn vào chiếc máy đang hiện mã; người khác dùng chung máy chủ này không đụng tới nó.</p>

<ol class="steps">
<li>Cài tiện ích xuất cookie dạng Netscape cho trình duyệt, ví dụ <b>Get cookies.txt LOCALLY</b>.</li>
<li>Mở <b>youtube.com</b> trong lúc đang đăng nhập, bấm tiện ích và xuất ra file <code>cookies.txt</code>.</li>
<li>Chọn file đó ở dưới, hoặc dán thẳng nội dung vào ô.</li>
</ol>

${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}

<form method="post" action="/link">
<label>Mã hiện trên máy Nokia
<input type="text" name="code" value="${escapeHtml(code || '')}" placeholder="ABC-123"
       autocomplete="off" spellcheck="false" required="required" />
</label>

<label>Chọn file cookies.txt
<input type="file" id="picker" accept=".txt,text/plain" />
</label>

<label>Nội dung cookies.txt
<textarea name="cookies" id="cookies" rows="10" spellcheck="false"
          placeholder="# Netscape HTTP Cookie File&#10;.youtube.com	TRUE	/	TRUE	...">
</textarea>
</label>

<button type="submit">Lưu vào máy chủ</button>
</form>

<p class="hint">Cookie được ghi thành một file riêng của máy Nokia đó trên máy chủ, và
tự xoá khi lâu không dùng. Chỉ nhập mã vào máy chủ mà bạn tin tưởng.</p>

<script>
// Doc file ngay tren trinh duyet roi do vao o van ban, khoi can upload multipart.
document.getElementById('picker').addEventListener('change', function (event) {
  var file = event.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    document.getElementById('cookies').value = reader.result;
  };
  reader.readAsText(file);
});
</script>
</main></body></html>`;
}

function settingsPage(prefs) {
  const option = (value, label, current) =>
    `<option value="${value}"${
      value === current ? ' selected="selected"' : ''
    }>${escapeHtml(label)}</option>`;

  const body = `<div class="head"><h1>${icon('gear', 'red')}<span>Cài đặt</span></h1></div>
<form class="form" action="/settings" method="get">
<div class="row"><label for="ts">Cỡ chữ</label>
<select id="ts" name="textSize">
${Object.entries(TEXT_SIZES)
  .map(([value, label]) => option(value, label, prefs.textSize || DEFAULT_TEXT_SIZE))
  .join('')}
</select>
<div class="m">Màn hình nhỏ mà dày điểm ảnh, chữ mặc định của web hiện ra rất bé. Trang tự
hạ một bậc khi máy xem dọc (N8) vì bề ngang chỉ còn một nửa.</div>
</div>
<div class="row"><label for="th"><input type="checkbox" id="th" name="thumbs" value="1"${
    prefs.thumbs ? ' checked="checked"' : ''
  } /> Hiện ảnh thu nhỏ</label>
<div class="m">Tắt đi cho nhẹ khi dùng mạng 3G.</div>
</div>
<div class="row"><label for="ps">Số kết quả mỗi trang</label>
<select id="ps" name="pageSize">
${[6, 10, 12, 20, 30].map((n) => option(n, String(n), prefs.pageSize)).join('')}
</select>
</div>
<div class="submit"><button type="submit">${icon(
    'check',
    'white'
  )}<span>Lưu</span></button></div>
</form>
<p class="hint">Cài đặt lưu bằng cookie trên máy điện thoại.</p>`;
  return layout({ title: 'Cài đặt', body, back: '/', prefs, active: 'settings' });
}

function aboutPage({
  ffmpegOk,
  cookieStatus,
  deviceCount,
  address,
  build,
  buildDate,
  ytdlpVersion,
  prefs,
}) {
  const row = (label, value) =>
    `<tr><td class="lb">${escapeHtml(label)}</td><td>${value}</td></tr>`;

  const cookieCell = cookieStatus.own
    ? 'Tài khoản riêng của máy này'
    : cookieStatus.ready
      ? 'Đang dùng tài khoản chung của máy chủ — <a href="/login">nạp riêng</a>'
      : '<a href="/login">Chưa có — đăng nhập</a>';

  const body = `<div class="head"><h1>${icon('info', 'red')}<span>Giới thiệu</span></h1></div>
<p class="hint">Trang xem YouTube tối giản cho Nokia Symbian Belle. Máy chỉ tải
HTML thuần, mọi việc nặng do máy chủ làm.</p>
${section('Trạng thái', 'gear')}
<table class="info">
${row('Địa chỉ máy chủ', escapeHtml(address))}
${row('Bản đang chạy', escapeHtml(build))}
${buildDate ? row('Dựng lúc', escapeHtml(buildDate)) : ''}
${row('yt-dlp', escapeHtml(ytdlpVersion))}
${row('Chuyển mã (ffmpeg)', ffmpegOk ? 'Sẵn sàng' : 'Chưa có')}
${row('Cookie YouTube', cookieCell)}
${row('Số máy đã nạp cookie riêng', String(deviceCount))}
${row('Cookie chung của máy chủ', cookieStatus.sharedAllowed ? 'Bật' : 'Tắt')}
</table>
${section('Phím tắt', 'key')}
<table class="info">
${row('Lên / Xuống', 'Nhảy sang khối video kế tiếp')}
${row('Giữa (OK)', 'Mở mục đang chọn')}
${row('0', 'Về trang chính')}
${row('1 – 9', 'Chọn thẳng mục thứ 1 đến 9')}
${row('*', 'Nhảy vào ô tìm kiếm')}
${row('#', 'Sang trang kết quả sau')}
</table>`;
  return layout({ title: 'Giới thiệu', body, back: '/', prefs, active: 'about' });
}

function errorPage({ title, message, back, prefs }) {
  const body = `<div class="head"><h1>${escapeHtml(title)}</h1></div>
<p class="err">${icon('warn', 'red')}<span>${escapeHtml(message)}</span></p>
${optionList([{ href: escapeHtml(back || '/'), icon: 'back', label: 'Quay lại' }])}`;
  return layout({ title, body, back: back || '/', prefs });
}

module.exports = {
  layout,
  TEXT_SIZES,
  DEFAULT_TEXT_SIZE,
  homePage,
  searchPage,
  watchPage,
  convertPage,
  loginPage,
  rememberPage,
  linkPage,
  settingsPage,
  aboutPage,
  errorPage,
};
