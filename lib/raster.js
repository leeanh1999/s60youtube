'use strict';

const zlib = require('zlib');

/**
 * Ve hinh SVG thanh anh PNG ngay tren may chu.
 *
 * Vi sao phai lam viec nay: trinh duyet goc cua Symbian (Nokia Browser 7.x/8.x)
 * la ban WebKit duoc dung KHONG kem bo ve SVG. Dat <svg> thang trong trang thi
 * bo phan tich coi day la the la, khong bao loi gi ma cung khong ve gi — tren
 * may that moi cho co bieu tuong chi con la khoang trong. Anh PNG thi may nao
 * cung mo duoc, ke ca doi truoc no.
 *
 * Nen giu nguyen hinh ve dang SVG lam ban goc (mot dong chu de sua, de doc) roi
 * to ra PNG o day, thay vi phai ve tay 24 hinh bang tung diem anh.
 *
 * Chi lam dung phan can cho bo hinh trong lib/icons.js:
 *  - Duong <path> voi cac lenh M L H V C Q A Z (ke ca dang chu thuong, tuong
 *    doi) va <circle>. Gap lenh khac thi nem loi ngay chu khong ve sai am tham.
 *  - Chi to nen, khong ke vien: hinh nao can vien thi ve thanh hai duong tron
 *    long nhau roi to bang fill-rule="evenodd" (xem hinh 'search').
 *  - Mot mau duy nhat cho ca hinh, mau nam trong ten file anh. Ban SVG dung
 *    currentColor de an theo mau chu, con anh thi phai nung mau vao san.
 */

// Buoc lay mau cung cua: 11,25 do mot doan. Tren hinh 32 diem thi cho phinh ra
// giua hai doan chua toi 1/20 diem anh — mat khong thay duoc.
const ARC_STEP = Math.PI / 16;

// Duong cong Bezier chia deu 12 doan. Bo hinh hien tai khong dung duong nao
// nhu vay, nhung de san cho khoi phai sua o day khi them hinh moi.
const CURVE_STEPS = 12;

// So dong lay mau tren mot dong diem anh. Theo chieu ngang thi tinh dung phan
// dien tich bi phu, nen chi chieu doc moi can lay mau nhieu lan: 4 dong da du
// min cho hinh be nhu the nay, ma cong viec chi bang 4 lan mot.
const ROWS = 4;

const NUMBER = /[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g;

/** Doc mot chuoi 'd' theo tung manh: chu lenh, so, va co 0/1 cua lenh A. */
function reader(d) {
  let at = 0;

  const skip = () => {
    while (at < d.length && (d[at] === ' ' || d[at] === ',' || d[at] === '\n' || d[at] === '\t')) {
      at += 1;
    }
  };

  return {
    done() {
      skip();
      return at >= d.length;
    },
    /** Chu lenh ke tiep, hoac null khi cho do la mot con so (lenh nhac lai). */
    letter() {
      skip();
      if (at < d.length && /[A-Za-z]/.test(d[at])) {
        at += 1;
        return d[at - 1];
      }
      return null;
    },
    number() {
      skip();
      NUMBER.lastIndex = at;
      const found = NUMBER.exec(d);
      if (!found || found.index !== at) {
        throw new Error(`duong SVG sai o vi tri ${at}: ${d}`);
      }
      at = NUMBER.lastIndex;
      return Number(found[0]);
    },
    // Hai co cua lenh A la mot chu so lien, khong nhat thiet co dau cach:
    // "a4 4 0 014 4" nghia la co 0, co 1, roi diem (4,4).
    flag() {
      skip();
      const ch = d[at];
      if (ch !== '0' && ch !== '1') throw new Error(`co cua lenh A phai la 0 hay 1: ${d}`);
      at += 1;
      return ch === '1';
    },
  };
}

/** Goc giua hai vecto, mang dau theo chieu quay. */
function angleBetween(ux, uy, vx, vy) {
  const size = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
  if (!size) return 0;
  let angle = Math.acos(Math.min(1, Math.max(-1, (ux * vx + uy * vy) / size)));
  if (ux * vy - uy * vx < 0) angle = -angle;
  return angle;
}

/**
 * Cung cua lenh A. SVG cho biet diem dau, diem cuoi va hai ban kinh; muon lay
 * mau thi phai tim ra tam va hai goc — cach tinh nay lay dung theo phu luc F.6.5
 * cua chuan SVG 1.1.
 */
function arcPoints(into, x0, y0, rx, ry, turn, large, sweep, x1, y1) {
  if (!rx || !ry) {
    into.push([x1, y1]);
    return;
  }
  rx = Math.abs(rx);
  ry = Math.abs(ry);

  const phi = (turn * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const halfX = (x0 - x1) / 2;
  const halfY = (y0 - y1) / 2;
  const ax = cosPhi * halfX + sinPhi * halfY;
  const ay = -sinPhi * halfX + cosPhi * halfY;

  // Ban kinh nho qua thi khong co cung nao noi duoc hai diem: chuan bat noi
  // rong ca hai ra cho vua du.
  const over = (ax * ax) / (rx * rx) + (ay * ay) / (ry * ry);
  if (over > 1) {
    const grow = Math.sqrt(over);
    rx *= grow;
    ry *= grow;
  }

  const top = rx * rx * ry * ry - rx * rx * ay * ay - ry * ry * ax * ax;
  const bottom = rx * rx * ay * ay + ry * ry * ax * ax;
  const reach = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, top / bottom));
  const cxa = (reach * rx * ay) / ry;
  const cya = (-reach * ry * ax) / rx;
  const cx = cosPhi * cxa - sinPhi * cya + (x0 + x1) / 2;
  const cy = sinPhi * cxa + cosPhi * cya + (y0 + y1) / 2;

  const fromX = (ax - cxa) / rx;
  const fromY = (ay - cya) / ry;
  const toX = (-ax - cxa) / rx;
  const toY = (-ay - cya) / ry;
  const start = angleBetween(1, 0, fromX, fromY);
  let span = angleBetween(fromX, fromY, toX, toY);
  if (!sweep && span > 0) span -= 2 * Math.PI;
  if (sweep && span < 0) span += 2 * Math.PI;

  const steps = Math.max(2, Math.ceil(Math.abs(span) / ARC_STEP));
  for (let i = 1; i <= steps; i += 1) {
    const t = start + (span * i) / steps;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    into.push([
      cx + rx * cos * cosPhi - ry * sin * sinPhi,
      cy + rx * cos * sinPhi + ry * sin * cosPhi,
    ]);
  }
}

/** Duong 'd' thanh cac vong diem thang. Moi vong la mot nhanh cua duong. */
function trace(d) {
  const loops = [];
  const step = reader(d);
  let loop = null;
  let cmd = null;
  let x = 0;
  let y = 0;
  let firstX = 0;
  let firstY = 0;
  // Diem dieu khien cuoi cung va lenh vua lam: hai lenh S va T lay diem dieu
  // khien bang cach lat guong diem cua lenh truoc qua diem dang dung.
  let ctrlX = 0;
  let ctrlY = 0;
  let before = '';

  const start = (nx, ny) => {
    loop = [[nx, ny]];
    loops.push(loop);
    x = firstX = nx;
    y = firstY = ny;
  };

  const to = (nx, ny) => {
    if (!loop) start(nx, ny);
    else {
      loop.push([nx, ny]);
      x = nx;
      y = ny;
    }
  };

  while (!step.done()) {
    const letter = step.letter();
    if (letter) cmd = letter;
    // Lenh khong viet lai thi nhac lai lenh truoc, rieng M thi doi thanh L:
    // "M5 4 9 8" nghia la di toi (5,4) roi ke sang (9,8).
    else if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';
    else if (!cmd) throw new Error(`duong SVG khong bat dau bang chu lenh: ${d}`);

    const kind = cmd.toUpperCase();
    if (kind === 'Z') {
      if (loop) {
        loop.push([firstX, firstY]);
        x = firstX;
        y = firstY;
      }
      before = kind;
      continue;
    }

    // Lenh chu thuong tinh theo diem dang dung, chu hoa tinh tu goc toa do.
    const relative = cmd !== kind;
    const baseX = relative ? x : 0;
    const baseY = relative ? y : 0;

    if (kind === 'M') start(step.number() + baseX, step.number() + baseY);
    else if (kind === 'L') to(step.number() + baseX, step.number() + baseY);
    else if (kind === 'H') to(step.number() + baseX, y);
    else if (kind === 'V') to(x, step.number() + baseY);
    else if (kind === 'C' || kind === 'S' || kind === 'Q' || kind === 'T') {
      const cubic = kind === 'C' || kind === 'S';
      // Lenh S (hay T) di ngay sau mot lenh cung ho thi diem dieu khien dau la
      // guong cua diem dieu khien cuoi lan truoc, lat qua diem dang dung — nho
      // vay cho noi hai duong cong khong bi gap khuc. Khong phai the thi no la
      // chinh diem dang dung.
      const echo = kind === 'S' ? 'CS'.indexOf(before) > -1 : 'QT'.indexOf(before) > -1;
      let x1 = echo ? 2 * x - ctrlX : x;
      let y1 = echo ? 2 * y - ctrlY : y;
      if (kind === 'C' || kind === 'Q') {
        x1 = step.number() + baseX;
        y1 = step.number() + baseY;
      }
      const x2 = cubic ? step.number() + baseX : x1;
      const y2 = cubic ? step.number() + baseY : y1;
      const ex = step.number() + baseX;
      const ey = step.number() + baseY;
      const fromX = x;
      const fromY = y;
      for (let i = 1; i <= CURVE_STEPS; i += 1) {
        const t = i / CURVE_STEPS;
        const u = 1 - t;
        if (cubic) {
          to(
            u * u * u * fromX + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex,
            u * u * u * fromY + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey
          );
        } else {
          to(
            u * u * fromX + 2 * u * t * x1 + t * t * ex,
            u * u * fromY + 2 * u * t * y1 + t * t * ey
          );
        }
      }
      ctrlX = cubic ? x2 : x1;
      ctrlY = cubic ? y2 : y1;
    } else if (kind === 'A') {
      const rx = step.number();
      const ry = step.number();
      const turn = step.number();
      const large = step.flag();
      const sweep = step.flag();
      const ex = step.number() + baseX;
      const ey = step.number() + baseY;
      if (!loop) start(x, y);
      arcPoints(loop, x, y, rx, ry, turn, large, sweep, ex, ey);
      x = ex;
      y = ey;
    } else {
      throw new Error(`lenh SVG chua ho tro trong hinh: ${cmd}`);
    }

    before = kind;
  }

  return loops;
}

/** Duong tron thanh mot vong 64 canh — du min o co 32 diem. */
function circleLoop(cx, cy, r) {
  const loop = [];
  for (let i = 0; i <= 64; i += 1) {
    const t = (i / 64) * 2 * Math.PI;
    loop.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return loop;
}

/**
 * Doc doan HTML cua mot hinh thanh danh sach mang to: moi mang la cac vong diem
 * cung voi cach to (chan-le hay khac-khong). Doc bang bieu thuc chinh quy la du
 * vi chinh ta viet ra doan nay, khong phai SVG tu ngoai vao.
 */
function shapesOf(markup) {
  const fills = [];
  const tag = /<(path|circle)\b([^>]*)\/?>/g;
  let found = tag.exec(markup);
  while (found) {
    const [, name, attrs] = found;
    const attr = (key) => {
      const hit = new RegExp(`${key}="([^"]*)"`).exec(attrs);
      return hit ? hit[1] : null;
    };
    const evenOdd = attr('fill-rule') === 'evenodd';

    if (name === 'path') {
      const d = attr('d');
      if (!d) throw new Error('the <path> khong co thuoc tinh d');
      fills.push({ loops: trace(d), evenOdd });
    } else {
      fills.push({
        loops: [circleLoop(Number(attr('cx')), Number(attr('cy')), Number(attr('r')))],
        evenOdd,
      });
    }
    found = tag.exec(markup);
  }
  if (!fills.length) throw new Error('hinh nay khong co the <path> hay <circle> nao');
  return fills;
}

/** Cac canh cat duoc: bo canh nam ngang vi no khong cat dong nao. */
function edgesOf(loops, scale) {
  const edges = [];
  for (const loop of loops) {
    for (let i = 0; i + 1 < loop.length; i += 1) {
      pushEdge(edges, loop[i], loop[i + 1], scale);
    }
    // Vong nao chua khep thi khep ho: to nen bao gio cung tinh nhu da khep.
    const head = loop[0];
    const tail = loop[loop.length - 1];
    if (head && tail && (head[0] !== tail[0] || head[1] !== tail[1])) {
      pushEdge(edges, tail, head, scale);
    }
  }
  return edges;
}

function pushEdge(edges, from, to, scale) {
  const ax = from[0] * scale;
  const ay = from[1] * scale;
  const bx = to[0] * scale;
  const by = to[1] * scale;
  if (ay === by) return;
  edges.push({
    ax,
    ay,
    slope: (bx - ax) / (by - ay),
    top: Math.min(ay, by),
    bottom: Math.max(ay, by),
    // Huong di lam nen cach to khac-khong: len mot vong, xuong mot vong.
    dir: by > ay ? 1 : -1,
  });
}

/**
 * Do phan bi to cua tung diem anh, tra ve so tu 0 den 1.
 *
 * Cach lam: moi dong diem anh lay ROWS dong mau; tren mot dong mau thi tim cac
 * cho duong cat qua, sap theo be ngang roi tinh cac doan nam trong hinh. Theo
 * chieu ngang cong dung phan diem anh bi doan do phu, nen ria doc net va ria
 * ngang min — dung thu can cho hinh be 32 diem.
 */
function coverOf(fill, size) {
  const cover = new Float32Array(size * size);
  const edges = edgesOf(fill.loops, size / 24);
  const cuts = [];

  for (let row = 0; row < size; row += 1) {
    for (let sub = 0; sub < ROWS; sub += 1) {
      const y = row + (sub + 0.5) / ROWS;
      cuts.length = 0;
      for (const edge of edges) {
        if (y < edge.top || y >= edge.bottom) continue;
        cuts.push({ x: edge.ax + (y - edge.ay) * edge.slope, dir: edge.dir });
      }
      if (cuts.length < 2) continue;
      cuts.sort((a, b) => a.x - b.x);

      let wind = 0;
      for (let i = 0; i + 1 < cuts.length; i += 1) {
        wind += fill.evenOdd ? 1 : cuts[i].dir;
        const inside = fill.evenOdd ? wind % 2 !== 0 : wind !== 0;
        if (inside) paint(cover, row, size, cuts[i].x, cuts[i + 1].x);
      }
    }
  }
  return cover;
}

/** Mot doan nam trong hinh: cong vao tung diem anh dung phan be ngang bi phu. */
function paint(cover, row, size, from, to) {
  const left = Math.max(0, from);
  const right = Math.min(size, to);
  if (right <= left) return;
  const line = row * size;
  for (let i = Math.floor(left); i < right; i += 1) {
    const part = Math.min(right, i + 1) - Math.max(left, i);
    if (part > 0) cover[line + i] += part / ROWS;
  }
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value;
  }
  return table;
})();

function crc32(buffer) {
  let value = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    value = CRC_TABLE[(value ^ buffer[i]) & 0xff] ^ (value >>> 8);
  }
  return (value ^ -1) >>> 0;
}

function chunk(name, body) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length, 0);
  const tagged = Buffer.concat([Buffer.from(name, 'ascii'), body]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(tagged), 0);
  return Buffer.concat([head, tagged, tail]);
}

/**
 * Dong file PNG that (mau RGBA 8 bit). Tu viet vi day la ca thu vien anh cua
 * du an: chi can dung mot dang anh, ma zlib thi Node co san.
 *
 * Mau nam khap moi diem anh ke ca cho trong suot — nho vay may nao thu nho anh
 * ma bo qua phan trong suot thi ria hinh cung khong bi vien den.
 */
function encodePng(size, cover, rgb) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let at = 0;
  for (let row = 0; row < size; row += 1) {
    raw[at] = 0; // khong dung phep loc nao: anh be, nen lai da du gon
    at += 1;
    for (let col = 0; col < size; col += 1) {
      const part = cover[row * size + col];
      raw[at] = rgb[0];
      raw[at + 1] = rgb[1];
      raw[at + 2] = rgb[2];
      raw[at + 3] = Math.round(Math.min(1, Math.max(0, part)) * 255);
      at += 4;
    }
  }

  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0);
  head.writeUInt32BE(size, 4);
  head[8] = 8; // 8 bit moi kenh
  head[9] = 6; // RGBA
  head[10] = 0;
  head[11] = 0;
  head[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', head),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function parseColor(color) {
  const hex = /^#?([0-9a-fA-F]{6})$/.exec(String(color));
  if (!hex) throw new Error(`mau phai la sau chu so mau: ${color}`);
  const value = parseInt(hex[1], 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/**
 * Doan HTML cua mot hinh (khung 24x24) thanh anh PNG vuong `size` diem, to bang
 * mot mau duy nhat.
 *
 * Nhieu mang to trong cung mot hinh thi lay phan to dam nhat chu khong cong
 * don: cung mot mau ma cong don thi cho hai mang chong nhau se hien ra mot
 * duong dam hon han xung quanh.
 */
function toPng(markup, color, size) {
  const rgb = parseColor(color);
  const total = new Float32Array(size * size);
  for (const fill of shapesOf(markup)) {
    const cover = coverOf(fill, size);
    for (let i = 0; i < total.length; i += 1) {
      if (cover[i] > total[i]) total[i] = cover[i];
    }
  }
  return encodePng(size, total, rgb);
}

module.exports = { toPng };
