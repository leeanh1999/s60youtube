'use strict';

/**
 * Bien luong tieng MP4 chia doan (DASH) cua YouTube thanh mot file .m4a thuong
 * "ao" ngay luc phat — khong ffmpeg, khong ghi dia, khong tai het file truoc.
 *
 * Vi sao: luong chi tieng cua YouTube co dang
 *   ftyp moov(rong, co mvex) sidx  moof mdat  moof mdat  ...  (vd. 22 doan)
 * moov khong co bang mau (stts/stsz/stco rong), moi doan tu ke mau cua no trong
 * moof. Trinh phat cua Symbian (va nhieu may cu) chi hieu file "lien mot khoi":
 *   ftyp moov(du bang mau) mdat(toan bo tieng)
 * nen gap luong DASH no nghe cham, giat, hay khong nghe duoc.
 *
 * Cach lam: doc ftyp+moov+sidx (vai KB dau), sidx cho biet vi tri tung doan;
 * doc rieng phan moof dau moi doan (~2 KB) de lay kich thuoc va thoi luong tung
 * mau. Tu do dung mot moov moi du bang mau. File ao = [ftyp][moov moi][dau
 * mdat] + noi lien phan tieng cua cac doan; phan tieng van xin thang YouTube
 * theo Range khi may can toi, nen may tua duoc va bat dau nghe ngay.
 *
 * buildIndex(fetchBytes) tra ve { header, total, pieces } hoac null neu luong
 * khong phai MP4 chia doan:
 *   header  Buffer ftyp + moov + dau mdat (giu trong bo nho)
 *   total   do dai file ao
 *   pieces  [{ out, src, len }] — byte [out, out+len) cua file ao nam o
 *           [src, src+len) cua luong goc
 */

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'dinf', 'mvex', 'moof', 'traf']);
const HEAD_GUESS = 64 * 1024;
const MOOF_GUESS = 8 * 1024;
const PARALLEL = 6;

function readBoxes(buf, start = 0, end = buf.length) {
  const boxes = [];
  let i = start;
  while (i + 8 <= end) {
    let size = buf.readUInt32BE(i);
    const type = buf.toString('latin1', i + 4, i + 8);
    let header = 8;
    if (size === 1) {
      if (i + 16 > end) break;
      size = Number(buf.readBigUInt64BE(i + 8));
      header = 16;
    } else if (size === 0) {
      size = end - i;
    }
    if (size < header) break;
    boxes.push({ type, start: i, size, header, end: i + size, complete: i + size <= end });
    i += size;
  }
  return boxes;
}

/** Cay hop: hop chua thi co children, hop la giu nguyen byte. */
function parseTree(buf, start, end) {
  return readBoxes(buf, start, end).map((box) => {
    if (CONTAINERS.has(box.type)) {
      return { type: box.type, children: parseTree(buf, box.start + box.header, box.end) };
    }
    return { type: box.type, data: buf.subarray(box.start + box.header, box.end) };
  });
}

function writeTree(nodes) {
  const parts = nodes.map((node) => {
    const body = node.children ? writeTree(node.children) : node.data;
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length + 8, 0);
    head.write(node.type, 4, 'latin1');
    return Buffer.concat([head, body]);
  });
  return Buffer.concat(parts);
}

function find(nodes, type) {
  return nodes.find((n) => n.type === type) || null;
}

function fullBox(version, flags, body) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(((version & 0xff) << 24) | (flags & 0xffffff), 0);
  return Buffer.concat([head, body]);
}

/** Doc moof: tra ve cac mau { size, duration, cto } va byte bat dau du lieu. */
function parseMoof(buf, moofStart, trex) {
  const moof = parseTree(buf, moofStart + 8, moofStart + buf.readUInt32BE(moofStart));
  const traf = find(moof, 'traf');
  if (!traf) throw new Error('moof khong co traf');
  const tfhd = find(traf.children, 'tfhd');
  const trun = find(traf.children, 'trun');
  if (!tfhd || !trun) throw new Error('traf thieu tfhd/trun');

  let p = 4;
  const hflags = tfhd.data.readUInt32BE(0) & 0xffffff;
  p += 4; // track_ID
  let base = moofStart;
  if (hflags & 0x01) {
    base = Number(tfhd.data.readBigUInt64BE(p));
    p += 8;
  }
  if (hflags & 0x02) p += 4;
  let defDuration = trex.duration;
  let defSize = trex.size;
  if (hflags & 0x08) {
    defDuration = tfhd.data.readUInt32BE(p);
    p += 4;
  }
  if (hflags & 0x10) {
    defSize = tfhd.data.readUInt32BE(p);
    p += 4;
  }

  const d = trun.data;
  const tflags = d.readUInt32BE(0) & 0xffffff;
  const version = d[0];
  const count = d.readUInt32BE(4);
  let q = 8;
  let dataOffset = 0;
  if (tflags & 0x001) {
    dataOffset = d.readInt32BE(q);
    q += 4;
  }
  if (tflags & 0x004) q += 4;
  const samples = [];
  for (let k = 0; k < count; k++) {
    let duration = defDuration;
    let size = defSize;
    let cto = 0;
    if (tflags & 0x100) {
      duration = d.readUInt32BE(q);
      q += 4;
    }
    if (tflags & 0x200) {
      size = d.readUInt32BE(q);
      q += 4;
    }
    if (tflags & 0x400) q += 4;
    if (tflags & 0x800) {
      cto = version === 0 ? d.readUInt32BE(q) : d.readInt32BE(q);
      q += 4;
    }
    samples.push({ size, duration, cto });
  }
  return { samples, dataStart: base + dataOffset };
}

/** Vi tri cac doan tu sidx: [{ offset, size }]. */
function parseSidx(buf, box) {
  const d = buf.subarray(box.start + box.header, box.end);
  const version = d[0];
  let p = 4 + 4 + 4; // fullbox, reference_ID, timescale
  let firstOffset;
  if (version === 0) {
    p += 4;
    firstOffset = d.readUInt32BE(p);
    p += 4;
  } else {
    p += 8;
    firstOffset = Number(d.readBigUInt64BE(p));
    p += 8;
  }
  p += 2;
  const count = d.readUInt16BE(p);
  p += 2;
  const out = [];
  let offset = box.end + firstOffset;
  for (let k = 0; k < count; k++) {
    const ref = d.readUInt32BE(p);
    if (ref & 0x80000000) throw new Error('sidx long nhau, chua ho tro');
    const size = ref & 0x7fffffff;
    out.push({ offset, size });
    offset += size;
    p += 12;
  }
  return out;
}

function setDuration(node, field, value) {
  // mvhd/tkhd/mdhd: version 0 dung so 32 bit, version 1 dung 64 bit.
  const d = Buffer.from(node.data);
  const v1 = d[0] === 1;
  const offsets = {
    mvhd: v1 ? 4 + 8 + 8 + 4 : 4 + 4 + 4 + 4,
    tkhd: v1 ? 4 + 8 + 8 + 4 + 4 : 4 + 4 + 4 + 4 + 4,
    mdhd: v1 ? 4 + 8 + 8 + 4 : 4 + 4 + 4 + 4,
  };
  const at = offsets[field];
  if (v1) d.writeBigUInt64BE(BigInt(value), at);
  else d.writeUInt32BE(Math.min(value, 0xffffffff), at);
  node.data = d;
}

function timescaleOf(node) {
  const d = node.data;
  return d[0] === 1 ? d.readUInt32BE(4 + 8 + 8) : d.readUInt32BE(4 + 4 + 4);
}

function sampleTables(fragments, firstChunkOffset) {
  const sizes = [];
  const stts = [];
  const stsc = [];
  const chunkOffsets = [];
  let offset = firstChunkOffset;
  fragments.forEach((frag, i) => {
    chunkOffsets.push(offset);
    for (const s of frag.samples) {
      sizes.push(s.size);
      offset += s.size;
      const last = stts[stts.length - 1];
      if (last && last.duration === s.duration) last.count += 1;
      else stts.push({ count: 1, duration: s.duration });
    }
    const prev = stsc[stsc.length - 1];
    if (!prev || prev.perChunk !== frag.samples.length) {
      stsc.push({ first: i + 1, perChunk: frag.samples.length });
    }
  });

  const sttsBody = Buffer.alloc(4 + stts.length * 8);
  sttsBody.writeUInt32BE(stts.length, 0);
  stts.forEach((e, k) => {
    sttsBody.writeUInt32BE(e.count, 4 + k * 8);
    sttsBody.writeUInt32BE(e.duration, 8 + k * 8);
  });
  const stscBody = Buffer.alloc(4 + stsc.length * 12);
  stscBody.writeUInt32BE(stsc.length, 0);
  stsc.forEach((e, k) => {
    stscBody.writeUInt32BE(e.first, 4 + k * 12);
    stscBody.writeUInt32BE(e.perChunk, 8 + k * 12);
    stscBody.writeUInt32BE(1, 12 + k * 12);
  });
  const stszBody = Buffer.alloc(8 + sizes.length * 4);
  stszBody.writeUInt32BE(0, 0);
  stszBody.writeUInt32BE(sizes.length, 4);
  sizes.forEach((s, k) => stszBody.writeUInt32BE(s, 8 + k * 4));
  const stcoBody = Buffer.alloc(4 + chunkOffsets.length * 4);
  stcoBody.writeUInt32BE(chunkOffsets.length, 0);
  chunkOffsets.forEach((o, k) => stcoBody.writeUInt32BE(o, 4 + k * 4));

  return [
    { type: 'stts', data: fullBox(0, 0, sttsBody) },
    { type: 'stsc', data: fullBox(0, 0, stscBody) },
    { type: 'stsz', data: fullBox(0, 0, stszBody) },
    { type: 'stco', data: fullBox(0, 0, stcoBody) },
  ];
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const k = next++;
      out[k] = await fn(items[k], k);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * fetchBytes(start, end) -> Buffer cua byte [start, end] (co the ngan hon neu
 * het file). Tra ve null neu luong khong phai MP4 chia doan co sidx.
 */
async function buildIndex(fetchBytes) {
  const head = await fetchBytes(0, HEAD_GUESS - 1);
  const top = readBoxes(head);
  const ftypBox = top.find((b) => b.type === 'ftyp');
  const moovBox = top.find((b) => b.type === 'moov');
  const sidxBox = top.find((b) => b.type === 'sidx');
  if (!ftypBox || !moovBox || !moovBox.complete || !sidxBox || !sidxBox.complete) return null;

  const moov = parseTree(head, moovBox.start + moovBox.header, moovBox.end);
  const mvex = find(moov, 'mvex');
  const traks = moov.filter((n) => n.type === 'trak');
  if (!mvex || traks.length !== 1) return null;
  const trexNode = find(mvex.children, 'trex');
  const trex = trexNode
    ? {
        duration: trexNode.data.readUInt32BE(12),
        size: trexNode.data.readUInt32BE(16),
      }
    : { duration: 0, size: 0 };

  const refs = parseSidx(head, sidxBox);
  const fragments = await mapLimit(refs, PARALLEL, async (ref) => {
    let buf = await fetchBytes(ref.offset, ref.offset + MOOF_GUESS - 1);
    const moofSize = buf.readUInt32BE(0);
    if (buf.toString('latin1', 4, 8) !== 'moof') throw new Error('doan khong bat dau bang moof');
    if (moofSize > buf.length) buf = await fetchBytes(ref.offset, ref.offset + moofSize - 1);
    const { samples, dataStart } = parseMoof(buf, 0, trex);
    if (samples.some((s) => s.cto !== 0)) throw new Error('co ctts, chua ho tro');
    return { samples, src: ref.offset + dataStart };
  });

  // Dung moov moi: bo mvex va edts, dien bang mau, sua thoi luong.
  const trak = traks[0];
  const tkhd = find(trak.children, 'tkhd');
  const mdia = find(trak.children, 'mdia');
  const mdhd = find(mdia.children, 'mdhd');
  const minf = find(mdia.children, 'minf');
  const stbl = find(minf.children, 'stbl');
  const mvhd = find(moov, 'mvhd');
  const mediaScale = timescaleOf(mdhd);
  const movieScale = timescaleOf(mvhd);
  const mediaDuration = fragments.reduce((t, f) => t + f.samples.reduce((a, s) => a + s.duration, 0), 0);
  const movieDuration = Math.round((mediaDuration * movieScale) / mediaScale);
  setDuration(mdhd, 'mdhd', mediaDuration);
  setDuration(tkhd, 'tkhd', movieDuration);
  setDuration(mvhd, 'mvhd', movieDuration);
  trak.children = trak.children.filter((n) => n.type !== 'edts');
  const keep = stbl.children.filter(
    (n) => !['stts', 'stsc', 'stsz', 'stco', 'co64', 'ctts', 'stss'].includes(n.type)
  );

  // ftyp cua file .m4a thuong (giong ban ffmpeg chep ra), thay cho 'dash'.
  const ftypBuf = Buffer.alloc(32);
  ftypBuf.writeUInt32BE(32, 0);
  ftypBuf.write('ftypM4A ', 4, 'latin1');
  ftypBuf.writeUInt32BE(0x200, 12);
  ftypBuf.write('M4A mp42isomiso2', 16, 'latin1');

  const dataTotal = fragments.reduce((t, f) => t + f.samples.reduce((a, s) => a + s.size, 0), 0);
  const build = (firstChunk) => {
    stbl.children = [...keep, ...sampleTables(fragments, firstChunk)];
    return writeTree([{ type: 'moov', children: moov.filter((n) => n.type !== 'mvex') }]);
  };
  // Lan dau de biet do dai moov (so o stco khong doi), lan hai dien vi tri that.
  const mdatHead = 8;
  const probe = build(0);
  const dataStart = ftypBuf.length + probe.length + mdatHead;
  const moovBuf = build(dataStart);
  const mdat = Buffer.alloc(8);
  mdat.writeUInt32BE(dataTotal + 8, 0);
  mdat.write('mdat', 4, 'latin1');
  const header = Buffer.concat([ftypBuf, moovBuf, mdat]);

  const pieces = [];
  let out = header.length;
  for (const f of fragments) {
    const len = f.samples.reduce((a, s) => a + s.size, 0);
    pieces.push({ out, src: f.src, len });
    out += len;
  }
  return { header, total: out, pieces, duration: mediaDuration / mediaScale };
}

module.exports = { buildIndex, readBoxes };
