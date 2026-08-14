'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const config = require('./config');

/**
 * Cau hinh chuyen ma. H.264 Baseline + AAC-LC la thu ma trinh phat Belle doc
 * duoc chac chan nhat: khong B-frame, 1 reference frame, yuv420p.
 *
 * Day chi la duong lui. Duong chinh la xem thang online qua /stream va nghe
 * thang qua /audio, ca hai deu khong dung toi ffmpeg.
 *
 * Cac tham so "video"/"audio" duoi day chi dung khi buoc phai ma hoa that (video
 * khong co ban H.264 nao). Truong hop thuong gap thi chi ghep vo chua bang
 * -c copy, luc do chung khong duoc dung toi.
 */
const PROFILES = {
  belle: {
    label: 'Bản nhẹ 240p — khi xem online bị giật',
    ext: 'mp4',
    mux: 'mp4',
    maxHeight: 240,
    video: ['-vf', 'scale=426:-2', '-r', '20', '-b:v', '300k', '-level', '2.1'],
    audio: ['-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-ar', '44100'],
  },
  // YouTube chi con giu ban gop san toi 360p cho phan lon video, nen may doi
  // moi muon xem 720p thi phai ghep. Gan nhu lan nao cung la ghep vo chua bang
  // -c copy (luong hinh H.264 720p va luong tieng AAC deu co san) — chep du
  // lieu chu khong ma hoa, nen NAS yeu van lam duoc trong vai giay.
  //
  // Muc nay chi hien o trang video khi nguoi dung da chon xem 720p trong Cai
  // dat: may Symbian de mac dinh 360p thi khong phai luot qua no.
  hd: {
    label: 'Bản 720p — máy đời mới',
    ext: 'mp4',
    mux: 'mp4',
    maxHeight: 720,
    needsHeight: 720,
    video: ['-vf', 'scale=1280:-2', '-b:v', '1500k', '-level', '3.1'],
    audio: ['-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100'],
  },
  audio: {
    label: 'Chỉ tiếng (.m4a) — nghe nhạc, tốn ít dung lượng',
    ext: 'm4a',
    // "ipod" la ten muxer cua ffmpeg cho .m4a — van la MP4 nhung chi co tieng.
    mux: 'ipod',
    audioOnly: true,
    audio: ['-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-ar', '44100'],
  },
};

function resolveFfmpeg() {
  // Trong Docker thi ffmpeg cai san theo he dieu hanh, chi ro qua bien moi truong.
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;

  const local = path.join(
    config.ROOT,
    'bin',
    process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  );
  if (fs.existsSync(local)) return local;

  try {
    const bundled = require('ffmpeg-static');
    if (bundled && fs.existsSync(bundled)) return bundled;
  } catch {
    // khong cai ffmpeg-static (vi du trong Docker) — dung ban cua he dieu hanh
  }
  return 'ffmpeg';
}

const FFMPEG = resolveFfmpeg();
let ffmpegReady = null;

function isAvailable() {
  if (ffmpegReady !== null) return ffmpegReady;
  try {
    require('child_process').execFileSync(FFMPEG, ['-version'], {
      stdio: 'ignore',
      timeout: 15000,
    });
    ffmpegReady = true;
  } catch {
    ffmpegReady = false;
  }
  return ffmpegReady;
}

/**
 * Anh thu nho hien tren trang chi rong khoang 160 diem (8em, xem s60.css), ma
 * ban mqdefault cua YouTube rong 320: may tai gap boi so byte can thiet roi con
 * phai thu nho lai bang chinh con chip 680MHz cua no. Thu san bang ffmpeg thi
 * moi anh chi con chung mot phan ba, va may chi phai giai ma dung so diem no ve.
 *
 * Thu la viec them: khong co ffmpeg, hoac ffmpeg tra ve thu gi khong phai JPEG,
 * thi cu dung anh goc — thua byte chu khong mat anh.
 *
 * @param {Buffer} buffer anh JPEG goc
 * @param {number} width be ngang muon co; 192 la du cho ca co chu "Rat lon"
 */
function shrinkJpeg(buffer, width = 192) {
  return new Promise((resolve) => {
    if (!isAvailable()) {
      resolve(null);
      return;
    }
    const child = spawn(
      FFMPEG,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'pipe:0',
        // -2 de chieu cao tu tinh theo ti le va luon la so chan.
        '-vf',
        `scale=${width}:-2`,
        '-q:v',
        '5',
        '-f',
        'mjpeg',
        'pipe:1',
      ],
      { windowsHide: true }
    );

    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.resume();
    child.on('error', () => resolve(null));
    // Anh be hon mot goi tin thi ffmpeg co the da bo cuoc giua duong.
    child.stdin.on('error', () => resolve(null));
    child.on('close', (code) => {
      const out = Buffer.concat(chunks);
      // FF D8 la hai byte mo dau cua moi file JPEG.
      const ok =
        code === 0 &&
        out.length > 512 &&
        out.length < buffer.length &&
        out[0] === 0xff &&
        out[1] === 0xd8;
      resolve(ok ? out : null);
    });
    child.stdin.end(buffer);
  });
}

fs.mkdirSync(config.CACHE_DIR, { recursive: true });

/** job: { key, status, progress, error, file, startedAt } */
const jobs = new Map();
const queue = [];
let running = 0;

function jobKey(videoId, profileId) {
  return `${videoId}_${profileId}`;
}

function outputPath(videoId, profileId) {
  const profile = PROFILES[profileId];
  return path.join(config.CACHE_DIR, `${jobKey(videoId, profileId)}.${profile.ext}`);
}

function inputArgs(url) {
  return [
    '-user_agent',
    config.DESKTOP_UA,
    '-reconnect',
    '1',
    '-reconnect_streamed',
    '1',
    '-reconnect_delay_max',
    '5',
    '-i',
    url,
  ];
}

/**
 * @param copy Luong nguon da dung chuan Belle doc duoc, chi can ghep lai vo
 *   chua. Chep du lieu thay vi ma hoa nen nhanh gap boi tren NAS chip ARM.
 */
function buildArgs(profile, sources, target, copy) {
  const args = ['-hide_banner', '-loglevel', 'error', '-stats', '-y'];
  for (const url of sources) args.push(...inputArgs(url));

  if (copy) {
    args.push('-c', 'copy');
    if (profile.audioOnly) args.push('-vn');
  } else if (profile.audioOnly) {
    args.push('-vn', ...profile.audio);
  } else {
    args.push(
      '-c:v',
      'libx264',
      '-profile:v',
      'baseline',
      '-preset',
      config.FFMPEG_PRESET,
      '-bf',
      '0',
      '-refs',
      '1',
      '-pix_fmt',
      'yuv420p',
      '-g',
      '50',
      ...profile.video,
      ...profile.audio
    );
  }

  if (!profile.audioOnly && sources.length === 2) {
    args.push('-map', '0:v:0', '-map', '1:a:0');
  }
  // Ghi ra file tam ".part" nen phai noi ro dinh dang: ffmpeg doan muxer theo
  // duoi file, ma ".part" thi no khong biet la gi va bo cuoc ngay tu dau.
  args.push('-movflags', '+faststart', '-f', profile.mux, target);
  return args;
}

function pump() {
  while (running < config.MAX_JOBS && queue.length) {
    const job = queue.shift();
    running += 1;
    execute(job).finally(() => {
      running -= 1;
      pump();
    });
  }
}

function execute(job) {
  return new Promise((resolve) => {
    job.status = 'running';
    job.startedAt = Date.now();
    const temp = `${job.file}.part`;
    const args = buildArgs(job.profile, job.sources, temp, job.copy);
    const child = spawn(FFMPEG, args, { windowsHide: true });
    job.child = child;
    let stderrTail = '';

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderrTail = (stderrTail + text).slice(-2000);
      const match = /time=(\d+):(\d+):(\d+)/.exec(text);
      if (match && job.duration > 0) {
        const done = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
        job.progress = Math.min(99, Math.round((done / job.duration) * 100));
      }
    });

    child.on('error', (err) => {
      job.status = 'error';
      job.error = `Khong chay duoc ffmpeg: ${err.message}`;
      resolve();
    });

    child.on('close', (code) => {
      job.child = null;
      if (code === 0 && fs.existsSync(temp)) {
        try {
          fs.renameSync(temp, job.file);
          job.status = 'done';
          job.progress = 100;
          job.size = fs.statSync(job.file).size;
        } catch (err) {
          job.status = 'error';
          job.error = err.message;
        }
      } else {
        job.status = 'error';
        job.error = stderrTail.split('\n').filter(Boolean).slice(-2).join(' ') ||
          `ffmpeg thoat voi ma ${code}`;
        fs.rmSync(temp, { force: true });
      }
      resolve();
    });
  });
}

/** Tao (hoac lay lai) job chuyen ma. Tra ve trang thai hien tai. */
function startJob({ videoId, profileId, sources, duration, copy = false }) {
  const profile = PROFILES[profileId];
  if (!profile) throw new Error(`Khong co cau hinh "${profileId}"`);

  const key = jobKey(videoId, profileId);
  const file = outputPath(videoId, profileId);

  if (fs.existsSync(file)) {
    const existing = jobs.get(key);
    if (!existing || existing.status !== 'running') {
      const done = {
        key,
        videoId,
        profileId,
        profile,
        file,
        status: 'done',
        progress: 100,
        size: fs.statSync(file).size,
      };
      jobs.set(key, done);
      return done;
    }
  }

  const existing = jobs.get(key);
  if (existing && (existing.status === 'queued' || existing.status === 'running')) {
    return existing;
  }

  const job = {
    key,
    videoId,
    profileId,
    profile,
    file,
    sources,
    duration,
    copy,
    status: 'queued',
    progress: 0,
    error: null,
    queuedAt: Date.now(),
  };
  jobs.set(key, job);
  queue.push(job);
  pump();
  return job;
}

function getJob(videoId, profileId) {
  const key = jobKey(videoId, profileId);
  const job = jobs.get(key);
  if (job) return job;
  const file = outputPath(videoId, profileId);
  if (fs.existsSync(file)) {
    const done = {
      key,
      videoId,
      profileId,
      profile: PROFILES[profileId],
      file,
      status: 'done',
      progress: 100,
      size: fs.statSync(file).size,
    };
    jobs.set(key, done);
    return done;
  }
  return null;
}

function queuePosition(job) {
  const index = queue.indexOf(job);
  return index < 0 ? 0 : index + 1;
}

/** Don file cu de o cung khong day. */
function cleanup() {
  let entries;
  try {
    entries = fs.readdirSync(config.CACHE_DIR);
  } catch {
    return;
  }
  const cutoff = Date.now() - config.CONVERT_TTL_MS;
  for (const name of entries) {
    const full = path.join(config.CACHE_DIR, name);
    try {
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) {
        fs.rmSync(full, { force: true });
        for (const [key, job] of jobs) {
          if (job.file === full) jobs.delete(key);
        }
      }
    } catch {
      // bo qua file dang duoc ghi
    }
  }
}

module.exports = {
  PROFILES,
  FFMPEG,
  isAvailable,
  shrinkJpeg,
  startJob,
  getJob,
  queuePosition,
  cleanup,
};
