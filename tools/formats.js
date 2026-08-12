'use strict';

// Chan doan: xem YouTube tra ve nhung dinh dang nao cho mot video.
// Chay tren NAS:  docker exec s60youtube node tools/formats.js VH3mWd28Ndg

const cookies = require('../lib/cookies');
const ytdlp = require('../lib/ytdlp');
const { parseVideoId } = require('../lib/util');

const videoId = parseVideoId(process.argv[2]);

if (!videoId) {
  console.error('Cach dung: node tools/formats.js <ma-video hoac link>');
  process.exitCode = 1;
  return;
}

(async () => {
  // Mac dinh dung cookie chung cua may chu. Muon thu bang cookie cua mot may
  // cu the thi dat DEVICE_ID = ten file trong <DATA_DIR>/devices (bo duoi .txt).
  const deviceId = process.env.DEVICE_ID || null;
  const auth = cookies.authFor(deviceId);
  const source = cookies.status(deviceId).source;
  console.log(`cookie: ${auth.mode}${source ? ` (${source})` : ''}`);

  try {
    const info = await ytdlp.getInfo(videoId, auth);
    console.log(`\n${info.title} — ${info.author}`);
    console.log(`thoi luong ${info.duration}s, truc tiep: ${info.isLive ? 'co' : 'khong'}`);
    console.log(`\nTong ${info.formats.length} dinh dang tai thang duoc:\n`);

    for (const f of info.formats) {
      const kind = f.vcodec && f.acodec ? 'hinh+tieng' : f.vcodec ? 'chi hinh ' : 'chi tieng';
      const size = f.width ? `${f.width}x${f.height}` : '';
      console.log(
        `  ${String(f.id).padEnd(5)} ${f.ext.padEnd(5)} ${kind} ${size.padEnd(10)} ` +
          `${(f.vcodec || '-').padEnd(12)} ${(f.acodec || '-').padEnd(10)}`
      );
    }

    const direct = ytdlp.pickProgressive(info.formats, 360);
    const video = ytdlp.pickVideoOnly(info.formats, 360);
    const audio = ytdlp.pickAudioOnly(info.formats);

    console.log('\nApp se chon:');
    console.log(`  Phat ngay   : ${direct ? `${direct.id} (${direct.height}p)` : 'khong co — phai chuyen ma'}`);
    console.log(`  Nguon hinh  : ${video ? `${video.id} (${video.height}p)` : 'khong co'}`);
    console.log(`  Nguon tieng : ${audio ? `${audio.id} (${audio.abr}kbps)` : 'khong co'}`);
  } catch (err) {
    console.error(`\nLOI: ${err.message}`);
    process.exitCode = 1;
  }
})();
