'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const config = require('./config');

/**
 * Cau hinh chuyen ma — chi con nhung muc dung duoc tren Symbian Belle.
 * H.264 Baseline + AAC-LC la thu ma trinh phat Belle doc duoc chac chan nhat:
 * khong B-frame, 1 reference frame, yuv420p.
 *
 * Day chi la duong lui khi YouTube khong con MP4 gop san, hoac khi mang yeu.
 * Duong chinh la xem thang online qua /stream, khong dung toi ffmpeg.
 */
const PROFILES = {
  belle: {
    label: '640x360 — bản nhẹ cho Belle',
    ext: 'mp4',
    mux: 'mp4',
    maxHeight: 480,
    video: ['-vf', 'scale=640:-2', '-r', '25', '-b:v', '700k', '-level', '3.0'],
    audio: ['-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-ar', '44100'],
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

function buildArgs(profile, sources, target) {
  const args = ['-hide_banner', '-loglevel', 'error', '-stats', '-y'];
  for (const url of sources) args.push(...inputArgs(url));

  if (profile.audioOnly) {
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
    if (sources.length === 2) args.push('-map', '0:v:0', '-map', '1:a:0');
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
    const args = buildArgs(job.profile, job.sources, temp);
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
function startJob({ videoId, profileId, sources, duration }) {
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
  startJob,
  getJob,
  queuePosition,
  cleanup,
};
