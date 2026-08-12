/* Hai phan them cho trang, deu la phan them: khong co JavaScript thi trang van
 * chay day du, chi mat dung hai tien do.
 *
 *  1. Dan chan trang xuong day khung nhin (neu may lam duoc that).
 *  2. Phim len/xuong nhay sang khoi video ke tiep.
 *
 * Viet bang ES3 (var, khong arrow, khong template string) cho hop voi may cu:
 * WebKit 533 gap mot chu 'const' la chet ca file, ma chet im lang.
 */
(function () {
  if (!document.getElementsByTagName) return;

  /* ---------- 1. chan trang dan day khung nhin ---------- */

  // Thanh dang dan; con null nghia la van nam cuoi trang nhu thuong.
  var pinned = null;

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

  /** Thanh dan che mat phan duoi trang, nen chua san cho no o cuoi. */
  function spare(nav) {
    document.body.style.paddingBottom = nav.offsetHeight + 'px';
  }

  function pin(nav) {
    document.body.className += ' fixnav';
    spare(nav);
    pinned = nav;

    // Do ngay sau khi doi lop thi con vai diem sai: hinh SVG trong thanh chua
    // kip nhan co moi. Do lai mot nhip sau la dung han.
    if (window.setTimeout) {
      window.setTimeout(function () {
        spare(nav);
      }, 0);
    }

    // N8 xoay ngang la doi ca be ngang lan chieu cao thanh, phai do lai.
    if (window.addEventListener) {
      window.addEventListener(
        'resize',
        function () {
          spare(nav);
        },
        false
      );
    }
  }

  function setUpNav() {
    if (!document.body) return;
    var tables = document.getElementsByTagName('table');
    var nav = null;
    for (var i = 0; i < tables.length; i++) {
      if ((' ' + tables[i].className + ' ').indexOf(' nav ') > -1) nav = tables[i];
    }
    if (!nav) return;

    var known = recall();
    if (known === '1') {
      pin(nav);
      return;
    }
    if (known === '0') return;

    var ok = measurePin();
    memorize(ok);
    if (ok) pin(nav);
  }

  setUpNav();

  /* ---------- 2. dieu huong bang phim ---------- */

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

  /** Cac diem dung theo dung thu tu tren trang. Bo qua logo o thanh tren. */
  function stops() {
    var list = [];
    var nodes = document.getElementsByTagName('a');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el.getAttribute('href')) continue;
      if ((' ' + el.className + ' ').indexOf(' brand ') > -1) continue;
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
   * Thanh dan nam de len phan duoi khung nhin, nen khoi vua nhay toi co the
   * nam ngay duoi no: cuon them dung phan bi che.
   */
  function clearNav(el) {
    if (!pinned || !el.getBoundingClientRect || !window.scrollBy) return;
    var room = document.documentElement.clientHeight - pinned.offsetHeight;
    var over = el.getBoundingClientRect().bottom - room;
    if (over > 0) window.scrollBy(0, Math.ceil(over));
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
        clearNav(el);
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
