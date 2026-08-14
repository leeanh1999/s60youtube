'use strict';

// YouTube dang thu nghiem mot kieu khoa: mot phan cac lan hoi tra ve lo dia chi
// chi phat duoc 60 giay dau, ca lo — ke ca ban gop san 360p cua may Nokia. Ta
// chua duoc bang cach hoi lai yt-dlp cho toi khi ra lo dung.
//
// Cho nay khong the goi YouTube that de kiem (lan boc tham nao ra khoa la
// chuyen may rui), nen dung mot may chu nho ngay tren may: no bat chuoc dung
// cach googlevideo cu xu voi lo bi khoa.

process.env.PORT = '8095';

const http = require('http');

const ytdlp = require('../lib/ytdlp');

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

const CA_FILE = 3_000_000;
// Dung ty le that: 60 giay dau cua mot video 300 giay la mot phan nam file.
const CHO_PHEP = Math.floor(CA_FILE / 5);

/**
 * May chu gia lam googlevideo. Duong /khoa cu xu y het lo bi khoa: xin ca file
 * la 403, xin doan trong mot phut dau thi cho, xin doan xa hon cung 403.
 */
function moMayChu() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const khoa = req.url.startsWith('/khoa');
      const range = /bytes=(\d+)-/.exec(req.headers.range || '');
      const tu = range ? Number(range[1]) : 0;

      if (khoa && (!range || tu >= CHO_PHEP)) {
        res.writeHead(403).end();
        return;
      }
      const den = Math.min(range ? tu + 65535 : CA_FILE - 1, CA_FILE - 1);
      res.writeHead(range ? 206 : 200, {
        'Content-Type': 'video/mp4',
        'Content-Length': String(den - tu + 1),
        ...(range ? { 'Content-Range': `bytes ${tu}-${den}/${CA_FILE}` } : {}),
      });
      res.end(Buffer.alloc(den - tu + 1));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const VIDEO = 'videothu001';

/** Mot lo dia chi nhu yt-dlp tra ve: gop san 360p, hinh rieng, tieng rieng. */
function lo(goc, kieu) {
  const url = (ten) => `${goc}/${kieu}/${ten}`;
  return {
    id: VIDEO,
    title: 'Phim thu',
    author: 'Kenh thu',
    duration: 300,
    views: 1,
    likes: 0,
    uploadDate: '',
    description: '',
    isLive: false,
    formats: [
      { id: '18', ext: 'mp4', url: url('18'), width: 640, height: 360, fps: 25,
        vcodec: 'avc1.42001E', acodec: 'mp4a.40.2', abr: 96, tbr: 600,
        filesize: CA_FILE, protocol: 'https', note: '360p' },
      { id: '137', ext: 'mp4', url: url('137'), width: 1920, height: 1080, fps: 25,
        vcodec: 'avc1.640028', acodec: null, abr: 0, tbr: 4000,
        filesize: CA_FILE, protocol: 'https', note: '1080p' },
      { id: '140', ext: 'm4a', url: url('140'), width: 0, height: 0, fps: 0,
        vcodec: null, acodec: 'mp4a.40.2', abr: 128, tbr: 128,
        filesize: CA_FILE, protocol: 'https', note: 'tieng' },
    ],
  };
}

(async () => {
  const server = await moMayChu();
  const goc = `http://127.0.0.1:${server.address().port}`;

  console.log('1. Nhan ra lo dia chi bi khoa o giay 60');
  check('lo dung: xin ca file duoc', await ytdlp.servesWholeFile(`${goc}/mo/18`));
  check('lo khoa: xin ca file bi tu choi', !(await ytdlp.servesWholeFile(`${goc}/khoa/18`)));
  check(
    'dia chi khong goi duoc thi coi nhu dung, khong hoi lai cho ton thoi gian',
    await ytdlp.servesWholeFile('http://127.0.0.1:1/khong-co-ai')
  );

  console.log('\n2. Roi vao lo khoa thi hoi lai yt-dlp');
  {
    let lanHoi = 0;
    const ask = async () => {
      lanHoi += 1;
      return lo(goc, lanHoi < 3 ? 'khoa' : 'mo');
    };
    const info = await ytdlp.fetchInfo(VIDEO, null, ask);
    check('hoi lai cho toi khi ra lo dung', lanHoi === 3, `(hoi ${lanHoi} lan)`);
    check('tra ve dung lo mo duoc', info.formats[0].url.includes('/mo/'));
  }

  console.log('\n3. Lo dau da dung thi khong hoi lai lan nao nua');
  {
    let lanHoi = 0;
    const ask = async () => {
      lanHoi += 1;
      return lo(goc, 'mo');
    };
    await ytdlp.fetchInfo(VIDEO, null, ask);
    check('chi goi yt-dlp mot lan', lanHoi === 1, `(hoi ${lanHoi} lan)`);
  }

  console.log('\n4. Lan nao cung khoa: van tra ve, xem duoc mot phut hon la khong gi');
  {
    let lanHoi = 0;
    const ask = async () => {
      lanHoi += 1;
      return lo(goc, 'khoa');
    };
    const info = await ytdlp.fetchInfo(VIDEO, null, ask);
    check('thu dung ba lan roi thoi', lanHoi === 3, `(hoi ${lanHoi} lan)`);
    check('van co danh sach luong de phat', info.formats.length === 3);
  }

  console.log('\n5. Chi rieng ban gop san chet, ca lo con lai van tot');
  {
    // Co video (nhat la video cu) ca lo dia chi con dung ma rieng ban gop san
    // 360p bi tu choi. Do la duong may Nokia phat, nen van phai hoi lai.
    let lanHoi = 0;
    const ask = async () => {
      lanHoi += 1;
      const batch = lo(goc, 'mo');
      if (lanHoi < 2) batch.formats[0].url = `${goc}/khoa/18`;
      return batch;
    };
    const info = await ytdlp.fetchInfo(VIDEO, null, ask);
    check('hoi lai khi ban gop san chet', lanHoi === 2, `(hoi ${lanHoi} lan)`);
    check('ban gop san tra ve da song', info.formats[0].url.includes('/mo/'));
  }

  console.log('\n6. Buoi phat truc tiep thi khong thu kieu nay');
  {
    let lanHoi = 0;
    const ask = async () => {
      lanHoi += 1;
      const truc = lo(goc, 'khoa');
      truc.isLive = true;
      return truc;
    };
    await ytdlp.fetchInfo(VIDEO, null, ask);
    check('khong hoi lai cho luong truc tiep', lanHoi === 1, `(hoi ${lanHoi} lan)`);
  }

  console.log('\n7. Dia chi chet luc dang phat: may chu tu hoi lai, khong de trinh phat chiu');
  {
    // Ban trong bo nho dem con han nhung dia chi trong do da chet — chuyen nay
    // xay ra khi trang video mo tu truoc do vai phut.
    let lanHoiLai = 0;
    ytdlp.getInfo = async () => lo(goc, 'khoa');
    ytdlp.refreshInfo = async () => {
      lanHoiLai += 1;
      return lo(goc, 'mo');
    };
    require('../server.js');
    await new Promise((r) => setTimeout(r, 400));

    const res = await fetch(`http://127.0.0.1:8095/stream/${VIDEO}/18`);
    const body = await res.arrayBuffer();
    check('trinh phat van nhan duoc luong', res.status === 200, `(HTTP ${res.status})`);
    check('va nhan du byte', body.byteLength === CA_FILE, `(${body.byteLength} byte)`);
    check('may chu co hoi lai dung mot lan', lanHoiLai === 1, `(hoi lai ${lanHoiLai} lan)`);
  }

  server.close();
  console.log(`\nDat ${passed}, hong ${failed}`);
  process.exit(failed ? 1 : 0);
})();
