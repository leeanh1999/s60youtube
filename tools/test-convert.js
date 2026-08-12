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

const VIDEO_ID = 'TESTvideo01';

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
function serveFile(file) {
  const size = fs.statSync(file).size;
  const server = http.createServer((req, res) => {
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

(async () => {
  if (!media.isAvailable()) {
    console.log('Khong tim thay ffmpeg — khong kiem thu duoc phan chuyen ma.');
    process.exit(1);
  }

  console.log('1. Dung doan phim mau roi don qua HTTP');
  const source = path.join(WORK, 'nguon.mp4');
  execFileSync(
    media.FFMPEG,
    [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=25:duration=2',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-shortest', source,
    ],
    { stdio: 'pipe' }
  );
  check('tao duoc file nguon', fs.existsSync(source) && fs.statSync(source).size > 0);

  const server = await serveFile(source);
  const url = `http://127.0.0.1:${server.address().port}/nguon.mp4`;
  check('may chu mau da chay', Boolean(server.address().port));

  console.log('2. Ban nhe 640x360 cho Belle');
  const belle = await waitFor(
    media.startJob({ videoId: VIDEO_ID, profileId: 'belle', sources: [url], duration: 2 })
  );
  check('chuyen ma xong', belle.status === 'done', belle.error || '');
  if (belle.status === 'done') {
    const info = streamInfo(belle.file);
    check('file khong rong', fs.statSync(belle.file).size > 0);
    check('co luong hinh H.264', /Video: h264/.test(info), info.trim());
    check('dung Baseline cho Symbian', /h264 \((Constrained )?Baseline\)/.test(info));
    check('dung co 640x360', /640x360/.test(info));
    check('co luong tieng AAC', /Audio: aac/.test(info));
    check('moov nam dau file', firstBoxes(belle.file).includes('moov'));
  }

  console.log('3. Chi tieng .m4a');
  const audio = await waitFor(
    media.startJob({ videoId: VIDEO_ID, profileId: 'audio', sources: [url], duration: 2 })
  );
  check('chuyen ma xong', audio.status === 'done', audio.error || '');
  if (audio.status === 'done') {
    const info = streamInfo(audio.file);
    check('file mang duoi .m4a', audio.file.endsWith('.m4a'));
    check('co luong tieng AAC', /Audio: aac/.test(info), info.trim());
    check('da bo luong hinh', !/Video:/.test(info));
  }

  console.log('4. Goi lai thi dung file da co, khong chay ffmpeg lan nua');
  const again = media.startJob({
    videoId: VIDEO_ID,
    profileId: 'belle',
    sources: [url],
    duration: 2,
  });
  check('bao xong ngay', again.status === 'done');
  check('van la file cu', again.file === belle.file);

  server.close();
  fs.rmSync(WORK, { recursive: true, force: true });

  console.log(`\nDat ${passed}, hong ${failed}`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error('Kiem thu do vo:', err.message);
  fs.rmSync(WORK, { recursive: true, force: true });
  process.exit(1);
});
