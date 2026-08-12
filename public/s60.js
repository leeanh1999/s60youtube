/* Dieu huong bang phim cho Nokia E6.
 *
 * Mac dinh trinh duyet Symbian day mot con tro nho chay tu do tren trang: bam
 * xuong mot cai la con tro nhich vai diem anh, muon qua duoc mot video phai
 * bam chuc lan. O day chan phim len/xuong lai, chuyen thanh "nhay sang muc ke
 * tiep": moi the video la mot the <a> duy nhat nen mot lan bam = mot video.
 *
 * Chi la phan them: khong co JavaScript thi trang van chay nhu cu, con phim
 * so 0-9 van la accesskey do chinh trinh duyet lo.
 *
 * Viet bang ES3 (var, khong arrow, khong querySelectorAll bat buoc) cho hop
 * voi may cu.
 */
(function () {
  if (!document.addEventListener || !document.getElementsByTagName) return;

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
