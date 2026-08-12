/* Ba phan them cho trang, deu la phan them: khong co JavaScript thi trang van
 * chay day du, chi mat dung ba tien do.
 *
 *  1. Dan thanh tren va chan trang vao khung nhin (neu may lam duoc that).
 *  2. Kinh lup o thanh tren mo khung tim kiem ngay tai cho, may nao cung mo
 *     duoc, thay vi phai sang trang /search.
 *  3. Phim len/xuong nhay sang khoi video ke tiep.
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
    var close = firstOf('a', 'popx');

    function stop(event) {
      if (!event) return;
      if (event.preventDefault) event.preventDefault();
      event.returnValue = false;
    }

    function open(event) {
      pop.style.position = pinned ? 'fixed' : 'absolute';
      pop.style.top = popTop() + 'px';
      pop.className = 'on';
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
      stop(event);
      return false;
    }

    // Bam kinh lup lan nua la dong: khong co chuot de bam ra ngoai, va nut Dong
    // thi nam duoi khung — dang mo ma bam lai cai vua bam la phan xa tu nhien.
    link.onclick = function (event) {
      return pop.className === 'on' ? shut(event) : open(event);
    };
    if (close) close.onclick = shut;
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
   * Cac diem dung theo dung thu tu tren trang. Bo qua logo va kinh lup o thanh
   * tren: hai cai do co phim tat rieng (0 va *) va nam trong thanh dan luon thay,
   * de chung trong hang thi moi trang deu phai bam qua chung truoc khi toi video.
   */
  function stops() {
    var list = [];
    var nodes = document.getElementsByTagName('a');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el.getAttribute('href')) continue;
      var mark = ' ' + el.className + ' ';
      if (mark.indexOf(' brand ') > -1 || mark.indexOf(' find ') > -1) continue;
      if (!shown(el)) continue;
      list.push(el);
    }
    return list;
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
  function clearBars(el) {
    if (!pinned || !el.getBoundingClientRect || !window.scrollBy) return;
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

  /** Tra ve true khi da nhay duoc; false thi de trinh duyet cuon nhu thuong. */
  function step(direction) {
    var list = stops();
    if (!list.length) return false;

    var at = positionOf(list);
    var next = at < 0 ? (direction > 0 ? 0 : list.length - 1) : at + direction;

    // Muc nao nhan khong duoc con tro thi di tiep, chu khong dung lai giua
    // duong roi bam may lan cung khong nhich.
    while (next >= 0 && next < list.length) {
      var el = list[next];
      try {
        el.focus();
      } catch (err) {
        el = null;
      }
      if (el && document.activeElement === el) {
        // scrollIntoViewIfNeeded co san trong WebKit va chi cuon khi that su
        // can, nho vay danh sach khong giat len giat xuong.
        if (el.scrollIntoViewIfNeeded) el.scrollIntoViewIfNeeded();
        else if (el.scrollIntoView) el.scrollIntoView(direction < 0);
        clearBars(el);
        return true;
      }
      next += direction;
    }
    return false;
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
      if (code !== UP && code !== DOWN) return;

      if (step(code === DOWN ? 1 : -1)) {
        if (event.preventDefault) event.preventDefault();
        event.returnValue = false;
      }
    },
    false
  );
})();
