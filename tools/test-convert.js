'use strict';

// Kiem thu that su duong chuyen ma: dung mot doan phim mau, don no qua HTTP
// giong nhu YouTube van don luong, roi de lib/media goi ffmpeg y het luc chay
// that. Cac trang web khac khong dong toi duong nay nen no rat de hong am tham.

const { execFileSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

// Phai dat truoc khi nap lib/config, vi no doc bien nay ngay luc duoc nap.
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 's60-convert-'));
process.env.DATA_DIR = WORK;

const media = require('../lib/media');

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

/** ffmpeg khong co file ra thi thoat voi ma loi, nhung van in ro cac luong. */
function streamInfo(file) {
  try {
    execFileSync(media.FFMPEG, ['-hide_banner', '-i', file], { stdio: 'pipe' });
    return '';
  } catch (err) {
    return String(err.stderr || '');
  }
}

/**
 * MP4 gom cac "box": 4 byte do dai roi 4 byte ten. Trinh phat chi bat dau phat
 * som duoc khi box "moov" nam ngay dau file — do la viec cua -movflags faststart.
 */
function firstBoxes(file) {
  const buffer = Buffer.alloc(64);
  const fd = fs.openSync(file, 'r');
  fs.readSync(fd, buffer, 0, buffer.length, 0);
  fs.closeSync(fd);

  const names = [];
  let at = 0;
  while (at + 8 <= buffer.length) {
    const size = buffer.readUInt32BE(at);
    names.push(buffer.toString('latin1', at + 4, at + 8));
    if (size < 8) break;
    at += size;
  }
  return names;
}

/** May chu gia lap YouTube: co Accept-Ranges de ffmpeg tua duoc nhu ngoai doi. */
function serveFiles(files) {
  const server = http.createServer((req, res) => {
    const file = files[req.url];
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    const size = fs.statSync(file).size;
    const match = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (match) {
      const start = Number(match[1] || 0);
      const end = match[2] ? Number(match[2]) : size - 1;
      res.writeHead(206, {
        'Content-Type': 'video/mp4',
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': size,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function waitFor(job, timeoutMs = 180000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (job.status === 'done' || job.status === 'error') {
        resolve(job);
      } else if (Date.now() - started > timeoutMs) {
        reject(new Error(`cho qua lau, van dang "${job.status}"`));
      } else {
        setTimeout(tick, 200);
      }
    };
    tick();
  });
}

function makeSample(args, file) {
  execFileSync(media.FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args, file], {
    stdio: 'pipe',
  });
  return file;
}

(async () => {
  if (!media.isAvailable()) {
    console.log('Khong tim thay ffmpeg — khong kiem thu duoc phan chuyen ma.');
    process.exit(1);
  }

  console.log('1. Dung cac doan mau giong luong YouTube roi don qua HTTP');
  // Giong itag 133: chi hinh, 240p, H.264 Main profile.
  const videoOnly = makeSample(
    [
      '-f', 'lavfi', '-i', 'testsrc=size=426x240:rate=25:duration=2',
      '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'main',
      '-pix_fmt', 'yuv420p', '-an',
    ],
    path.join(WORK, 'hinh240.mp4')
  );
  // Giong itag 140: chi tieng, AAC trong vo MP4.
  const audioOnly = makeSample(
    ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'aac', '-vn'],
    path.join(WORK, 'tieng.m4a')
  );
  // Giong itag 18: hinh va tieng gop san — duong lui khi phai ma hoa that.
  const progressive = makeSample(
    [
      '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=2',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
      '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-shortest',
    ],
    path.join(WORK, 'gop.mp4')
  );
  check('tao duoc ba doan mau', [videoOnly, audioOnly, progressive].every(
    (f) => fs.existsSync(f) && fs.statSync(f).size > 0
  ));

  const server = await serveFiles({
    '/hinh240.mp4': videoOnly,
    '/tieng.m4a': audioOnly,
    '/gop.mp4': progressive,
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  check('may chu mau da chay', Boolean(server.address().port));

  console.log('2. Ban nhe: ghep vo chua, khong ma hoa lai');
  const remux = await waitFor(
    media.startJob({
      videoId: 'TESTremux01',
      profileId: 'belle',
      sources: [`${base}/hinh240.mp4`, `${base}/tieng.m4a`],
      duration: 2,
      copy: true,
    })
  );
  check('ghep xong', remux.status === 'done', remux.error || '');
  if (remux.status === 'done') {
    const info = streamInfo(remux.file);
    check('co luong hinh H.264', /Video: h264/.test(info), info.trim());
    check('giu nguyen co 426x240', /426x240/.test(info));
    // Duong ma hoa luon ep ve Baseline. Con nguyen Main tuc la ffmpeg da chep
    // thang chu khong ma hoa lai — do moi la cho nhanh.
    check('giu nguyen Main profile, tuc la khong ma hoa lai', /h264 \(Main\)/.test(info));
    check('co luong tieng AAC', /Audio: aac/.test(info));
    check('moov nam dau file', firstBoxes(remux.file).includes('moov'));
  }

  console.log('3. Chi tieng: chep thang luong AAC');
  const audio = await waitFor(
    media.startJob({
      videoId: 'TESTaudio01',
      profileId: 'audio',
      sources: [`${base}/tieng.m4a`],
      duration: 2,
      copy: true,
    })
  );
  check('ghep xong', audio.status === 'done', audio.error || '');
  if (audio.status === 'done') {
    const info = streamInfo(audio.file);
    check('file mang duoi .m4a', audio.file.endsWith('.m4a'));
    check('co luong tieng AAC', /Audio: aac/.test(info), info.trim());
    check('da bo luong hinh', !/Video:/.test(info));
  }

  console.log('4. Duong lui: ma hoa that khi khong co ban H.264 dung y');
  const encoded = await waitFor(
    media.startJob({
      videoId: 'TESTencode1',
      profileId: 'belle',
      sources: [`${base}/gop.mp4`],
      duration: 2,
    })
  );
  check('ma hoa xong', encoded.status === 'done', encoded.error || '');
  if (encoded.status === 'done') {
    const info = streamInfo(encoded.file);
    check('ha xuong 426x240', /426x240/.test(info), info.trim());
    check('ep ve Baseline', /h264 \((Constrained )?Baseline\)/.test(info));
    check('co luong tieng AAC', /Audio: aac/.test(info));
    check('moov nam dau file', firstBoxes(encoded.file).includes('moov'));
  }

  console.log('5. Xem thang o do phan giai cao: ghep ra duong truyen');
  const piped = path.join(WORK, 'thang.mp4');
  const writer = fs.createWriteStream(piped);
  const live = media.remuxStream(`${base}/hinh240.mp4`, `${base}/tieng.m4a`);
  let liveErr = '';
  live.stderr.on('data', (chunk) => {
    liveErr += chunk;
  });
  live.stdout.pipe(writer);
  // Hai viec ket thuc khong theo thu tu nao ca: ffmpeg thoat, va file ghi xong.
  // Phai doi ca hai thi moi vua biet ma thoat vua doc duoc file.
  const liveCode = await new Promise((resolve) => {
    let code = null;
    let written = false;
    const both = () => {
      if (code !== null && written) resolve(code);
    };
    live.on('close', (value) => {
      code = value;
      both();
    });
    writer.on('finish', () => {
      written = true;
      both();
    });
  });
  check('ffmpeg chay tron', liveCode === 0, liveErr.trim());
  check('co du lieu ra', fs.existsSync(piped) && fs.statSync(piped).size > 0);
  if (fs.existsSync(piped) && fs.statSync(piped).size > 0) {
    const info = streamInfo(piped);
    check('co luong hinh H.264', /Video: h264/.test(info), info.trim());
    check('giu nguyen Main profile, tuc la chi chep chu khong ma hoa', /h264 \(Main\)/.test(info));
    check('co luong tieng AAC', /Audio: aac/.test(info));
    // Vo phan manh: 'moov' rong nam ngay dau (khong doi ghi xong ca file), roi
    // du lieu di theo tung manh 'moof'. Thieu cai nay thi byte dau tien chi ra
    // khi ffmpeg da tai xong het — tuc la khong con "bam la chay" nua.
    check('moov nam dau file', firstBoxes(piped).includes('moov'));
    check(
      'co manh moof, tuc la vo MP4 phan manh',
      fs.readFileSync(piped).includes('moof')
    );
  }

  console.log('6. Goi lai thi dung file da co, khong chay ffmpeg lan nua');
  const again = media.startJob({
    videoId: 'TESTremux01',
    profileId: 'belle',
    sources: [`${base}/hinh240.mp4`, `${base}/tieng.m4a`],
    duration: 2,
    copy: true,
  });
  check('bao xong ngay', again.status === 'done');
  check('van la file cu', again.file === remux.file);

  server.close();
  fs.rmSync(WORK, { recursive: true, force: true });

  console.log(`\nDat ${passed}, hong ${failed}`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error('Kiem thu do vo:', err.message);
  fs.rmSync(WORK, { recursive: true, force: true });
  process.exit(1);
});
