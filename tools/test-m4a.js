'use strict';

// Kiem thu lib/fmp4.js: lam mot luong tieng MP4 chia doan co sidx giong het luong
// chi tieng cua YouTube (ftyp moov sidx moof mdat ...), dung file .m4a ao tu no
// roi de ffmpeg doc lai. Dung o day thi E6 moi co mot file "lien mot khoi" de
// nghe — hong thi chi lo ra tren dien thoai.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 's60-m4a-'));
process.env.DATA_DIR = WORK;

const media = require('../lib/media');
const fmp4 = require('../lib/fmp4');

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

function ffmpeg(args) {
  return execFileSync(media.FFMPEG, ['-hide_banner', '-v', 'error', '-y', ...args], { stdio: 'pipe' });
}

function info(file) {
  try {
    execFileSync(media.FFMPEG, ['-hide_banner', '-i', file], { stdio: 'pipe' });
    return '';
  } catch (err) {
    return String(err.stderr || '');
  }
}

(async () => {
  const dash = path.join(WORK, 'dash.mp4');
  ffmpeg([
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=25',
    '-c:a', 'aac', '-b:a', '96k',
    '-movflags', '+frag_keyframe+empty_moov+default_base_moof+global_sidx',
    '-frag_duration', '2000000',
    dash,
  ]);
  const src = fs.readFileSync(dash);
  const top = fmp4.readBoxes(src).map((b) => b.type);
  console.log('Luong thu:', top.slice(0, 5).join(' '), '...', top.filter((t) => t === 'moof').length, 'doan');

  let reads = 0;
  const index = await fmp4.buildIndex(async (a, b) => {
    reads += 1;
    return src.subarray(a, Math.min(b + 1, src.length));
  });
  check('dung duoc muc luc', Boolean(index));
  if (!index) {
    console.log(`\nDat ${passed}, hong ${failed}`);
    process.exit(1);
  }
  check('so doan khop', index.pieces.length === top.filter((t) => t === 'moof').length);
  check('chi doc phan dau moi doan', reads <= index.pieces.length + 2, `(${reads} lan doc)`);

  const out = Buffer.concat([index.header, ...index.pieces.map((p) => src.subarray(p.src, p.src + p.len))]);
  check('do dai file ao dung', out.length === index.total, `(${out.length} / ${index.total})`);
  const boxes = fmp4.readBoxes(out).map((b) => b.type).join(' ');
  check('file ao lien mot khoi', boxes === 'ftyp moov mdat', `(${boxes})`);

  const virt = path.join(WORK, 'virt.m4a');
  fs.writeFileSync(virt, out);
  let decoded = true;
  try {
    ffmpeg(['-i', virt, '-f', 'null', '-']);
  } catch (err) {
    decoded = false;
    console.log(String(err.stderr || err));
  }
  check('ffmpeg giai ma het khong loi', decoded);
  check('nhan la m4a', /major_brand\s*:\s*M4A/.test(info(virt)));
  const dur = /Duration: 00:00:(\d+\.\d+)/.exec(info(virt));
  check('thoi luong dung 25 giay', dur && Math.abs(Number(dur[1]) - 25) < 0.2, `(${dur && dur[1]})`);

  // Du lieu tieng phai trung tung byte voi luong goc.
  const a = path.join(WORK, 'a.aac');
  const b = path.join(WORK, 'b.aac');
  ffmpeg(['-i', virt, '-c', 'copy', '-f', 'adts', a]);
  ffmpeg(['-i', dash, '-c', 'copy', '-f', 'adts', b]);
  check('tieng trung tung byte voi luong goc', fs.readFileSync(a).equals(fs.readFileSync(b)));

  // Luong khong chia doan (file .m4a thuong) thi khong dong vao.
  const plain = path.join(WORK, 'plain.m4a');
  ffmpeg(['-i', dash, '-c', 'copy', '-movflags', '+faststart', plain]);
  const plainSrc = fs.readFileSync(plain);
  const none = await fmp4.buildIndex(async (x, y) => plainSrc.subarray(x, Math.min(y + 1, plainSrc.length)));
  check('file thuong thi bo qua (null)', none === null);

  fs.rmSync(WORK, { recursive: true, force: true });
  console.log(`\nDat ${passed}, hong ${failed}`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
