/* Ba phan them cho trang, deu la phan them: khong co JavaScript thi trang van
 * chay day du, chi mat dung ba tien do.
 *
 *  1. Dan thanh tren va chan trang vao khung nhin (neu may lam duoc that).
 *  2. Kinh lup o thanh tren mo khung tim kiem ngay tai cho, may nao cung mo
 *     duoc, thay vi phai sang trang /search.
 *  3. Phim len/xuong nhay sang khoi video ke tiep; phim trai/phai di trong
 *     nhung hang nam ngang, va nhay thang toi 'Quay lai' / 'Trang sau'.
 *
 * Viet bang ES3 (var, khong arrow, khong template string) cho hop voi may cu:
 * WebKit 533 gap mot chu 'const' la chet ca file, ma chet im lang.
 */
(function () {
  if (!document.getElementsByTagName) return;

  /* ---------- 1. dan thanh tren va chan trang ---------- */

  /** Phan tu dau tien mang mot ten lop, khong can querySelector. */
  function firstOf(tag, name) {
    var nodes = document.getElementsByTagName(tag);
    for (var i = 0; i < nodes.length; i++) {
      if ((' ' + nodes[i].className + ' ').indexOf(' ' + name + ' ') > -1) return nodes[i];
    }
    return null;
  }

  var bar = firstOf('div', 'bar');
  var nav = firstOf('table', 'nav');
  // Hai thanh da dan chua; chua dan thi chung nam trong dong chay nhu thuong.
  var pinned = false;

  /**
   * Co dan that hay khong. Phai do chu khong the tin: nhieu ban WebKit doi
   * Symbian nhan 'position: fixed' roi xu ly nhu 'absolute' — thanh dan vao
   * trang chu khong vao khung nhin, cuon xuong la no troi mat len tren. Bat
   * bua thi mat luon chan trang, tinh ra con te hon la khong dan.
   *
   * Cach do: dat mot o ti hon dan sat dinh, cuon di vai diem roi xem toa do
   * cua no so voi khung nhin co doi khong. Dan dung thi khong doi.
   */
  function pinWorks() {
    var probe = document.createElement('div');
    if (!probe.getBoundingClientRect || !window.scrollTo) return false;

    probe.style.position = 'fixed';
    probe.style.top = '0';
    probe.style.left = '0';
    probe.style.width = '1px';
    probe.style.height = '1px';
    document.body.appendChild(probe);

    var was = scrolled();
    var before = probe.getBoundingClientRect().top;
    window.scrollTo(0, was + 2);
    var moved = scrolled() - was;
    var after = probe.getBoundingClientRect().top;
    window.scrollTo(0, was);
    document.body.removeChild(probe);

    if (moved <= 0) return false;
    var slip = after - before;
    return slip < 1 && slip > -1;
  }

  function scrolled() {
    if (typeof window.pageYOffset === 'number') return window.pageYOffset;
    return document.documentElement.scrollTop || document.body.scrollTop || 0;
  }

  function scrollable() {
    var doc = document.documentElement;
    var height = Math.max(doc.scrollHeight, document.body.scrollHeight);
    return height > doc.clientHeight + 2;
  }

  /**
   * Trang ngan hon man hinh thi khong cuon duoc, ma khong cuon thi khong do
   * duoc. Keo tam cho no dai ra vai diem roi tra lai ngay trong cung mot nhip:
   * may chua kip ve lai nen nguoi dung khong thay gi nhay.
   */
  function measurePin() {
    if (scrollable()) return pinWorks();
    var was = document.body.style.minHeight;
    document.body.style.minHeight = document.documentElement.clientHeight + 40 + 'px';
    var ok = pinWorks();
    document.body.style.minHeight = was;
    return ok;
  }

  /**
   * Ket qua do nho lai theo tung may, de moi trang sau do khong phai cuon thu
   * lai lan nua. May tat luu tru thi do lai moi lan, cung khong sao.
   */
  function recall() {
    try {
      return window.localStorage.getItem('s60-pin');
    } catch (err) {
      return null;
    }
  }

  function memorize(ok) {
    try {
      window.localStorage.setItem('s60-pin', ok ? '1' : '0');
    } catch (err) {
      /* Che do rieng tu hoac may tat luu tru: lan sau do lai, khong sao. */
    }
  }

  /** Hai thanh dan de len trang, nen chua san cho o dinh va o day. */
  function spare() {
    var style = document.body.style;
    if (bar) style.paddingTop = bar.offsetHeight + 'px';
    if (nav) style.paddingBottom = nav.offsetHeight + 'px';
  }

  function pin() {
    document.body.className += ' fixnav';
    pinned = true;
    spare();

    // Do ngay sau khi doi lop thi con vai diem sai: hinh SVG trong thanh chua
    // kip nhan co moi. Do lai mot nhip sau la dung han.
    if (window.setTimeout) window.setTimeout(spare, 0);

    // N8 xoay ngang la doi ca be ngang lan chieu cao thanh, phai do lai.
    if (window.addEventListener) window.addEventListener('resize', spare, false);
  }

  function setUpPins() {
    if (!document.body || (!bar && !nav)) return;

    var known = recall();
    if (known === '0') return;
    if (known === '1') {
      pin();
      return;
    }

    var ok = measurePin();
    memorize(ok);
    if (ok) pin();
  }

  setUpPins();

  /* ---------- 2. kinh lup mo khung tim kiem ---------- */

  /**
   * May dan duoc thanh thi khung tim nam dan ngay duoi thanh. May khong dan
   * duoc thi dat khung bang 'absolute' vao dung dinh khung nhin luc bam: no
   * khong theo trang khi cuon, nhung vua bam la nhin thay ngay — quan trong hon
   * la bat nguoi ta sang mot trang khac chi de go mot dong chu.
   */
  function popTop() {
    if (!bar) return scrolled();
    if (pinned) return bar.offsetHeight;
    // Chua cuon qua thanh thi de khung ngay duoi thanh cho khoi che ten trang.
    return Math.max(scrolled(), bar.offsetHeight);
  }

  function setUpFind() {
    var link = firstOf('a', 'find');
    var pop = document.getElementById('pop');
    if (!link || !pop) return;

    var box = pop.getElementsByTagName('input')[0];

    function stop(event) {
      if (!event) return;
      if (event.preventDefault) event.preventDefault();
      event.returnValue = false;
    }

    function open(event) {
      pop.style.position = pinned ? 'fixed' : 'absolute';
      pop.style.top = popTop() + 'px';
      pop.className = 'on';
      // Khung khong con nut dong nao, nen phai noi cho nguoi ta biet duong ra:
      // to nen cho kinh lup thanh dang an xuong, bam lai chinh no la dong.
      link.className = 'find on';
      if (box) {
        try {
          box.focus();
          // Tu khoa vua tim con nguyen trong o; dua con tro ra sau chu cuoi de
          // go tiep la noi duoi, chu khong chen vao dau dong.
          if (box.setSelectionRange) box.setSelectionRange(box.value.length, box.value.length);
        } catch (err) {
          /* May khong cho dat con tro thi nguoi dung tu bam vao o. */
        }
      }
      stop(event);
      return false;
    }

    function shut(event) {
      pop.className = '';
      link.className = 'find';
      stop(event);
      return false;
    }

    // Bam kinh lup lan nua la dong. Do la duong dong duy nhat cua khung, nen no
    // phai chac: khung nam ngay duoi thanh chu khong de len, kinh lup luon lo ra.
    link.onclick = function (event) {
      return pop.className === 'on' ? shut(event) : open(event);
    };
    // Phim C tren may Nokia bao ve trinh duyet la Esc (27) — dong khung cho gon.
    if (box) {
      box.onkeydown = function (event) {
        if ((event.keyCode || event.which) === 27) shut(event);
      };
    }
  }

  setUpFind();

  /* ---------- 3. dieu huong bang phim ---------- */

  if (!document.addEventListener) return;

  // Trang Cai dat co o chon: trong the <select> thi len/xuong la doi gia tri,
  // gianh lay phim se lam nguoi dung khong sua duoc gi. Nhung trang do khong co
  // danh sach video nen cu de nguyen phim cho trinh duyet.
  if (document.getElementsByTagName('select').length) return;

  var UP = 38;
  var DOWN = 40;
  var LEFT = 37;
  var RIGHT = 39;

  /**
   * Lien ket co that su hien tren trang hay khong. Can loc vi lien ket du
   * phong nam trong the <video> van co trong DOM nhung may hieu <video> thi
   * khong ve no ra — nhay vao do la mac ket, bam xuong may lan cung khong
   * nhich duoc.
   */
  function shown(el) {
    if (el.offsetParent) return true;
    return !!(el.offsetWidth || el.offsetHeight);
  }

  /**
   * Cac diem dung theo dung thu tu tren trang. Chi bo qua ten trang o thanh tren:
   * no la duong ve trang chinh, ma chan trang da co san mot o 'Trang chinh' roi.
   *
   * Kinh lup thi PHAI co trong hang, du no da co phim tat `*`: khong phai may nao
   * cung bam duoc dau `*` de dang, ma bo ra ngoai hang thi nguoi chi dung phim
   * di chuyen khong con duong nao toi cho tim kiem.
   */
  /**
   * Nho lai danh sach nay: trang khong tu them bo lien ket nao, ma do lai thi
   * phai duyet ca cay DOM va hoi `offsetParent` cua tung the — moi lan hoi la
   * mot lan bat trinh duyet tinh lai bo cuc. Tren E6 mot lan bam phim con phai
   * qua ba lan do nhu vay (len/xuong mot lan, trai/phai hai lan), do la cho giat
   * ro nhat khi giu phim di trong danh sach dai. Xoay may thi do lai.
   */
  var cached = null;

  function stops() {
    if (cached) return cached;
    var list = [];
    var nodes = document.getElementsByTagName('a');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el.getAttribute('href')) continue;
      if ((' ' + el.className + ' ').indexOf(' brand ') > -1) continue;
      if (!shown(el)) continue;
      list.push(el);
    }
    cached = list;
    return list;
  }

  if (window.addEventListener) {
    window.addEventListener(
      'resize',
      function () {
        cached = null;
      },
      false
    );
  }

  function positionOf(list) {
    var active = document.activeElement;
    if (!active) return -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i] === active) return i;
    }
    return -1;
  }

  /**
   * Hai thanh dan de len dinh va day khung nhin, nen khoi vua nhay toi co the
   * nam khuat sau chung: cuon them dung phan bi che.
   *
   * Do lai toa do sau moi lan cuon, va xet dinh sau cung: khoi cao hon cho
   * trong thi tha de ho phan duoi, con phan dau thi phai thay.
   */
  /** Muc nay co nam trong thanh do khong (thanh tren hoac chan trang). */
  function inside(el, box) {
    for (var up = el; up; up = up.parentNode) {
      if (up === box) return true;
    }
    return false;
  }

  function clearBars(el) {
    if (!pinned || !el.getBoundingClientRect || !window.scrollBy) return;
    // Chinh muc trong thanh dan thi khoi chua: thanh dan vao khung nhin roi,
    // cuon them chi lam trang truot di chu khong lam no lo ra hon.
    if ((bar && inside(el, bar)) || (nav && inside(el, nav))) return;
    if (nav) {
      var room = document.documentElement.clientHeight - nav.offsetHeight;
      var under = el.getBoundingClientRect().bottom - room;
      if (under > 0) window.scrollBy(0, Math.ceil(under));
    }
    if (bar) {
      var over = bar.offsetHeight - el.getBoundingClientRect().top;
      if (over > 0) window.scrollBy(0, -Math.ceil(over));
    }
  }

  /** Dua con tro toi mot muc va keo no ra cho nhin thay. */
  function land(el, upward) {
    try {
      el.focus();
    } catch (err) {
      return false;
    }
    if (document.activeElement !== el) return false;
    // scrollIntoViewIfNeeded co san trong WebKit va chi cuon khi that su
    // can, nho vay danh sach khong giat len giat xuong.
    if (el.scrollIntoViewIfNeeded) el.scrollIntoViewIfNeeded();
    else if (el.scrollIntoView) el.scrollIntoView(!!upward);
    clearBars(el);
    return true;
  }

  /** Tra ve true khi da nhay duoc; false thi de trinh duyet cuon nhu thuong. */
  function step(direction) {
    var list = stops();
    if (!list.length) return false;

    var at = positionOf(list);
    var next = at < 0 ? (direction > 0 ? 0 : list.length - 1) : at + direction;

    // Muc nao nhan khong duoc con tro thi di tiep, chu khong dung lai giua
    // duong roi bam may lan cung khong nhich.
    while (next >= 0 && next < list.length) {
      if (land(list[next], direction < 0)) return true;
      next += direction;
    }
    return false;
  }

  /**
   * Hai muc coi la cung mot hang khi phan chong nhau theo chieu doc an het qua
   * nua cai thap hon. Do bang toa do that chu khong doc the <tr>: chan trang la
   * bang, nhung 'Quay lai' voi kinh lup chi la hai the <a> canh nhau trong mot o.
   */
  function sameRow(a, b) {
    var over = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (over <= 0) return false;
    var thin = Math.min(a.bottom - a.top, b.bottom - b.top);
    return thin > 0 && over * 2 >= thin;
  }

  /** Muc gan nhat nam ben trai (hoac ben phai) muc dang chon, cung mot hang. */
  function beside(here, direction) {
    if (!here.getBoundingClientRect) return null;
    var from = here.getBoundingClientRect();
    var list = stops();
    var best = null;
    var near = 0;
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el === here || !el.getBoundingClientRect) continue;
      var box = el.getBoundingClientRect();
      if (!sameRow(from, box)) continue;
      // Cho chong nhau 2 diem: vien va le am hay lam hai muc sat nhau dinh nhau.
      var gap = direction > 0 ? box.left - from.right : from.left - box.right;
      if (gap < -2) continue;
      if (!best || gap < near) {
        best = el;
        near = gap;
      }
    }
    return best;
  }

  /** Muc dau (hoac muc cuoi) cua phan noi dung, khong tinh hai thanh. */
  function edge(direction) {
    var main = document.getElementById('main');
    if (!main) return null;
    var list = stops();
    for (var i = 0; i < list.length; i++) {
      var el = list[direction > 0 ? list.length - 1 - i : i];
      if (inside(el, main)) return el;
    }
    return null;
  }

  /**
   * Trai/phai. Danh sach xep mot cot nen phan lon trang khong co gi nam ngang
   * that; de nguyen thi hai phim nay bam nhu khong, ma tren may Nokia thi phim
   * nao cung dat. Cho chung mot nghia duy nhat la LUI va TIEN, doc theo thu tu
   * trang, roi tuy cho dang dung ma ra viec:
   *
   *  1. Dang o trong mot hang nam ngang (bon o chan trang, hay 'Quay lai' voi
   *     kinh lup o thanh tren) thi di trong hang do, khong nhay ra ngoai.
   *  2. Dang trong danh sach thi phai la xuong cuoi, trai la ve dau. Danh sach
   *     dai muoi may khoi, bam xuong tung cai toi cuoi thi moi tay; phim phai
   *     dua thang toi 'Trang sau' o cuoi trang ket qua.
   *  3. Da o dau danh sach roi ma con bam trai thi ra 'Quay lai' o thanh tren.
   *
   * Chi dua con tro toi cho chu khong bam ho: lo tay cham phim ma no chuyen
   * trang luon thi kho chiu, ma phim mui ten rat de cham.
   */
  function sideways(direction) {
    var here = document.activeElement;
    if (here === document.body || !here) here = null;

    if (here) {
      var next = beside(here, direction);
      if (next) return land(next, direction < 0);
      // Trong thanh tren hay chan trang thi het hang la het duong: hai thanh do
      // khong phai la danh sach de ma noi dau voi cuoi.
      if ((bar && inside(here, bar)) || (nav && inside(here, nav))) return false;
    }

    var far = edge(direction);
    if (far && far !== here && land(far, direction < 0)) return true;
    if (direction > 0) return false;

    var back = firstOf('a', 'back');
    return !!back && back !== here && land(back, true);
  }

  /** Dang go trong o tim kiem thi phim mui ten la de di trong chu. */
  function editing(el) {
    if (!el || !el.tagName) return false;
    var tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
  }

  document.addEventListener(
    'keydown',
    function (event) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (editing(event.target || event.srcElement)) return;

      var code = event.keyCode || event.which;
      var went = false;
      if (code === UP || code === DOWN) went = step(code === DOWN ? 1 : -1);
      else if (code === LEFT || code === RIGHT) went = sideways(code === RIGHT ? 1 : -1);
      else return;

      // Khong di duoc thi de nguyen phim cho trinh duyet: no con biet cuon
      // ngang, ma khong cuon duoc thi bam cung khong hong gi.
      if (went) {
        if (event.preventDefault) event.preventDefault();
        event.returnValue = false;
      }
    },
    false
  );
})();
