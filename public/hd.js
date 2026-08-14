'use strict';

/**
 * Trinh phat cho cac muc do phan giai cao, chay tren may doi moi.
 *
 * Tu 480p tro len YouTube khong con giu ban gop san: hinh mot file, tieng mot
 * file. Cach cu la de may chu ghep bang ffmpeg roi do thang ra duong truyen
 * (duong /hd) — bam la chay, nhung vo MP4 phan manh do khong co chi muc cho ca
 * file nen khong tua duoc.
 *
 * O day lam giong trinh phat cua chinh YouTube: khong ghep gi ca, ma dua thang
 * hai luong vao bo giai ma cua trinh duyet qua Media Source Extensions. Tua la
 * viec cua chinh trinh duyet — no doi doan byte nao thi minh lay dung doan do.
 * Doi lai may chu khong phai chay ffmpeg cho tung nguoi xem nua, chi con chuyen
 * tiep byte.
 *
 * Cach tim doan: moi luong cua YouTube la mot file MP4 "san sang cho DASH", tuc
 * la sau moov co mot hop 'sidx' — bang chi muc noi doan thu i dai bao nhieu
 * giay va nam o byte nao. Doc bang do la nhay tuy y trong video duoc. Khong can
 * hoi YouTube them gi: chi lay vai chuc KB dau file la thay.
 *
 * File nay CHI duoc nap tren may doi moi va chi khi dang xem muc cao (xem
 * lib/render.js). May Symbian khong bao gio thay the <script> nay — no doc
 * khong noi ma cung khong duoc loi gi.
 *
 * Hong o bat ky buoc nao thi im lang rut lui: the <video> van dang tro vao
 * duong /hd cua may chu, nguoi xem khong thay khac gi ngoai viec khong tua duoc.
 */
(function () {
  var video = document.getElementById('hdv');
  // Safari tren iPhone khong co MediaSource ma co ManagedMediaSource — cung mot
  // cach dung, chi doi hoi noi truoc la khong phat sang may khac (AirPlay), vi
  // may nhan chi duoc dua mot dia chi chu khong dua duoc luong dang ghep.
  var Source = window.ManagedMediaSource || window.MediaSource;
  if (!video || !Source || !window.fetch || !window.DataView) return;

  // Duong /hd cua may chu, giu lai de con duong lui neu cho nao do khong xong.
  var fallback = video.getAttribute('src');
  var streams = {
    video: { url: video.getAttribute('data-v'), mime: video.getAttribute('data-vt') },
    audio: { url: video.getAttribute('data-a'), mime: video.getAttribute('data-at') },
  };
  if (!streams.video.url || !streams.audio.url) return;
  if (
    !Source.isTypeSupported(streams.video.mime) ||
    !Source.isTypeSupported(streams.audio.mime)
  ) {
    return;
  }

  // Doc bao nhieu byte dau file de tim bang chi muc. 64KB du cho gan het video:
  // moov chua vai KB (khong co bang mau vi file da chia manh san), con sidx la
  // 12 byte moi doan — mot video ba tieng cung chi het chung 25KB.
  var HEAD_BYTES = 65536;
  // Dem truoc bao nhieu giay. Lay dai qua thi tua mot cai la phi ca doan vua
  // tai; ngan qua thi mang chap mot nhip la khung hinh dung lai.
  var BUFFER_AHEAD = 30;
  var KEEP_BEHIND = 30;

  function fetchRange(url, start, end) {
    return fetch(url, { headers: { Range: 'bytes=' + start + '-' + end } }).then(function (res) {
      if (!res.ok) throw new Error('may chu tra ve ' + res.status);
      // 206 la "day dung doan anh xin". Ma 200 la "day ca file" — co may chu lo
      // di header Range, luc do phai tu cat ra, khong thi nap nham ca file vao
      // bo giai ma.
      var whole = res.status === 200;
      return res.arrayBuffer().then(function (buffer) {
        var bytes = new Uint8Array(buffer);
        return whole ? bytes.slice(start, end + 1) : bytes;
      });
    });
  }

  function boxName(bytes, at) {
    return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  }

  /**
   * File MP4 la cac "hop" noi duoi nhau: 4 byte do dai, 4 byte ten, roi ruot.
   * Di tu dau file qua ftyp va moov la toi sidx. Tra ve null neu chua doc du
   * byte de toi noi — luc do goi lai voi doan dau dai hon.
   */
  function locateSidx(bytes) {
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var at = 0;
    while (at + 8 <= bytes.length) {
      var size = view.getUint32(at);
      var name = boxName(bytes, at + 4);
      if (name === 'sidx') return { start: at, size: size };
      // Do dai 1 nghia la hop qua lon cho 32 bit, so that nam ngay sau ten.
      if (size === 1) {
        if (at + 16 > bytes.length) return null;
        size = Number(view.getBigUint64(at + 8));
      }
      if (size < 8) throw new Error('vo MP4 hong o byte ' + at);
      at += size;
    }
    return null;
  }

  /**
   * Bang chi muc: moi muc mot doan, cho biet doan do dai bao nhieu byte va bao
   * nhieu giay. Cong don lai ra duoc "giay thu N nam o byte nao" — dung cai ma
   * duong ghep cua may chu khong the co.
   */
  function parseSidx(bytes, start, size) {
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var at = start + 8;
    var version = view.getUint8(at);
    at += 4; // version va co
    at += 4; // reference_ID
    var timescale = view.getUint32(at);
    at += 4;
    var firstOffset;
    if (version === 0) {
      at += 4; // earliest_presentation_time
      firstOffset = view.getUint32(at);
      at += 4;
    } else {
      at += 8;
      firstOffset = Number(view.getBigUint64(at));
      at += 8;
    }
    at += 2; // du phong
    var count = view.getUint16(at);
    at += 2;

    var segments = [];
    // Doan dau tien nam ngay sau hop sidx.
    var pos = start + size + firstOffset;
    var ticks = 0;
    for (var i = 0; i < count; i++) {
      var ref = view.getUint32(at);
      at += 4;
      var span = view.getUint32(at);
      at += 4;
      at += 4; // co SAP, khong dung toi
      // Bit dau bao "muc nay tro toi mot bang chi muc khac" — YouTube khong
      // dung kieu long nhau do, gap thi coi nhu khong doc duoc.
      if (ref >>> 31) throw new Error('bang chi muc long nhau');
      var length = ref & 0x7fffffff;
      segments.push({
        start: pos,
        end: pos + length - 1,
        time: ticks / timescale,
        seconds: span / timescale,
      });
      pos += length;
      ticks += span;
    }
    return segments;
  }

  function readIndex(url) {
    var want = HEAD_BYTES;
    var head = null;

    function grow() {
      return fetchRange(url, 0, want - 1).then(function (bytes) {
        head = bytes;
        var found = locateSidx(head);
        if (found) return found;
        // Chua thay: hoac doan dau qua ngan, hoac file khong co chi muc. Noi
        // rong toi mot muc roi thoi, khong keo ca file ve chi de tim.
        if (want >= 1048576 || head.length < want) {
          throw new Error('luong nay khong co bang chi muc');
        }
        want *= 4;
        return grow();
      });
    }

    return grow().then(function (found) {
      if (found.start + found.size <= head.length) return found;
      return fetchRange(url, 0, found.start + found.size - 1).then(function (bytes) {
        head = bytes;
        return found;
      });
    }).then(function (found) {
      return {
        // ftyp + moov: phan mo dau phai nap truoc moi doan nao.
        init: head.slice(0, found.start),
        segments: parseSidx(head, found.start, found.size),
      };
    });
  }

  /** Cho tay nap xong mot doan roi moi nap doan sau — MSE khong nhan hai lan chong nhau. */
  function appendOnce(buffer, bytes) {
    return new Promise(function (resolve, reject) {
      function done() {
        stop();
        resolve();
      }
      function failed() {
        stop();
        reject(new Error('trinh duyet khong nhan doan nay'));
      }
      function stop() {
        buffer.removeEventListener('updateend', done);
        buffer.removeEventListener('error', failed);
      }
      buffer.addEventListener('updateend', done);
      buffer.addEventListener('error', failed);
      buffer.appendBuffer(bytes);
    });
  }

  /** Doan chua thoi diem nay, hoac -1 neu da het video. */
  function segmentAt(segments, time) {
    for (var i = 0; i < segments.length; i++) {
      if (time < segments[i].time + segments[i].seconds - 0.001) return i;
    }
    return -1;
  }

  /** Da dem lien mach toi giay nao ke tu cho dang xem. */
  function bufferedEnd(buffer, time) {
    var ranges = buffer.buffered;
    for (var i = 0; i < ranges.length; i++) {
      if (time >= ranges.start(i) - 0.2 && time < ranges.end(i)) return ranges.end(i);
    }
    return time;
  }

  var source = new Source();
  var tracks = [];

  function endIfDone() {
    if (source.readyState !== 'open') return;
    for (var i = 0; i < tracks.length; i++) {
      if (!tracks[i].done || tracks[i].buffer.updating) return;
    }
    try {
      source.endOfStream();
    } catch (err) {
      // dong hai lan thi trinh duyet keu, khong sao ca
    }
  }

  function pump(track) {
    if (track.busy || track.done) return;
    if (source.readyState !== 'open' || track.buffer.updating) return;

    var time = video.currentTime;
    var end = bufferedEnd(track.buffer, time);
    if (end - time >= BUFFER_AHEAD) return;

    var index = segmentAt(track.segments, end);
    if (index < 0) {
      track.done = true;
      endIfDone();
      return;
    }
    // Nap mai mot doan ma cho dem khong nhich thi dung lai, khong quay vong.
    if (index === track.last) {
      track.stuck += 1;
      if (track.stuck > 3) return;
    } else {
      track.last = index;
      track.stuck = 0;
    }

    track.busy = true;
    var segment = track.segments[index];
    fetchRange(track.url, segment.start, segment.end)
      .then(function (bytes) {
        return appendOnce(track.buffer, bytes);
      })
      .then(function () {
        track.fails = 0;
        track.busy = false;
        pump(track);
      })
      .catch(function (err) {
        track.busy = false;
        // Het cho chua: bo phan da xem qua lau roi lat sau thu lai.
        if (err && err.name === 'QuotaExceededError') {
          try {
            if (time > KEEP_BEHIND) track.buffer.remove(0, time - KEEP_BEHIND);
          } catch (ignore) {
            // dang ban thi thoi, vong sau don
          }
          return;
        }
        // Mang chap mot nhip, hoac YouTube cat ngang vi may chu goi qua day:
        // doi mot lat roi xin lai chinh doan do, thua dan ra. Bo cuoc ngay thi
        // khung hinh dung im ma khong ai biet tai sao.
        track.last = -1;
        track.fails += 1;
        if (track.fails > 5) {
          console.warn('HD: xin mai khong duoc doan nay —', err.message);
          return;
        }
        setTimeout(function () {
          pump(track);
        }, 400 * track.fails);
      });
  }

  function pumpAll() {
    for (var i = 0; i < tracks.length; i++) pump(tracks[i]);
  }

  function attach(indexes) {
    return new Promise(function (resolve) {
      source.addEventListener('sourceopen', function () {
        resolve();
      }, { once: true });
      // Toi day moi bo duong /hd cua may chu: tu dau den gio neu hong thi the
      // <video> van con nguyen duong do, nguoi xem khong biet gi ca.
      var tag = video.querySelector('source');
      if (tag) tag.parentNode.removeChild(tag);
      video.removeAttribute('src');
      if (window.ManagedMediaSource) video.disableRemotePlayback = true;
      video.src = URL.createObjectURL(source);
    }).then(function () {
      var length = Number(video.getAttribute('data-len')) || 0;
      if (length > 0) source.duration = length;

      var chain = Promise.resolve();
      ['video', 'audio'].forEach(function (kind, i) {
        var buffer = source.addSourceBuffer(streams[kind].mime);
        buffer.mode = 'segments';
        var track = {
          buffer: buffer,
          url: streams[kind].url,
          segments: indexes[i].segments,
          busy: false,
          done: false,
          last: -1,
          stuck: 0,
          fails: 0,
        };
        tracks.push(track);
        chain = chain.then(function () {
          return appendOnce(buffer, indexes[i].init);
        });
      });
      return chain;
    });
  }

  Promise.all([readIndex(streams.video.url), readIndex(streams.audio.url)])
    .then(attach)
    .then(function () {
      var note = document.getElementById('hdnote');
      if (note) {
        note.innerHTML =
          'Xem thẳng ' +
          video.getAttribute('data-h') +
          'p — trình duyệt tự ghép hình với tiếng nên <b>tua được</b> bình thường,' +
          ' và máy chủ không phải làm gì ngoài chuyển tiếp dữ liệu.';
      }
      // Chua bam phat thi chua tai doan nao: giong preload="none" cua the video.
      ['play', 'seeking', 'timeupdate', 'waiting'].forEach(function (name) {
        video.addEventListener(name, pumpAll);
      });
    })
    .catch(function (err) {
      console.warn('HD: khong ghep duoc tren may nay, quay ve duong may chu —', err.message);
      // Da doi sang MSE roi moi hong thi tra the <video> ve duong cu, khong de
      // nguoi xem ngoi truoc mot khung phat chet.
      if (fallback && String(video.src).indexOf('blob:') === 0) {
        video.removeAttribute('src');
        video.src = fallback;
      }
    });
})();
