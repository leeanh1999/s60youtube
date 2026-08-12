'use strict';

const {
  escapeHtml,
  formatDuration,
  formatCount,
  formatBytes,
  truncate,
} = require('./util');
const { format } = require('./pairing');

/** Co chu chon duoc trong muc Cai dat; gia tri thanh ten lop tren the <body>. */
const TEXT_SIZES = { m: 'Vừa', l: 'Lớn', xl: 'Rất lớn' };
const DEFAULT_TEXT_SIZE = 'l';

/**
 * Trinh duyet Symbian (Nokia Browser 7.x/8.x, WebKit doi cu) rat kho tinh:
 * dung XHTML 1.0 Transitional, khong JavaScript, khong CSS3.
 * Moi thao tac deu la link hoac form GET.
 *
 * Bo cuc mot cot tu tren xuong: man hinh E6 chi rong 480 diem, chia doi ra
 * thi cot nao cung qua hep de doc. Moi lien ket la mot khoi cao de ngon tay
 * cham trung — Belle la may cam ung.
 */
function layout({ title, body, back, prefs, refreshSeconds, refreshUrl }) {
  const refresh = refreshSeconds
    ? `<meta http-equiv="refresh" content="${refreshSeconds}${
        refreshUrl ? `; url=${escapeHtml(refreshUrl)}` : ''
      }" />\n`
    : '';
  const textSize = TEXT_SIZES[prefs?.textSize] ? prefs.textSize : DEFAULT_TEXT_SIZE;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="HandheldFriendly" content="true" />
<meta name="MobileOptimized" content="480" />
${refresh}<title>${escapeHtml(title)}</title>
<link rel="stylesheet" type="text/css" href="/s60.css" />
</head>
<body class="t-${textSize}">
<div class="bar">
<a class="brand" href="/" accesskey="0">YouTube S60</a>
${back ? `<a class="back" href="${escapeHtml(back)}">Quay lại</a>` : ''}
</div>
${body}
<ul class="nav">
<li><a href="/" accesskey="0">Trang chính</a></li>
<li><a href="/login">Đăng nhập</a></li>
<li><a href="/settings">Cài đặt</a></li>
<li><a href="/about">Giới thiệu</a></li>
</ul>
</body>
</html>`;
}

function searchForm(query = '') {
  return `<form class="search" action="/search" method="get">
<table class="sform"><tr>
<td class="qi"><input type="text" name="q" value="${escapeHtml(
    query
  )}" accesskey="*" /></td>
<td class="qb"><input type="submit" value="Tìm" /></td>
</tr></table>
</form>`;
}

function videoRow(video, index, prefs) {
  const key = index < 9 ? `${index + 1}` : null;
  const href = `/watch?v=${video.id}`;
  // Anh 16:9 rong het be ngang: de nhin hon nhieu so voi o vuong 80x60 nam
  // canh chu, va van la mot cot.
  const thumb = prefs.thumbs
    ? `<a class="thumb" href="${href}"><img src="/thumb/${video.id}" width="320" height="180" alt="" /></a>\n`
    : '';
  const meta = [
    video.durationText || formatDuration(video.duration),
    video.views,
    video.published,
  ]
    .filter(Boolean)
    .join(' · ');

  return `<li>
${thumb}<a class="title" href="${href}"${key ? ` accesskey="${key}"` : ''}>${
    key ? `<span class="k">${key}</span> ` : ''
  }${escapeHtml(truncate(video.title, 80))}</a>
<div class="m">${escapeHtml(truncate(video.author, 40))}</div>
<div class="m">${escapeHtml(meta)}${video.live ? ' · <b>TRỰC TIẾP</b>' : ''}</div>
</li>`;
}

function videoList(videos, prefs) {
  if (!videos.length) return '<p class="empty">Không có video nào.</p>';
  const rows = videos.map((video, i) => videoRow(video, i, prefs)).join('\n');
  return `<ul class="feed">\n${rows}\n</ul>`;
}

/** Chu de goi y — bam phim so tren dien thoai la vao thang. */
const TOPICS = [
  'Nhạc trẻ',
  'Nhạc vàng',
  'Hài kịch',
  'Bóng đá',
  'Tin tức',
  'Phim ngắn',
  'Nấu ăn',
  'Thiếu nhi',
  'Nhạc không lời',
];

function homePage({ warning, prefs }) {
  const topics = TOPICS.map(
    (topic, i) =>
      `<li><a href="/search?q=${encodeURIComponent(topic)}" accesskey="${
        i + 1
      }"><span class="k">${i + 1}</span> ${escapeHtml(topic)}</a></li>`
  ).join('\n');

  const body = `${searchForm()}
${
  warning
    ? `<p class="warn">${escapeHtml(warning)} <a href="/login">Đăng nhập ngay »</a></p>`
    : ''
}
<h2>Chủ đề nhanh</h2>
<ul class="opts">
${topics}
</ul>
<p class="hint">Mẹo: dán thẳng link YouTube vào ô tìm kiếm để mở đúng video đó.</p>`;
  return layout({ title: 'YouTube cho Symbian', body, prefs });
}

function searchPage({ query, videos, prefs, nextPage, warning }) {
  const next = nextPage
    ? `<p class="more"><a href="/search?q=${encodeURIComponent(
        query
      )}&amp;p=${nextPage}" accesskey="#">Trang sau »</a></p>`
    : '';
  const body = `${searchForm(query)}
${warning ? `<p class="warn">${escapeHtml(warning)}</p>` : ''}
<h2>Kết quả: ${escapeHtml(query)}</h2>
${videoList(videos, prefs)}
${next}`;
  return layout({ title: `Tìm: ${query}`, body, prefs });
}

/**
 * Trinh duyet cua Nokia Belle (Browser 7.4 / 8.x) doc duoc the <video> HTML5 voi
 * H.264/MP4, va no keo file theo tung doan bang header Range — tuc la xem online,
 * khong luu gi vao may. Mot lien ket .mp4 tran thi nguoc lai: Symbian tai het file
 * ve roi moi mo, nen the <video> phai la duong chinh.
 *
 * preload="none" de may chua dong gi cho toi khi bam nut phat.
 * May doi cu khong hieu the nay se bo qua no va hien lien ket du phong ben trong.
 */
function playerBox(src, label) {
  // Vua dat src vua co <source>: ban WebKit cua Nokia chi doc mot trong hai
  // tuy doi may, de ca hai thi doi nao cung phat duoc.
  return `<div class="player">
<video src="${src}" width="320" height="240" controls="controls" preload="none">
<source src="${src}" type="video/mp4" />
<a class="go" href="${src}">▶ ${escapeHtml(label)}</a>
</video>
</div>`;
}

function playOptions(video, info, profiles, ffmpegOk) {
  const parts = [];
  const rows = [];

  if (info?.direct) {
    parts.push(playerBox(`/stream/${video.id}`, 'Mở bằng trình phát của máy'));
    parts.push(
      `<p class="hint">Xem online ${info.direct.height}p — máy chỉ tải phần đang xem, không lưu vào bộ nhớ.</p>`
    );
    rows.push(
      `<li><a href="/stream/${video.id}" accesskey="1">Mở bằng trình phát của máy</a>
<div class="m">Dùng khi khung hình ở trên không bấm được.</div></li>`
    );
  } else {
    parts.push(
      '<p class="warn">Video này không có sẵn luồng MP4 xem online được. Hãy tạo bản nhẹ ở dưới.</p>'
    );
  }

  if (!ffmpegOk) {
    rows.push('<li class="m">Chưa có ffmpeg nên không tạo được bản nhẹ.</li>');
  } else {
    let index = info?.direct ? 2 : 1;
    for (const [id, profile] of Object.entries(profiles)) {
      rows.push(`<li><a href="/convert?v=${video.id}&amp;p=${id}"${
        index <= 9 ? ` accesskey="${index}"` : ''
      }>${escapeHtml(profile.label)}</a>
<div class="m">Máy chủ chuyển mã trước, phải chờ. Chỉ cần khi xem online bị giật.</div></li>`);
      index += 1;
    }
  }

  parts.push(`<ul class="opts">${rows.join('\n')}</ul>`);
  return parts.join('\n');
}

function watchPage({ video, info, related, prefs, profiles, ffmpegOk, error }) {
  const meta = [
    formatDuration(info?.duration || video.duration),
    info?.views ? `${formatCount(info.views)} lượt xem` : video.views,
  ]
    .filter(Boolean)
    .join(' · ');

  const description = info?.description
    ? `<div class="desc">${escapeHtml(truncate(info.description, 500)).replace(
        /\n/g,
        '<br />'
      )}</div>`
    : '';

  const body = `<div class="head">
<h1>${escapeHtml(info?.title || video.title)}</h1>
<div class="m">${escapeHtml(info?.author || video.author)}</div>
<div class="m">${escapeHtml(meta)}</div>
</div>
${
  error
    ? `<p class="err">${escapeHtml(error)}</p>`
    : playOptions(video, info, profiles, ffmpegOk)
}
${description}
<h2>Video liên quan</h2>
${videoList(related, prefs)}`;

  return layout({ title: info?.title || video.title, body, back: '/', prefs });
}

function convertPage({ video, job, profileId, profiles, prefs }) {
  const profile = profiles[profileId];

  if (job.status === 'done') {
    const file = `/file/${job.videoId}/${profileId}`;
    const body = `<div class="head">
<h1>Đã xong</h1>
<div class="m">${escapeHtml(video.title)}</div>
<div class="m">${escapeHtml(profile.label)} · ${formatBytes(job.size)}</div>
</div>
${profile.audioOnly ? '' : playerBox(file, 'Mở bằng trình phát của máy')}
<ul class="opts">
<li><a href="${file}" accesskey="1">Mở bằng trình phát của máy</a></li>
<li><a href="/watch?v=${job.videoId}" accesskey="2">Quay lại video</a></li>
</ul>
<p class="hint">Bản này nằm trên máy chủ; xem xong máy không giữ lại file.</p>`;
    return layout({ title: 'Đã xong', body, back: `/watch?v=${job.videoId}`, prefs });
  }

  if (job.status === 'error') {
    const body = `<div class="head"><h1>Chuyển mã lỗi</h1></div>
<p class="err">${escapeHtml(job.error || 'Không rõ nguyên nhân')}</p>
<ul class="opts">
<li><a href="/watch?v=${job.videoId}" accesskey="1">Quay lại video</a></li>
</ul>`;
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
<ul class="opts">
<li><a href="/convert?v=${job.videoId}&amp;p=${profileId}" accesskey="5">Làm mới ngay</a></li>
</ul>`;

  return layout({
    title: 'Đang chuẩn bị',
    body,
    back: `/watch?v=${job.videoId}`,
    prefs,
    refreshSeconds: 6,
    refreshUrl: `/convert?v=${job.videoId}&p=${profileId}`,
  });
}

/** Trang hien tren dien thoai Nokia: ma ghep noi + QR de may khac quet. */
function loginPage({ code, linkUrl, status, minutes, notice, error, prefs }) {
  if (status.ready) {
    const saved =
      status.mode === 'browser'
        ? `Đang đọc cookie thẳng từ trình duyệt ${escapeHtml(status.source)}.`
        : `Đã lưu lúc ${new Date(status.savedAt).toLocaleString('vi-VN')} (${formatBytes(
            status.size
          )}).`;
    const body = `<div class="head"><h1>Đã đăng nhập</h1></div>
<p class="ok">${saved}</p>
${notice ? `<p class="ok">${escapeHtml(notice)}</p>` : ''}
${error ? `<p class="err">${escapeHtml(error)}</p>` : ''}
<ul class="opts">
<li><a href="/login?check=1" accesskey="1">Kiểm tra còn dùng được không</a></li>
<li><a href="/login?new=1" accesskey="2">Đăng nhập lại bằng mã khác</a></li>
<li><a href="/logout" accesskey="3">Xoá đăng nhập</a></li>
</ul>`;
    return layout({ title: 'Đăng nhập', body, back: '/', prefs });
  }

  const body = `<div class="head"><h1>Đăng nhập</h1></div>
<p class="hint">Mở địa chỉ dưới đây trên máy tính hoặc điện thoại đời mới, rồi nhập mã này.</p>
<p class="code">${escapeHtml(format(code))}</p>
<p class="url">${escapeHtml(linkUrl)}</p>
<p class="hint">Hoặc quét mã vạch bằng máy khác:</p>
<p class="qr"><img src="/qr?c=${encodeURIComponent(code)}" width="200" height="200" alt="Mã QR" /></p>
<p class="hint">Mã còn dùng được ${minutes} phút. Trang này tự làm mới, xong bên kia là ở đây báo ngay.</p>
${error ? `<p class="err">${escapeHtml(error)}</p>` : ''}
<ul class="opts">
<li><a href="/login?new=1" accesskey="5">Lấy mã mới</a></li>
</ul>`;

  return layout({
    title: 'Đăng nhập',
    body,
    back: '/',
    prefs,
    refreshSeconds: 5,
    refreshUrl: `/login?c=${encodeURIComponent(code)}`,
  });
}

/**
 * Trang mo tren may tinh — khong bi rang buoc Symbian nen dung duoc
 * JavaScript va CSS hien dai cho de thao tac.
 */
function linkPage({ code, error, done }) {
  if (done) {
    return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Xong</title><link rel="stylesheet" href="/link.css" /></head>
<body><main class="card">
<h1>Đã kết nối</h1>
<p>Cookie đã được lưu vào máy chủ. Quay lại điện thoại Nokia — trang đăng nhập sẽ tự chuyển sang "Đã đăng nhập" trong vài giây.</p>
<p class="hint">Có thể đóng cửa sổ này.</p>
</main></body></html>`;
  }

  return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Kết nối YouTube</title><link rel="stylesheet" href="/link.css" /></head>
<body><main class="card">
<h1>Kết nối tài khoản YouTube</h1>
<p>Máy chủ cần cookie đăng nhập của chính bạn thì mới lấy được luồng video cho máy Nokia.</p>

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

<p class="hint">Cookie chỉ được ghi ra file <code>cookies.txt</code> trong thư mục dự án trên máy này. Đừng chia sẻ file đó cho ai.</p>

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

  const body = `<div class="head"><h1>Cài đặt</h1></div>
<form class="form" action="/settings" method="get">
<div class="row">Cỡ chữ:
<select name="textSize">
${Object.entries(TEXT_SIZES)
  .map(([value, label]) => option(value, label, prefs.textSize || DEFAULT_TEXT_SIZE))
  .join('')}
</select>
<div class="m">Màn hình E6 nhỏ mà dày điểm ảnh, chữ mặc định của web hiện ra rất bé.</div>
</div>
<div class="row"><input type="checkbox" name="thumbs" value="1"${
    prefs.thumbs ? ' checked="checked"' : ''
  } /> Hiện ảnh thu nhỏ
<div class="m">Tắt đi cho nhẹ khi dùng mạng 3G.</div>
</div>
<div class="row">Số kết quả mỗi trang:
<select name="pageSize">
${[6, 10, 12, 20, 30].map((n) => option(n, String(n), prefs.pageSize)).join('')}
</select>
</div>
<div class="submit"><input type="submit" value="Lưu" /></div>
</form>
<p class="hint">Cài đặt lưu bằng cookie trên máy điện thoại.</p>`;
  return layout({ title: 'Cài đặt', body, back: '/', prefs });
}

function aboutPage({
  ffmpegOk,
  cookiesOk,
  address,
  build,
  buildDate,
  ytdlpVersion,
  prefs,
}) {
  const row = (label, value) =>
    `<tr><td class="lb">${escapeHtml(label)}</td><td>${value}</td></tr>`;

  const body = `<div class="head"><h1>Giới thiệu</h1></div>
<p class="hint">Trang xem YouTube tối giản cho Nokia Symbian Belle. Máy chỉ tải
HTML thuần, mọi việc nặng do máy chủ làm.</p>
<h2>Trạng thái</h2>
<table class="info">
${row('Địa chỉ máy chủ', escapeHtml(address))}
${row('Bản đang chạy', escapeHtml(build))}
${buildDate ? row('Dựng lúc', escapeHtml(buildDate)) : ''}
${row('yt-dlp', escapeHtml(ytdlpVersion))}
${row('Chuyển mã (ffmpeg)', ffmpegOk ? 'Sẵn sàng' : 'Chưa có')}
${row(
  'Cookie YouTube',
  cookiesOk ? 'Đã cấu hình' : '<a href="/login">Chưa có — đăng nhập</a>'
)}
</table>
<h2>Phím tắt</h2>
<p class="hint">0 = trang chính, 1–9 = chọn mục, * = ô tìm kiếm, # = trang sau.</p>`;
  return layout({ title: 'Giới thiệu', body, back: '/', prefs });
}

function errorPage({ title, message, back, prefs }) {
  const body = `<div class="head"><h1>${escapeHtml(title)}</h1></div>
<p class="err">${escapeHtml(message)}</p>
<ul class="opts">
<li><a href="${escapeHtml(back || '/')}" accesskey="1">Quay lại</a></li>
</ul>`;
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
  linkPage,
  settingsPage,
  aboutPage,
  errorPage,
};
