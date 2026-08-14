'use strict';

/**
 * Kiem thu trinh phat do phan giai cao (public/hd.js) — khong can trinh duyet,
 * khong can YouTube.
 *
 * Cho nay rat de hong am tham: no chi chay tren may doi moi, chi khi chon muc
 * cao, va hong thi tu lui ve duong /hd nen nhin ben ngoai van "co video". Nen
 * dung mot doan phim mau co bang chi muc sidx y nhu luong DASH cua YouTube, don
 * qua HTTP that (co Range), roi chay chinh file hd.js tren mot may gia.
 *
 * Bang chi muc trong bai thu nay duoc doc lai bang mot bo doc RIENG viet trong
 * chinh file nay, khong goi vao hd.js: co the doc doc lap thi moi bat duoc loi
 * cua bo doc that. May gia cung khong nhan bua doan nao — moi mieng hd.js nap
 * vao phai trung tung byte voi mot doan that trong file, khong thi bao sai.
 */

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const vm = require('vm');

const media = require('../lib/media');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'hd.js'), 'utf8');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 's60-hd-'));

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

// ---------- doan phim mau: giong luong DASH cua YouTube ----------

function makeSample(args, name) {
  const file = path.join(WORK, name);
  execFileSync(
    media.FFMPEG,
    [
      '-hide_banner', '-loglevel', 'error', '-y',
      ...args,
      // Dung bo co nay YouTube moi co: file chia san thanh manh, va co mot bang
      // chi muc 'sidx' duy nhat nam ngay sau moov.
      '-movflags', '+frag_keyframe+empty_moov+default_base_moof+global_sidx',
      '-frag_duration', '4000000',
      file,
    ],
    { stdio: 'pipe' }
  );
  return file;
}

/** Bo doc bang chi muc viet rieng cho bai thu, de doi chieu voi bo doc that. */
function readTable(file) {
  const bytes = fs.readFileSync(file);
  let at = 0;
  while (at + 8 <= bytes.length) {
    const size = bytes.readUInt32BE(at);
    if (bytes.toString('latin1', at + 4, at + 8) === 'sidx') break;
    at += size;
  }
  const sidxAt = at;
  const sidxSize = bytes.readUInt32BE(at);
  let p = at + 8;
  const version = bytes[p];
  p += 8; // version + co, roi reference_ID
  const timescale = bytes.readUInt32BE(p);
  p += 4;
  let firstOffset;
  if (version === 0) {
    p += 4;
    firstOffset = bytes.readUInt32BE(p);
    p += 4;
  } else {
    p += 8;
    firstOffset = Number(bytes.readBigUInt64BE(p));
    p += 8;
  }
  p += 2;
  const count = bytes.readUInt16BE(p);
  p += 2;

  const segments = [];
  let pos = sidxAt + sidxSize + firstOffset;
  let ticks = 0;
  for (let i = 0; i < count; i++) {
    const length = bytes.readUInt32BE(p) & 0x7fffffff;
    const span = bytes.readUInt32BE(p + 4);
    p += 12;
    segments.push({
      index: i,
      start: pos,
      end: pos + length - 1,
      time: ticks / timescale,
      seconds: span / timescale,
    });
    pos += length;
    ticks += span;
  }
  return { bytes, init: bytes.subarray(0, sidxAt), segments };
}

/** May chu mau: co Range de hd.js xin duoc tung doan, y nhu YouTube. */
function serve(files) {
  const server = http.createServer((req, res) => {
    const file = files[req.url];
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    const size = fs.statSync(file).size;
    const match = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    const start = match ? Number(match[1] || 0) : 0;
    const end = match ? Math.min(match[2] ? Number(match[2]) : size - 1, size - 1) : size - 1;
    res.writeHead(match ? 206 : 200, {
      'Content-Type': 'video/mp4',
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(file, { start, end }).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// ---------- may gia ----------

/**
 * Nhan dang mot mieng du lieu bang cach bam ca mieng. Bam ca mieng chu khong
 * lay vai byte dau: cac manh 'moof' giong het nhau o dau, chi khac nhau tu so
 * thu tu manh tro di — so sanh phan dau la nhan nham manh nay ra manh kia.
 */
function fingerprint(bytes) {
  return crypto.createHash('sha1').update(Buffer.from(bytes)).digest('hex');
}

function machine({
  base,
  tracks,
  supported = true,
  hasMediaSource = true,
  managed = false,
  // So lan dau tien xin doan phim se bi chan — gia canh YouTube cat ngang vi
  // may chu goi qua day (no tra 403 mot lat roi thoi).
  chanMayLan = 0,
}) {
  const known = new Map();
  for (const [kind, table] of Object.entries(tracks)) {
    known.set(fingerprint(table.init), { kind, part: 'init' });
    for (const segment of table.segments) {
      known.set(fingerprint(table.bytes.subarray(segment.start, segment.end + 1)), {
        kind,
        part: 'segment',
        segment,
      });
    }
  }

  const log = { fetches: [], appends: [], strays: 0, blocked: 0, warns: [] };
  const handlers = {};
  const buffers = {};
  let pending = null;

  const video = {
    attrs: {
      'data-h': '720',
      'data-len': '60',
      'data-v': `${base}/hinh.mp4`,
      'data-vt': 'video/mp4; codecs="avc1.4d401e"',
      'data-a': `${base}/tieng.m4a`,
      'data-at': 'audio/mp4; codecs="mp4a.40.2"',
      src: '/hd/demo/720',
    },
    currentTime: 0,
    getAttribute: (name) => (name in video.attrs ? video.attrs[name] : null),
    removeAttribute: (name) => {
      delete video.attrs[name];
    },
    querySelector: () => ({ parentNode: { removeChild: () => {} } }),
    addEventListener: (name, fn) => {
      (handlers[name] = handlers[name] || []).push(fn);
    },
  };
  Object.defineProperty(video, 'src', {
    get: () => video.attrs.src,
    set: (value) => {
      video.attrs.src = value;
      if (String(value).indexOf('blob:') === 0 && pending) {
        const source = pending;
        setTimeout(() => {
          source.readyState = 'open';
          (source.opened || []).forEach((fn) => fn());
        }, 0);
      }
    },
  });

  const note = { innerHTML: '' };

  function sourceBuffer(mime, source) {
    const kind = mime.indexOf('audio/') === 0 ? 'audio' : 'video';
    const table = tracks[kind];
    const loaded = [];
    const listeners = {};
    const buffer = {
      mode: '',
      updating: false,
      addEventListener: (name, fn) => {
        (listeners[name] = listeners[name] || []).push(fn);
      },
      removeEventListener: (name, fn) => {
        listeners[name] = (listeners[name] || []).filter((f) => f !== fn);
      },
      remove: () => {},
      appendBuffer: (bytes) => {
        const found = known.get(fingerprint(bytes));
        if (!found || found.kind !== kind) {
          log.strays += 1;
        } else {
          log.appends.push({ kind, part: found.part, index: found.segment?.index });
          if (found.part === 'segment') loaded.push(found.segment);
        }
        buffer.updating = true;
        setTimeout(() => {
          buffer.updating = false;
          (listeners.updateend || []).forEach((fn) => fn());
        }, 0);
      },
      // Cac doan lien nhau gop thanh mot khoang, giong TimeRanges that: co the
      // hd.js nhay coc thi phai thanh hai khoang roi nhau.
      get buffered() {
        const sorted = loaded.slice().sort((a, b) => a.index - b.index);
        const spans = [];
        for (const segment of sorted) {
          const last = spans[spans.length - 1];
          if (last && last.to === segment.index) {
            last.to = segment.index + 1;
            last.end = segment.time + segment.seconds;
          } else {
            spans.push({
              to: segment.index + 1,
              start: segment.time,
              end: segment.time + segment.seconds,
            });
          }
        }
        return {
          length: spans.length,
          start: (i) => spans[i].start,
          end: (i) => spans[i].end,
        };
      },
    };
    buffers[kind] = buffer;
    source.buffers.push(buffer);
    return buffer;
  }

  function MediaSource() {
    this.readyState = 'closed';
    this.duration = 0;
    this.opened = [];
    this.buffers = [];
    this.addEventListener = (name, fn) => {
      if (name === 'sourceopen') this.opened.push(fn);
    };
    this.addSourceBuffer = (mime) => sourceBuffer(mime, this);
    this.endOfStream = () => {
      this.readyState = 'ended';
    };
    pending = this;
  }
  MediaSource.isTypeSupported = () => supported;

  const sandbox = {
    console: { warn: (...args) => log.warns.push(args.join(' ')) },
    setTimeout,
    Promise,
    URL: { createObjectURL: () => 'blob:demo' },
    document: {
      getElementById: (id) => (id === 'hdv' ? video : id === 'hdnote' ? note : null),
    },
    fetch: (url, options) => {
      const range = /bytes=(\d+)-(\d+)/.exec(options.headers.Range);
      const start = Number(range[1]);
      log.fetches.push({ url, start, end: Number(range[2]) });
      // Phan mo dau (byte 0) van cho qua: cho no doc duoc bang chi muc da, roi
      // moi chan luc dang keo doan phim ve.
      if (start > 0 && log.blocked < chanMayLan) {
        log.blocked += 1;
        return Promise.resolve(new Response(null, { status: 403 }));
      }
      return fetch(url, options);
    },
  };
  sandbox.window = sandbox;
  // Safari tren iPhone chi co ManagedMediaSource, khong co MediaSource.
  if (hasMediaSource) sandbox[managed ? 'ManagedMediaSource' : 'MediaSource'] = MediaSource;

  return {
    sandbox,
    video,
    note,
    log,
    fire: (name) => (handlers[name] || []).forEach((fn) => fn()),
    listening: (name) => (handlers[name] || []).length > 0,
  };
}

/** Cho toi khi khong con lan goi mang nao moi trong mot lat. */
async function settle(log, quietMs = 300, limitMs = 20000) {
  const started = Date.now();
  let seen = -1;
  let since = Date.now();
  while (Date.now() - started < limitMs) {
    if (log.fetches.length !== seen) {
      seen = log.fetches.length;
      since = Date.now();
    } else if (Date.now() - since > quietMs) {
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

// ---------- bai thu ----------

(async () => {
  if (!media.isAvailable()) {
    console.log('Khong tim thay ffmpeg — khong dung duoc doan phim mau.');
    process.exit(1);
  }

  console.log('1. Dung doan phim mau co bang chi muc, don qua HTTP');
  const videoFile = makeSample(
    [
      '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=60',
      '-c:v', 'libx264', '-preset', 'veryfast', '-g', '50',
      '-pix_fmt', 'yuv420p', '-an',
    ],
    'hinh.mp4'
  );
  const audioFile = makeSample(
    ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=60', '-c:a', 'aac', '-vn'],
    'tieng.m4a'
  );
  const tracks = { video: readTable(videoFile), audio: readTable(audioFile) };
  check(
    'file mau co bang chi muc nhieu doan',
    tracks.video.segments.length > 8 && tracks.audio.segments.length > 8,
    `hinh ${tracks.video.segments.length} doan, tieng ${tracks.audio.segments.length} doan`
  );

  const server = await serve({ '/hinh.mp4': videoFile, '/tieng.m4a': audioFile });
  const base = `http://127.0.0.1:${server.address().port}`;

  console.log('2. May doi moi: doi khung phat sang luong ghep trong may');
  const box = machine({ base, tracks });
  vm.runInNewContext(SOURCE, box.sandbox);
  await settle(box.log);

  check('da bo duong ghep cua may chu', String(box.video.src).indexOf('blob:') === 0);
  check('khong nap nham mieng nao', box.log.strays === 0, `${box.log.strays} mieng la`);
  const firstAppends = box.log.appends.filter((a) => a.part === 'init');
  check('nap phan mo dau cho ca hai luong', firstAppends.length === 2);
  // Giong preload="none" cua the <video>: mo trang thoi thi chi lay vai chuc KB
  // dau moi luong, chua keo doan phim nao ve.
  check(
    'chua bam phat thi chua tai doan nao',
    box.log.appends.every((a) => a.part === 'init')
  );

  box.fire('play');
  await settle(box.log);
  check('bam phat roi thi moi tai', box.log.appends.some((a) => a.part === 'segment'));

  const got = (kind) =>
    box.log.appends.filter((a) => a.kind === kind && a.part === 'segment').map((a) => a.index);
  check('luong hinh nap tu doan dau, khong nhay coc', String(got('video').slice(0, 4)) === '0,1,2,3');
  check('luong tieng nap tu doan dau, khong nhay coc', String(got('audio').slice(0, 4)) === '0,1,2,3');

  // Dem du 30 giay thi phai dung tay, khong keo ve ca video 60 giay.
  const ahead = (kind) => {
    const last = tracks[kind].segments[got(kind)[got(kind).length - 1]];
    return last.time + last.seconds;
  };
  check('dung lai khi da dem du, khong keo ca video ve', ahead('video') < 45 && ahead('video') >= 30,
    `dem toi giay ${ahead('video')}`);
  check('cau chu doi thanh "tua duoc"', /tua được/.test(box.note.innerHTML), box.note.innerHTML);
  check('co nghe phim tua', box.listening('seeking'));

  console.log('3. Tua toi giua video: xin dung doan chua cho do');
  const before = box.log.appends.length;
  box.video.currentTime = 46;
  box.fire('seeking');
  await settle(box.log);
  const after = box.log.appends.slice(before).filter((a) => a.part === 'segment');
  const wanted = tracks.video.segments.find((s) => 46 >= s.time && 46 < s.time + s.seconds);
  check('co xin them doan moi', after.length > 0);
  check(
    'doan dau tien xin them dung la doan chua giay 46',
    after[0] && after[0].index === wanted.index,
    `xin doan ${after[0]?.index}, can doan ${wanted.index}`
  );

  console.log('4. Byte lay ve co ghep lai thanh phim that khong');
  for (const kind of ['video', 'audio']) {
    const table = tracks[kind];
    const run = got(kind)
      .filter((index, i, all) => all.indexOf(index) === i)
      .sort((a, b) => a - b);
    const parts = [Buffer.from(table.init)];
    for (const index of run) {
      const segment = table.segments[index];
      parts.push(Buffer.from(table.bytes.subarray(segment.start, segment.end + 1)));
    }
    const file = path.join(WORK, `ghep-${kind}.mp4`);
    fs.writeFileSync(file, Buffer.concat(parts));
    let info = '';
    try {
      execFileSync(media.FFMPEG, ['-hide_banner', '-i', file], { stdio: 'pipe' });
    } catch (err) {
      info = String(err.stderr || '');
    }
    const wantedCodec = kind === 'video' ? /Video: h264/ : /Audio: aac/;
    check(`luong ${kind}: ghep lai giai duoc`, wantedCodec.test(info), info.trim().slice(-200));
  }

  console.log('5. YouTube chan mot lat giua chung: phai thu lai, khong dung hinh');
  const blocked = machine({ base, tracks, chanMayLan: 4 });
  vm.runInNewContext(SOURCE, blocked.sandbox);
  await settle(blocked.log);
  blocked.fire('play');
  await settle(blocked.log, 1200);
  const chunks = blocked.log.appends.filter((a) => a.part === 'segment');
  check('bi chan 4 lan van xin lai duoc', blocked.log.blocked === 4 && chunks.length > 0);
  check(
    'phim van chay tu doan dau, khong thung doan nao',
    String(chunks.filter((a) => a.kind === 'video').map((a) => a.index).slice(0, 3)) === '0,1,2'
  );

  console.log('6. iPhone: chi co ManagedMediaSource');
  const phone = machine({ base, tracks, managed: true });
  vm.runInNewContext(SOURCE, phone.sandbox);
  await settle(phone.log);
  phone.fire('play');
  await settle(phone.log);
  check('van doi duoc sang luong ghep trong may', String(phone.video.src).indexOf('blob:') === 0);
  check('co tat phat sang may khac', phone.video.disableRemotePlayback === true);
  check('nap duoc doan phim', phone.log.appends.some((a) => a.part === 'segment'));
  check('khong nap nham mieng nao', phone.log.strays === 0);

  console.log('7. May khong ghep duoc thi phai giu nguyen duong cua may chu');
  for (const [name, opts] of [
    ['khong doc duoc dinh dang nay', { supported: false }],
    ['khong co MediaSource', { hasMediaSource: false }],
  ]) {
    const weak = machine({ base, tracks, ...opts });
    vm.runInNewContext(SOURCE, weak.sandbox);
    await settle(weak.log, 150, 2000);
    check(`${name}: van tro vao duong /hd`, weak.video.src === '/hd/demo/720');
    check(`${name}: khong goi mang lan nao`, weak.log.fetches.length === 0);
  }

  server.close();
  fs.rmSync(WORK, { recursive: true, force: true });

  console.log(`\nDat ${passed}, hong ${failed}`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error('Kiem thu do vo:', err);
  fs.rmSync(WORK, { recursive: true, force: true });
  process.exit(1);
});
