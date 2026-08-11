'use strict';

const {
  escapeHtml,
  formatDuration,
  formatCount,
  formatBytes,
  truncate,
} = require('./util');
const { format } = require('./pairing');

/**
 * Trinh duyet Symbian (Nokia Browser 7.x/8.x, WebKit doi cu) rat kho tinh:
 * dung XHTML 1.0 Transitional, bang de dan trang, khong JavaScript,
 * khong CSS3. Moi thao tac deu la link hoac form GET.
 */
function layout({ title, body, back, refreshSeconds, refreshUrl }) {
  const refresh = refreshSeconds
    ? `<meta http-equiv="refresh" content="${refreshSeconds}${
        refreshUrl ? `; url=${escapeHtml(refreshUrl)}` : ''
      }" />\n`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="HandheldFriendly" content="true" />
<meta name="MobileOptimized" content="240" />
${refresh}<title>${escapeHtml(title)}</title>
<link rel="stylesheet" type="text/css" href="/s60.css" />
</head>
<body>
<div class="bar">
<a class="brand" href="/" accesskey="0">YouTube S60</a>
${back ? `<a class="back" href="${escapeHtml(back)}">Quay lại</a>` : ''}
</div>
${body}
<div class="nav">
<a href="/" accesskey="0">Trang chính</a> |
<a href="/login">Đăng nhập</a> |
<a href="/settings">Cài đặt</a> |
<a href="/about">Giới thiệu</a>
</div>
</body>
</html>`;
}

function searchForm(query = '') {
  return `<form class="search" action="/search" method="get">
<input type="text" name="q" value="${escapeHtml(query)}" size="14" accesskey="*" />
<input type="submit" value="Tìm" />
</form>`;
}

function videoRow(video, index, prefs) {
  const key = index < 9 ? `${index + 1}` : null;
  const thumb = prefs.thumbs
    ? `<td class="th"><a href="/watch?v=${video.id}"><img src="/thumb/${video.id}" width="80" height="60" alt="" /></a></td>`
    : '';
  const meta = [
    video.durationText || formatDuration(video.duration),
    video.views,
    video.published,
  ]
    .filter(Boolean)
    .join(' · ');

  return `<tr>
${thumb}<td class="tx">
${key ? `<span class="k">${key}</span> ` : ''}<a href="/watch?v=${video.id}"${
    key ? ` accesskey="${key}"` : ''
  }>${escapeHtml(truncate(video.title, 70))}</a>
<div class="m">${escapeHtml(truncate(video.author, 30))}</div>
<div class="m">${escapeHtml(meta)}${video.live ? ' · <b>TRỰC TIẾP</b>' : ''}</div>
</td>
</tr>`;
}

function videoList(videos, prefs) {
  if (!videos.length) return '<p class="empty">Không có video nào.</p>';
  const rows = videos.map((video, i) => videoRow(video, i, prefs)).join('\n');
  return `<table class="list">\n${rows}\n</table>`;
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

function homePage({ warning }) {
  const topics = TOPICS.map(
    (topic, i) =>
      `<li><span class="k">${i + 1}</span> <a href="/search?q=${encodeURIComponent(
        topic
      )}" accesskey="${i + 1}">${escapeHtml(topic)}</a></li>`
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
<p class="m">Mẹo: dán thẳng link YouTube vào ô tìm kiếm để mở đúng video đó.</p>`;
  return layout({ title: 'YouTube cho Symbian', body });
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
  return layout({ title: `Tìm: ${query}`, body });
}

function playOptions(video, info, profiles, ffmpegOk) {
  const rows = [];

  if (info?.direct) {
    const size = info.direct.filesize ? ` (${formatBytes(info.direct.filesize)})` : '';
    rows.push(`<li><a class="go" href="/stream/${video.id}/${info.direct.id}" accesskey="1">
▶ Phát ngay — ${info.direct.height}p${size}</a>
<div class="m">MP4 có sẵn, không phải chờ chuyển mã. Hợp với Belle.</div></li>`);
  }

  if (!ffmpegOk) {
    rows.push(
      '<li class="m">Chưa có ffmpeg nên không tạo được bản nhẹ hơn.</li>'
    );
  } else {
    let index = info?.direct ? 2 : 1;
    for (const [id, profile] of Object.entries(profiles)) {
      rows.push(`<li><a href="/convert?v=${video.id}&amp;p=${id}"${
        index <= 9 ? ` accesskey="${index}"` : ''
      }>${escapeHtml(profile.label)}</a></li>`);
      index += 1;
    }
  }

  return `<ul class="opts">${rows.join('\n')}</ul>`;
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

  const body = `<h1>${escapeHtml(info?.title || video.title)}</h1>
<div class="m">${escapeHtml(info?.author || video.author)}</div>
<div class="m">${escapeHtml(meta)}</div>
${
  error
    ? `<p class="err">${escapeHtml(error)}</p>`
    : playOptions(video, info, profiles, ffmpegOk)
}
${description}
<h2>Video liên quan</h2>
${videoList(related, prefs)}`;

  return layout({ title: info?.title || video.title, body, back: '/' });
}

function convertPage({ video, job, profileId, profiles }) {
  const profile = profiles[profileId];

  if (job.status === 'done') {
    const body = `<h1>Đã xong</h1>
<div class="m">${escapeHtml(video.title)}</div>
<div class="m">${escapeHtml(profile.label)} · ${formatBytes(job.size)}</div>
<ul class="opts">
<li><a class="go" href="/file/${job.videoId}/${profileId}" accesskey="1">▶ Phát / Tải về</a></li>
<li><a href="/watch?v=${job.videoId}" accesskey="2">Chọn chất lượng khác</a></li>
</ul>
<p class="m">Nếu máy không tự mở, hãy chọn "Lưu" rồi mở bằng trình phát của máy.</p>`;
    return layout({ title: 'Đã xong', body, back: `/watch?v=${job.videoId}` });
  }

  if (job.status === 'error') {
    const body = `<h1>Chuyển mã lỗi</h1>
<p class="err">${escapeHtml(job.error || 'Không rõ nguyên nhân')}</p>
<p><a href="/watch?v=${job.videoId}">Quay lại video</a></p>`;
    return layout({ title: 'Lỗi', body, back: `/watch?v=${job.videoId}` });
  }

  const status =
    job.status === 'queued'
      ? `Đang xếp hàng (vị trí ${job.position || 1})`
      : `Đang xử lý: ${job.progress}%`;

  const body = `<h1>Đang chuẩn bị video</h1>
<div class="m">${escapeHtml(video.title)}</div>
<div class="m">${escapeHtml(profile.label)}</div>
<p class="stat">${escapeHtml(status)}</p>
<div class="pbar"><div class="pfill" style="width:${Math.max(
    2,
    job.progress || 2
  )}%">&nbsp;</div></div>
<p class="m">Trang tự làm mới sau vài giây. Video dài thì chờ lâu hơn.</p>
<p><a href="/convert?v=${job.videoId}&amp;p=${profileId}" accesskey="5">Làm mới ngay</a></p>`;

  return layout({
    title: 'Đang chuẩn bị',
    body,
    back: `/watch?v=${job.videoId}`,
    refreshSeconds: 6,
    refreshUrl: `/convert?v=${job.videoId}&p=${profileId}`,
  });
}

/** Trang hien tren dien thoai Nokia: ma ghep noi + QR de may khac quet. */
function loginPage({ code, linkUrl, status, minutes, notice, error }) {
  if (status.ready) {
    const saved =
      status.mode === 'browser'
        ? `Đang đọc cookie thẳng từ trình duyệt ${escapeHtml(status.source)}.`
        : `Đã lưu lúc ${new Date(status.savedAt).toLocaleString('vi-VN')} (${formatBytes(
            status.size
          )}).`;
    const body = `<h1>Đã đăng nhập</h1>
<p class="ok">${saved}</p>
${notice ? `<p class="ok">${escapeHtml(notice)}</p>` : ''}
${error ? `<p class="err">${escapeHtml(error)}</p>` : ''}
<ul class="opts">
<li><a class="go" href="/login?check=1" accesskey="1">Kiểm tra còn dùng được không</a></li>
<li><a href="/login?new=1" accesskey="2">Đăng nhập lại bằng mã khác</a></li>
<li><a href="/logout" accesskey="3">Xoá đăng nhập</a></li>
</ul>`;
    return layout({ title: 'Đăng nhập', body, back: '/' });
  }

  const body = `<h1>Đăng nhập</h1>
<p class="m">Mở địa chỉ dưới đây trên máy tính hoặc điện thoại đời mới, rồi nhập mã này.</p>
<p class="code">${escapeHtml(format(code))}</p>
<p class="url">${escapeHtml(linkUrl)}</p>
<p class="m">Hoặc quét mã vạch bằng máy khác:</p>
<p class="qr"><img src="/qr?c=${encodeURIComponent(code)}" width="200" height="200" alt="Mã QR" /></p>
<p class="m">Mã còn dùng được ${minutes} phút. Trang này tự làm mới, xong bên kia là ở đây báo ngay.</p>
${error ? `<p class="err">${escapeHtml(error)}</p>` : ''}
<p><a href="/login?new=1" accesskey="5">Lấy mã mới</a></p>`;

  return layout({
    title: 'Đăng nhập',
    body,
    back: '/',
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
  const checked = (value) => (value ? ' checked="checked"' : '');
  const body = `<h1>Cài đặt</h1>
<form action="/settings" method="get">
<p><input type="checkbox" name="thumbs" value="1"${checked(
    prefs.thumbs
  )} /> Hiện ảnh thu nhỏ</p>
<p>Số kết quả mỗi trang:
<select name="pageSize">
${[6, 10, 12, 20, 30]
  .map(
    (n) =>
      `<option value="${n}"${n === prefs.pageSize ? ' selected="selected"' : ''}>${n}</option>`
  )
  .join('')}
</select></p>
<p><input type="submit" value="Lưu" /></p>
</form>
<p class="m">Cài đặt lưu bằng cookie trên máy điện thoại.</p>`;
  return layout({ title: 'Cài đặt', body, back: '/' });
}

function aboutPage({ ffmpegOk, cookiesOk, address }) {
  const body = `<h1>Giới thiệu</h1>
<p class="m">Trang xem YouTube tối giản cho Nokia Symbian (S60v3, S60v5, Anna, Belle).
Máy chỉ tải HTML thuần, mọi việc nặng do máy tính chủ làm.</p>
<h2>Trạng thái</h2>
<table class="list">
<tr><td class="tx">Địa chỉ máy chủ</td><td class="tx">${escapeHtml(address)}</td></tr>
<tr><td class="tx">Chuyển mã (ffmpeg)</td><td class="tx">${
    ffmpegOk ? 'Sẵn sàng' : 'Chưa có'
  }</td></tr>
<tr><td class="tx">Cookie YouTube</td><td class="tx">${
    cookiesOk ? 'Đã cấu hình' : '<a href="/login">Chưa có — đăng nhập</a>'
  }</td></tr>
</table>
<h2>Phím tắt</h2>
<p class="m">0 = trang chính, 1–9 = chọn mục, * = ô tìm kiếm, # = trang sau.</p>`;
  return layout({ title: 'Giới thiệu', body, back: '/' });
}

function errorPage({ title, message, back }) {
  const body = `<h1>${escapeHtml(title)}</h1>
<p class="err">${escapeHtml(message)}</p>
<p><a href="${escapeHtml(back || '/')}">Quay lại</a></p>`;
  return layout({ title, body, back: back || '/' });
}

module.exports = {
  layout,
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
