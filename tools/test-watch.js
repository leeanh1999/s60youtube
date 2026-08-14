'use strict';

/**
 * Kiem thu toc do mo trang video — khong can mang, khong can yt-dlp that.
 *
 * Trang video phai cho hai nguon: yt-dlp (danh sach luong) va InnerTube (ten
 * video, video lien quan). yt-dlp chay han mot tien trinh Python roi hoi
 * YouTube may lan nen tren NAS la vai giay, con InnerTube chi nua giay. Neu
 * trang cho cho du ca hai thi nguoi dung ngoi nhin man hinh trang suot may giay
 * — chinh la cho bai thu nay canh.
 *
 * O day dung mot yt-dlp gia CHAM (2 giay) va mot InnerTube gia NHANH, roi do:
 *
 *  1. Trang phai ve ngay, khong doi yt-dlp.
 *  2. Ve som nhung khong duoc trong: ten video, ten kenh, mo ta, video lien
 *     quan deu lay duoc tu InnerTube.
 *  3. Khung phat phai bam duoc ngay, bang duong /stream khong kem ma luong.
 *  4. yt-dlp van phai chay tiep cho xong — va chi chay MOT lan cho ca hai lan
 *     mo trang, khong duoc goi lai tu dau.
 *  5. Mo lai trang thi day du: co hang chon do phan giai.
 */

process.env.PORT = '8094';
process.env.WATCH_WAIT_MS = '600';

const path = require('path');

const ROOT = path.join(__dirname, '..');
const config = require(path.join(ROOT, 'lib', 'config'));
const { TtlCache } = require(path.join(ROOT, 'lib', 'cache'));
const ytdlp = require(path.join(ROOT, 'lib', 'ytdlp'));
const innertube = require(path.join(ROOT, 'lib', 'innertube'));

const VIDEO = 'dQw4w9WgXcQ';
const YTDLP_MS = 2000;
const NOKIA =
  'Mozilla/5.0 (Symbian/3; Series60/5.3 NokiaN8-00) AppleWebKit/535.1 NokiaBrowser/8.3.1.4';
const PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0';

let ytdlpCalls = 0;
let innertubeCalls = 0;

const format = (o) => ({
  width: 0, fps: 0, abr: 0, tbr: 100, filesize: 0,
  protocol: 'https', note: '', ext: 'mp4', url: 'http://x/y', ...o,
});

// Hai ham gia nay boc trong dung cai bo nho dem ma ban that dung, va boc y
// nguyen kieu do: co the moi thu duoc "mo trang hai lan thi hoi YouTube may
// lan". TtlCache giu ca lan goi dang do dang, nen hai trang mo cung luc dung
// chung mot lan chay chu khong de ra hai.
const infoCache = new TtlCache(50);
const listCache = new TtlCache(50);

const chamCham = (id) => {
  ytdlpCalls += 1;
  return new Promise((resolve) => {
    setTimeout(
      () =>
        resolve({
          id,
          title: 'Ten tu yt-dlp',
          author: 'Kenh tu yt-dlp',
          duration: 213,
          views: 1803938823,
          likes: 0,
          uploadDate: '',
          description: 'Mo ta tu yt-dlp',
          isLive: false,
          formats: [
            format({ id: '18', height: 360, vcodec: 'avc1.42001E', acodec: 'mp4a.40.2' }),
            format({ id: '137', height: 1080, vcodec: 'avc1.640028', acodec: null }),
            format({ id: '136', height: 720, vcodec: 'avc1.4d401f', acodec: null }),
            format({ id: '140', height: 0, vcodec: null, acodec: 'mp4a.40.2', abr: 128, ext: 'm4a' }),
          ],
        }),
      YTDLP_MS
    );
  });
};

ytdlp.getInfo = (id, auth) =>
  infoCache.wrap(`info:${auth?.key || 'none'}:${id}`, config.INFO_TTL_MS, () => chamCham(id));

// Giu ban that lai de con thu rieng phan doc tra loi cua InnerTube (muc 7).
const relatedThat = innertube.related;

const nhanhNhanh = async () => {
  innertubeCalls += 1;
  await new Promise((r) => setTimeout(r, 120));
  return {
    video: {
      title: 'Ten tu InnerTube',
      author: 'Kenh tu InnerTube',
      views: '1.803.938.823 lượt xem',
      published: '16 năm trước',
      description: 'Mo ta tu InnerTube',
    },
    videos: [
      { id: 'jNQXAC9IVRw', title: 'Video ke ben', author: 'Ai do', duration: 19, durationText: '0:19', views: '1 N', published: '', live: false },
    ],
  };
};

innertube.related = (id) => listCache.wrap(`next:${id}`, config.LIST_TTL_MS, () => nhanhNhanh());

require(path.join(ROOT, 'server.js'));

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  OK   ${name}`);
  } else {
    failed += 1;
    console.log(`  LOI  ${name} ${detail}`);
  }
}

async function mo(ua) {
  const started = Date.now();
  const res = await fetch(`http://127.0.0.1:8094/watch?v=${VIDEO}`, {
    headers: { 'User-Agent': ua },
  });
  return { ms: Date.now() - started, html: await res.text(), status: res.status };
}

setTimeout(async () => {
  console.log(`1. May Nokia mo trang khi yt-dlp con dang chay (${YTDLP_MS} ms)`);
  const som = await mo(NOKIA);
  check('trang tra ve 200', som.status === 200);
  check(
    'khong cho yt-dlp: ve truoc mot nua thoi gian do',
    som.ms < YTDLP_MS / 2,
    `mat ${som.ms} ms, yt-dlp can ${YTDLP_MS} ms`
  );
  check('co ten video (lay tu InnerTube)', som.html.includes('Ten tu InnerTube'));
  check('co ten kenh', som.html.includes('Kenh tu InnerTube'));
  check('co luot xem', som.html.includes('1.803.938.823 lượt xem'));
  check('co mo ta', som.html.includes('Mo ta tu InnerTube'));
  check('co video lien quan', som.html.includes('Video ke ben'));
  check(
    'khung phat bam duoc ngay, khong kem ma luong',
    som.html.includes(`<video src="/stream/${VIDEO}"`) ||
      som.html.includes(`src="/stream/${VIDEO}?k=`),
    (som.html.match(/<video[^>]*>/) || [''])[0]
  );
  check('van co duong nghe chi tieng', som.html.includes(`/audio/${VIDEO}`));
  check('chua bay hang chon do phan giai', !som.html.includes('Độ phân giải<'));

  console.log('\n2. May tinh mo som thi duoc mach cho lay muc net hon');
  const somPC = await mo(PC);
  check('co loi moi xem muc net hon', somPC.html.includes('Xem mức nét hơn'));
  check('may Nokia thi khong bay muc do ra', !som.html.includes('Xem mức nét hơn'));

  console.log('\n3. Cho yt-dlp chay xong roi mo lai');
  await new Promise((r) => setTimeout(r, YTDLP_MS));
  const day = await mo(NOKIA);
  check('lan nay tra ve ngay', day.ms < 400, `mat ${day.ms} ms`);
  check('dung ten cua yt-dlp', day.html.includes('Ten tu yt-dlp'));
  check('khung phat da co ma luong', day.html.includes(`/stream/${VIDEO}/18`));
  check('het loi moi xem muc net hon', !day.html.includes('Xem mức nét hơn'));

  const dayPC = await mo(PC);
  check('may tinh co hang chon do phan giai', dayPC.html.includes('Độ phân giải'));
  check('co muc 1080p', dayPC.html.includes('>1080p<'));

  console.log('\n4. Bon lan mo trang chi ton MOT lan goi yt-dlp');
  check('yt-dlp chi chay mot lan', ytdlpCalls === 1, `chay ${ytdlpCalls} lan`);
  check('InnerTube cung chi goi mot lan', innertubeCalls === 1, `goi ${innertubeCalls} lan`);

  // Ve som chi dang khi co cai de ve. Mat not InnerTube ma van ve ngay thi
  // duoc mot trang chi co moi chu 'Video' — luc do phai chiu doi yt-dlp.
  console.log('\n5. InnerTube hong: luc nay phai chiu cho yt-dlp');
  infoCache.map.clear();
  listCache.map.clear();
  innertube.related = async () => {
    throw new Error('InnerTube gia vo hong');
  };
  const hong = await mo(NOKIA);
  check('van doi yt-dlp cho xong', hong.ms >= YTDLP_MS - 200, `mat ${hong.ms} ms`);
  check('nen trang van co ten video', hong.html.includes('Ten tu yt-dlp'));
  check('va co ma luong', hong.html.includes(`/stream/${VIDEO}/18`));

  // YouTube doi hinh thu tra loi thi InnerTube van 200 nhung khong con doc ra
  // duoc gi — cung phai coi la khong co gi de ve.
  console.log('\n6. InnerTube tra ve nhung khong doc ra ten video');
  infoCache.map.clear();
  listCache.map.clear();
  innertube.related = async () => ({ videos: [], video: { title: '', author: '' } });
  const rong = await mo(NOKIA);
  check('cung phai doi yt-dlp', rong.ms >= YTDLP_MS - 200, `mat ${rong.ms} ms`);
  check('trang khong bi trong ten', rong.html.includes('Ten tu yt-dlp'));

  // Phan chu cua trang gio lay tu tra loi `next` cua InnerTube, ma cai do la
  // cua nguoi ta: doi hinh thu mot cai la minh doc ra rong. Day la mot manh
  // tra loi that (da cat bot), de con biet duong ma sua khi no doi.
  console.log('\n7. Doc phan chu tu tra loi cua InnerTube');
  const traLoi = {
    contents: {
      twoColumnWatchNextResults: {
        results: {
          results: {
            contents: [
              {
                videoPrimaryInfoRenderer: {
                  title: { runs: [{ text: 'Never Gonna Give You Up' }] },
                  viewCount: {
                    videoViewCountRenderer: {
                      viewCount: { simpleText: '1.803.938.823 lượt xem' },
                      shortViewCount: { simpleText: '1,8 T lượt xem' },
                    },
                  },
                },
              },
              {
                videoSecondaryInfoRenderer: {
                  owner: { videoOwnerRenderer: { title: { runs: [{ text: 'Rick Astley' }] } } },
                  attributedDescription: { content: 'Dong mot\nDong hai' },
                },
              },
            ],
          },
        },
      },
    },
  };
  const fetchThat = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => traLoi });
  const doc = await relatedThat('mauTraLoi0');
  globalThis.fetch = fetchThat;

  check('doc duoc ten video', doc.video.title === 'Never Gonna Give You Up', doc.video.title);
  check('doc duoc ten kenh', doc.video.author === 'Rick Astley', doc.video.author);
  check('doc duoc mo ta', doc.video.description === 'Dong mot\nDong hai');
  // Ban rut gon cua tieng Viet la '1,8 T' — lay nham cai do la mat ca ty luot xem.
  check(
    'lay so luot xem day du, khong lay ban rut gon',
    doc.video.views === '1.803.938.823 lượt xem',
    doc.video.views
  );

  console.log(`\nDat ${passed}, hong ${failed}`);
  process.exit(failed ? 1 : 0);
}, 400);
