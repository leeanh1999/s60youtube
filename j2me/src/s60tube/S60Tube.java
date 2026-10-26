package s60tube;

import java.io.IOException;
import java.util.Vector;

import javax.microedition.lcdui.Command;
import javax.microedition.lcdui.CommandListener;
import javax.microedition.lcdui.Display;
import javax.microedition.lcdui.Displayable;
import javax.microedition.lcdui.Form;
import javax.microedition.lcdui.ItemCommandListener;
import javax.microedition.lcdui.ItemStateListener;
import javax.microedition.lcdui.TextField;
import javax.microedition.midlet.MIDlet;
import javax.microedition.midlet.MIDletStateChangeException;

/**
 * App YouTube cho Nokia E6. Moi viec nang (tim kiem, lay luong, chuyen ma) van
 * do may chu lam; app ve giao dien giong ban web (xem Page, Item, Ui) va dung
 * phim mem cua may.
 */
public class S60Tube extends MIDlet
        implements Page.Host, CommandListener, ItemStateListener, ItemCommandListener {

    private static final String APP = "S60Tube";

    private final Command cmdOk = new Command("OK", Command.OK, 1);
    private final Command cmdSearch = new Command("Tìm", Command.OK, 1);
    private final Command cmdCancel = new Command("Quay lại", Command.BACK, 1);

    private Display display;
    private ThumbLoader thumbs;
    private final Vector history = new Vector();

    /** Tang moi khi bo mot viec dang cho; ket qua ve tre thi bo qua. */
    private int ticket;

    private Page home;
    /**
     * O nhap cua may la Form co mot TextField chu khong phai TextBox: BlackBerry
     * giau nut OK cua TextBox trong menu va phim Enter thi xuong dong. Form cho
     * dat nut mac dinh tren o chu (bam trackpad/OK la chay) va bat duoc luc
     * Enter chen dau xuong dong de chay thay.
     */
    private Form searchBox;
    private TextField searchField;
    private Form serverBox;
    private TextField serverField;
    private String lastQuery = "";
    private String loginCode = "";

    protected void startApp() throws MIDletStateChangeException {
        if (display != null) {
            // Quay lai sau khi an app (nghe nhac nen): hien lai trang dang xem.
            if (display.getCurrent() == null) {
                display.setCurrent(current());
            }
            return;
        }
        display = Display.getDisplay(this);
        String jadServer = getAppProperty("S60Tube-Server");
        if (jadServer != null && jadServer.trim().length() > 0) {
            Settings.defaultServer = Settings.normalize(jadServer);
        }
        Settings.load();
        Ui.setup();
        thumbs = new ThumbLoader();
        thumbs.start();
        home = new Page(this, APP);
        home.kind = "home";
        home.rightIcon = Ui.ICON_EXIT;
        display.setCurrent(home);
        hello();
    }

    protected void pauseApp() {
    }

    protected void destroyApp(boolean unconditional) {
        Audio.stopAll();
        if (thumbs != null) {
            thumbs.stop();
        }
    }

    // ---------- dieu huong ----------

    /**
     * Trang dang xem. Luc dang go chu (TextBox) hay xem phim thi la trang da mo
     * cac thu do — nho trong lastPage.
     */
    private Page current() {
        Displayable d = display.getCurrent();
        if (d instanceof Page) {
            return (Page) d;
        }
        return lastPage != null ? lastPage : home;
    }

    /** Mo trang moi, giu trang dang xem de Quay lai. */
    private void open(Page page) {
        Page from = current();
        if (from != page) {
            history.addElement(from);
        }
        display.setCurrent(page);
    }

    /** Mo man hinh cua may (o nhap chu) — nho trang dang xem de quay ve. */
    private void showNative(Displayable screen) {
        lastPage = current();
        display.setCurrent(screen);
    }

    private void back() {
        Item input = null;
        Page now = current();
        if ("search".equals(now.kind)) {
            input = searchInput(now);
        }
        if (input != null) {
            lastQuery = input.title;
        }
        if (history.isEmpty()) {
            if (current() == home) {
                exit();
            } else {
                display.setCurrent(home);
            }
            return;
        }
        Page previous = (Page) history.lastElement();
        history.removeElementAt(history.size() - 1);
        display.setCurrent(previous);
    }

    private void goHome() {
        history.removeAllElements();
        display.setCurrent(home);
    }

    private void exit() {
        destroyApp(true);
        notifyDestroyed();
    }

    /** Viec mang: duong dan + viec lam khi co ket qua. */
    abstract static class Job {
        final String path;

        Job(String path) {
            this.path = path;
        }

        abstract void done(Vector rows);
    }

    /** Hien hop cho tren trang roi goi may chu tren luong rieng. */
    private void work(final Page on, String text, final Job job) {
        on.setBusy(text);
        final int mine = ++ticket;
        new Thread() {
            public void run() {
                try {
                    Vector rows = Api.get(job.path);
                    if (mine != ticket) {
                        return;
                    }
                    on.setBusy(null);
                    job.done(rows);
                    on.changed();
                } catch (Throwable e) {
                    if (mine == ticket) {
                        on.showToast("Không kết nối được máy chủ " + Settings.server + "\n" + e, Item.TONE_ERR);
                    }
                }
            }
        }.start();
    }

    /** Dong 'E' dau tien (neu co) — loi do may chu viet san bang tieng Viet. */
    private static String errorOf(Vector rows) {
        String[] row = Api.first(rows, 'E');
        return row == null ? null : Api.field(row, 1);
    }

    private static String join(String a, String b) {
        if (a.length() == 0) {
            return b;
        }
        if (b.length() == 0) {
            return a;
        }
        return a + " · " + b;
    }

    // ---------- khoi dong: xin ma thiet bi ----------

    private void hello() {
        history.removeAllElements();
        display.setCurrent(home);
        work(home, "Đang nối máy chủ…", new Job("/api/hello") {
            void done(Vector rows) {
                String[] d = Api.first(rows, 'D');
                if (d == null) {
                    String error = errorOf(rows);
                    showError(home, error != null ? error
                            : "Máy chủ trả lời lạ — kiểm tra địa chỉ trong Cài đặt.");
                    return;
                }
                if (!Api.field(d, 1).equals(Settings.device)) {
                    Settings.device = Api.field(d, 1);
                    Settings.save();
                }
                loadHome();
            }
        });
    }

    /** Bao loi tren trang chinh kem duong vao Cai dat — de con sua duoc dia chi. */
    private void showError(Page page, String message) {
        page.clear();
        page.add(Item.of(Item.NOTE, message).tone(Item.TONE_ERR));
        page.add(Item.of(Item.BUTTON, "Thử lại").icon(Ui.ICON_RELOAD).act("hello", null));
        page.add(Item.of(Item.OPTION, "Cài đặt").sub(Settings.server).icon(Ui.ICON_GEAR).act("settings", null));
    }

    // ---------- danh sach video ----------

    /** Dong V: id, tieu de, kenh, thoi luong, luot xem — thanh mot the .card. */
    private void addVideo(Page page, String[] row) {
        String id = Api.field(row, 1);
        String duration = Api.field(row, 4);
        Item card = Item.of(Item.CARD, Api.field(row, 2))
                .sub(Api.field(row, 3))
                .act("video", id);
        if (Settings.thumbs) {
            // Thoi luong nam tren goc anh nhu ban web; tat anh thi ve dong chu.
            card.badge = duration;
            card.meta(Api.field(row, 5));
        } else {
            card.meta(join(duration, Api.field(row, 5)));
        }
        page.add(card);
        if (Settings.thumbs) {
            thumbs.request(page, card, id);
        }
    }

    private int addVideos(Page page, Vector rows) {
        int count = 0;
        int at = page.items.size();
        boolean firstBatch = page.playlist.isEmpty();
        for (int i = 0; i < rows.size(); i++) {
            String[] row = (String[]) rows.elementAt(i);
            if ("V".equals(row[0])) {
                addVideo(page, row);
                page.playlist.addElement(new String[] {Api.field(row, 1), Api.field(row, 2)});
                count++;
            }
        }
        // Trang video da co nut "Nghe nhac trong app" (bai do roi toi video lien quan).
        if (firstBatch && count >= 2 && !"video".equals(page.kind)) {
            page.insert(at, Item.of(Item.OPTION, "Nghe lần lượt cả danh sách").icon(Ui.ICON_NOTE)
                    .sub("Chỉ tiếng, tự sang bài sau").act("listall", null));
        }
        return count;
    }

    private void loadHome() {
        work(home, "Đang tải trang chính…", new Job("/api/home") {
            void done(Vector rows) {
                home.clear();
                boolean linked = true;
                for (int i = 0; i < rows.size(); i++) {
                    String[] row = (String[]) rows.elementAt(i);
                    if ("W".equals(row[0])) {
                        home.add(Item.of(Item.NOTE, Api.field(row, 1)).tone(Item.TONE_WARN));
                        if (Api.field(row, 1).indexOf("chưa nối") >= 0) {
                            linked = false;
                        }
                    }
                }
                if (!linked) {
                    home.add(Item.of(Item.BUTTON, "Đăng nhập").icon(Ui.ICON_USER).act("login", null));
                }
                home.add(Item.of(Item.SEARCHBAR, "").sub("Tìm video hoặc dán link").act("search", null));
                int start = home.items.size();
                home.add(Item.of(Item.HEAD, "Gợi ý cho bạn"));
                if (addVideos(home, rows) == 0) {
                    home.items.removeElementAt(start);
                }
            }
        });
    }

    /**
     * O tim kiem. BlackBerry dung o tu ve tren trang (go thang bang ban phim
     * QWERTY, Enter de tim) vi TextBox cua no khong bam OK duoc; may khac dung
     * TextBox de go duoc tieng Viet. initial: chu cai vua go o trang khac.
     */
    private void askSearch(String initial) {
        showSearchPage(initial);
    }

    private void askNativeSearch(String text) {
        if (searchBox == null) {
            // Khong dat nhan: BlackBerry ve nhan ngay trong o, trong nhu chu da go ma khong xoa duoc.
            searchField = new TextField(null, "", 200, TextField.ANY);
            searchBox = inputForm("Từ khoá hoặc link YouTube", searchField, cmdSearch);
        }
        searchField.setString(text);
        showNative(searchBox);
    }

    /**
     * Trang tim kiem tu ve: o tim bo tron, nut Tim, cac lan tim gan day. May co
     * ban phim QWERTY (E6, BlackBerry) go thang vao o; may ban phim so, may cam
     * ung, hay can go tieng Viet co dau thi bam vao o de mo o nhap cua may.
     */
    private void showSearchPage(String initial) {
        Page page = current();
        Item input = searchInput(page);
        if (input == null || !"search".equals(page.kind)) {
            page = new Page(this, "Tìm kiếm");
            page.kind = "search";
            open(page);
            input = null;
        }
        String text = initial != null ? initial : input != null ? input.title : lastQuery;
        buildSearchPage(page, text);
    }

    private void buildSearchPage(Page page, String text) {
        page.clear();
        page.add(Item.of(Item.INPUT, text).act("search-go", null).sub("Tìm video hoặc dán link YouTube"));
        page.add(Item.of(Item.BUTTON, "Tìm").icon(Ui.ICON_SEARCH).act("search-go", null));
        page.add(Item.of(Item.OPTION, "Gõ tiếng Việt có dấu").icon(Ui.ICON_INFO).act("search-native", null)
                .sub("Mở ô nhập của máy"));
        page.add(Item.of(Item.TEXT, Page.qwerty
                ? "Gõ bằng bàn phím, Enter để tìm, phím xoá để xoá chữ."
                : "Bấm vào ô tìm để gõ chữ."));
        if (!Settings.history.isEmpty()) {
            page.add(Item.of(Item.HEAD, "Tìm gần đây"));
            for (int i = 0; i < Settings.history.size(); i++) {
                String q = (String) Settings.history.elementAt(i);
                page.add(Item.of(Item.OPTION, q).icon(Ui.ICON_HISTORY).act("search-q", q));
            }
            page.add(Item.of(Item.OPTION, "Xoá lịch sử tìm").icon(Ui.ICON_EXIT).act("search-clear", null));
        }
        page.changed();
    }

    private static Item searchInput(Page page) {
        for (int i = 0; i < page.items.size(); i++) {
            Item item = (Item) page.items.elementAt(i);
            if (item.type == Item.INPUT) {
                return item;
            }
        }
        return null;
    }

    private void search(final String query) {
        lastQuery = query;
        Settings.remember(query);
        final Page page = new Page(this, query);
        open(page);
        loadResults(page, query, null);
    }

    /** Trang dau hoac trang tiep: trang tiep thi noi vao cuoi, bo nut "Trang sau" cu. */
    private void loadResults(final Page page, final String query, final String token) {
        String path = "/api/search?q=" + Api.encode(query) + (token != null ? "&p=" + Api.encode(token) : "");
        work(page, token == null ? "Đang tìm “" + query + "”…" : "Đang tải thêm…", new Job(path) {
            void done(Vector rows) {
                String[] go = Api.first(rows, 'G');
                if (go != null) {
                    back();
                    openVideo(Api.field(go, 1));
                    return;
                }
                String error = errorOf(rows);
                if (error != null) {
                    page.showToast(error, Item.TONE_ERR);
                    return;
                }
                if (token != null && !page.items.isEmpty()) {
                    page.items.removeElementAt(page.items.size() - 1);
                }
                int count = addVideos(page, rows);
                String[] next = Api.first(rows, 'N');
                if (next != null) {
                    page.add(Item.of(Item.MORE, "Trang sau").icon(Ui.ICON_NEXT).act("more", Api.field(next, 1)));
                }
                if (count == 0 && token == null) {
                    page.add(Item.of(Item.NOTE, "Không thấy video nào cho “" + query + "”."));
                    page.add(Item.of(Item.OPTION, "Tìm từ khác").icon(Ui.ICON_SEARCH).act("search", null));
                }
            }
        });
    }

    // ---------- trang video ----------

    private void openVideo(final String id) {
        final Page page = new Page(this, "Video");
        page.kind = "video";
        open(page);
        work(page, "Đang lấy video… (vài giây)", new Job("/api/watch?v=" + id) {
            void done(Vector rows) {
                String[] meta = Api.first(rows, 'M');
                String title = meta != null ? Api.field(meta, 1) : "Video";
                String author = meta != null ? Api.field(meta, 2) : "";
                String views = meta != null ? Api.field(meta, 3) : "";
                String about = meta != null ? Api.field(meta, 4) : "";
                page.title = title;
                page.add(Item.of(Item.INFO, title).sub(author).meta(views));

                boolean first = true;
                Vector profiles = new Vector();
                for (int i = 0; i < rows.size(); i++) {
                    String[] row = (String[]) rows.elementAt(i);
                    if ("C".equals(row[0])) {
                        String height = Api.field(row, 1);
                        String label = "0".equals(height) || height.length() == 0 ? "Xem" : "Xem " + height + "p";
                        addPlayButtons(page, label, Api.field(row, 2), title, first);
                        first = false;
                    } else if ("A".equals(row[0])) {
                        String path = Api.field(row, 1);
                        Audio.learnKey(path);
                        page.add(Item.of(Item.OPTION, "Nghe nhạc trong app").icon(Ui.ICON_NOTE)
                                .sub("Tiếng gốc YouTube, tắt màn hình vẫn nghe, hết bài tự sang bài sau")
                                .act("listen", id + "\t" + title));
                        page.add(Item.of(Item.OPTION, "Nghe bằng trình duyệt").icon(Ui.ICON_BROWSER)
                                .sub("Khi nghe trong app bị lỗi").act("play", "web\t" + path + "\t" + title));
                    } else if ("P".equals(row[0])) {
                        profiles.addElement(row);
                    } else if ("E".equals(row[0])) {
                        page.add(Item.of(Item.NOTE, Api.field(row, 1)).tone(Item.TONE_ERR));
                    }
                }
                if (!profiles.isEmpty()) {
                    page.add(Item.of(Item.HEAD, "Tạo bản cho máy yếu"));
                    for (int i = 0; i < profiles.size(); i++) {
                        String[] row = (String[]) profiles.elementAt(i);
                        page.add(Item.of(Item.OPTION, Api.field(row, 2)).icon(Ui.ICON_GEAR)
                                .act("convert", id + "\t" + Api.field(row, 1) + "\t" + title));
                    }
                }
                if (about.length() > 0) {
                    page.add(Item.of(Item.OPTION, "Mô tả video").icon(Ui.ICON_INFO).act("about", about));
                }
                int start = page.items.size();
                page.add(Item.of(Item.HEAD, "Video liên quan"));
                if (addVideos(page, rows) == 0) {
                    page.items.removeElementAt(start);
                }
            }
        });
    }

    private void showAbout(String title, String text) {
        Page page = new Page(this, title);
        page.add(Item.of(Item.INFO, title));
        page.add(Item.of(Item.NOTE, text));
        open(page);
    }

    // ---------- phat ----------

    /** Hai nut canh nhau: phat trong app (nut do neu la muc chinh) va mo trinh duyet. */
    private static void addPlayButtons(Page page, String label, String path, String title, boolean primary) {
        page.add(Item.of(primary ? Item.BUTTON : Item.OPTION, label + " trong app").icon(Ui.ICON_PLAY)
                .act("play", "app\t" + path + "\t" + title));
        page.add(Item.of(Item.OPTION, label + " bằng trình duyệt").icon(Ui.ICON_BROWSER)
                .sub("Khi phát trong app bị lỗi").act("play", "web\t" + path + "\t" + title));
    }

    private void play(boolean inApp, String path, String title) {
        Page from = current();
        if (inApp) {
            // Hai trinh phat cung luc thi may thuong khong mo noi cai thu hai.
            Audio.stopAll();
            lastPage = from;
            display.setCurrent(new PlayerCanvas(this, Settings.server + path, title, from));
            return;
        }
        // Dua thang file .mp4 thi Symbian tai het ve roi moi mo; trang co the
        // <video> cua may chu thi trinh duyet xem online duoc (xem /app/play).
        String url = Settings.server + "/app/play?s=" + Api.encode(path) + "&t=" + Api.encode(title);
        try {
            if (platformRequest(url)) {
                from.showToast("Đóng app để máy mở trình duyệt và phát.", Item.TONE_WARN);
            }
        } catch (Exception e) {
            from.showToast("Máy không mở được địa chỉ này:\n" + url + "\n" + e, Item.TONE_ERR);
        }
    }

    // ---------- nghe nhac nen ----------

    /** Trang Dang nghe dang mo (dung lai moi khi doi bai), hoac null. */
    private Page listenPage;

    /** Nghe danh sach tu bai 'from'; mo trang Dang nghe. */
    private void listen(Vector items, int from) {
        if (Audio.onTrack == null) {
            Audio.onTrack = new Runnable() {
                public void run() {
                    // Doi bai xay ra tren luong cua trinh phat: dung lai trang tren luong giao dien.
                    display.callSerially(new Runnable() {
                        public void run() {
                            if (listenPage != null) {
                                buildListening(listenPage);
                            }
                        }
                    });
                }
            };
        }
        Audio.playList(Settings.server, items, from);
        showListening();
    }

    private void showListening() {
        Page page = current();
        if (page != listenPage || listenPage == null) {
            if ("listen".equals(page.kind)) {
                back();
            }
            page = new Page(this, "Đang nghe");
            page.kind = "listen";
            listenPage = page;
            open(page);
        }
        buildListening(page);
    }

    /** Cac nut dieu khien bai dang phat nen va ca danh sach nghe. */
    private void buildListening(Page page) {
        Audio audio = Audio.current();
        page.clear();
        if (audio == null) {
            page.add(Item.of(Item.NOTE, "Không có bài nào đang nghe."));
            page.changed();
            return;
        }
        int pos = Audio.position();
        int total = Audio.size();
        Item info = page.add(Item.of(Item.INFO, audio.title).sub(audio.status())
                .meta(total > 1 ? "Bài " + (pos + 1) + "/" + total : ""));
        Item bar = page.add(Item.of(Item.PROGRESS, ""));
        Item time = page.add(Item.of(Item.TEXT, "--:-- / --:--"));
        Item toggle = page.add(Item.of(Item.BUTTON, "Tạm dừng").icon(Ui.ICON_PAUSE).act("a-toggle", null));
        String[] next = Audio.track(pos + 1);
        if (next != null) {
            page.add(Item.of(Item.OPTION, "Bài sau").icon(Ui.ICON_FORWARD).sub(next[1]).act("a-next", null));
        }
        if (pos > 0) {
            page.add(Item.of(Item.OPTION, "Bài trước").icon(Ui.ICON_REWIND)
                    .sub(Audio.track(pos - 1)[1]).act("a-prev", null));
        }
        page.add(Item.of(Item.OPTION, "Lùi 10 giây").icon(Ui.ICON_REWIND).act("a-rew", null));
        page.add(Item.of(Item.OPTION, "Tới 10 giây").icon(Ui.ICON_FORWARD).act("a-fwd", null));
        page.add(Item.of(Item.OPTION, "Ẩn app, vẫn nghe").icon(Ui.ICON_BACK)
                .sub("Tắt màn hình hay mở app khác vẫn nghe tiếp").act("a-hide", null));
        page.add(Item.of(Item.OPTION, "Dừng nghe").icon(Ui.ICON_EXIT).act("a-stop", null));
        if (total > 1) {
            page.add(Item.of(Item.HEAD, "Danh sách nghe (" + total + " bài)"));
            for (int i = 0; i < total; i++) {
                Item row = Item.of(Item.OPTION, (i + 1) + ". " + Audio.track(i)[1])
                        .icon(i == pos ? Ui.ICON_PLAY : Ui.ICON_NOTE).act("a-jump", String.valueOf(i));
                if (i == pos) {
                    row.badge = "Đang nghe";
                }
                page.add(row);
            }
        }
        Audio.attach(page, info, bar, time, toggle);
        page.changed();
    }

    void playerClosed(Displayable back, String error) {
        display.setCurrent(back);
        if (error != null && back instanceof Page) {
            ((Page) back).showToast("Không phát được trong app: " + error
                    + "\n\nThử nút “… bằng trình duyệt”.", Item.TONE_ERR);
        }
    }

    // ---------- chuyen ma ----------

    private void startConvert(final String id, final String profile, final String title) {
        final Page page = new Page(this, "Chuẩn bị video");
        page.add(Item.of(Item.INFO, title));
        final Item status = page.add(Item.of(Item.TEXT, "Đang gửi yêu cầu…"));
        final Item bar = page.add(new Item(Item.PROGRESS));
        open(page);

        new Thread() {
            public void run() {
                // Quay lai khoi trang thi thoi hoi; viec van chay tiep tren may chu.
                while (current() == page || history.contains(page)) {
                    try {
                        Vector rows = Api.get("/api/convert?v=" + id + "&p=" + profile);
                        String error = errorOf(rows);
                        String[] job = Api.first(rows, 'J');
                        if (error != null || job == null) {
                            page.add(Item.of(Item.NOTE, error != null ? error : "Máy chủ trả lời lạ.")
                                    .tone(Item.TONE_ERR));
                            page.changed();
                            return;
                        }
                        String state = Api.field(job, 1);
                        int progress = parseInt(Api.field(job, 2));
                        bar.progress = progress;
                        if ("done".equals(state)) {
                            bar.progress = 100;
                            status.title = "Xong — chọn cách phát.";
                            addPlayButtons(page, "Phát", Api.field(job, 4), title, true);
                            page.changed();
                            return;
                        }
                        status.title = "queued".equals(state)
                                ? "Đang xếp hàng, thứ " + Api.field(job, 3) + "…"
                                : "Đang chuẩn bị " + progress + "%…";
                        page.changed();
                        Thread.sleep(3000);
                    } catch (IOException e) {
                        status.title = "Mất kết nối: " + e + " — quay lại rồi thử lần nữa.";
                        page.changed();
                        return;
                    } catch (InterruptedException e) {
                        return;
                    }
                }
            }
        }.start();
    }

    private static int parseInt(String value) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    // ---------- dang nhap ----------

    private void login(final Page reuse, boolean fresh) {
        final Page page = reuse != null ? reuse : new Page(this, "Đăng nhập");
        if (reuse == null) {
            open(page);
        }
        String path = "/api/login?c=" + Api.encode(loginCode) + (fresh ? "&new=1" : "");
        work(page, "Đang lấy mã đăng nhập…", new Job(path) {
            void done(Vector rows) {
                String error = errorOf(rows);
                page.clear();
                if (error != null) {
                    page.add(Item.of(Item.NOTE, error).tone(Item.TONE_ERR));
                    return;
                }
                String[] code = Api.first(rows, 'K');
                String[] url = Api.first(rows, 'U');
                String[] state = Api.first(rows, 'S');
                loginCode = code != null ? Api.field(code, 1) : "";
                boolean ready = state != null && "1".equals(Api.field(state, 1));
                boolean own = state != null && "1".equals(Api.field(state, 2));

                page.add(Item.of(Item.NOTE, own ? "Máy này đã nối tài khoản YouTube riêng."
                        : ready ? "Đang dùng tài khoản chung của máy chủ."
                        : "Máy này chưa nối tài khoản YouTube.")
                        .tone(own ? Item.TONE_OK : Item.TONE_WARN));
                page.add(Item.of(Item.HEAD, "Mã ghép nối"));
                page.add(Item.of(Item.CODE, loginCode));
                page.add(Item.of(Item.TEXT, "Trên máy tính, mở địa chỉ dưới đây, nhập mã trên rồi dán"
                        + " nội dung file cookies.txt của YouTube. Mã còn hạn "
                        + (code != null ? Api.field(code, 2) : "?") + " phút."));
                page.add(Item.of(Item.URL, url != null ? Api.field(url, 1) : ""));
                page.add(Item.of(Item.BUTTON, "Kiểm tra lại").icon(Ui.ICON_RELOAD).act("login-check", null));
                page.add(Item.of(Item.OPTION, "Lấy mã mới").icon(Ui.ICON_USER).act("login-new", null));
            }
        });
    }

    // ---------- cai dat ----------

    private static final String[] TEXT_SIZES = {"Nhỏ", "Vừa", "Lớn"};

    private void showSettings(Page reuse) {
        Page page = reuse != null ? reuse : new Page(this, "Cài đặt");
        page.kind = "settings";
        page.clear();
        page.add(Item.of(Item.HEAD, "Tài khoản"));
        page.add(Item.of(Item.OPTION, "Đăng nhập YouTube").sub("Nối tài khoản để xem video cần đăng nhập")
                .icon(Ui.ICON_USER).act("login", null));
        page.add(Item.of(Item.HEAD, "Máy chủ"));
        page.add(Item.of(Item.OPTION, "Địa chỉ máy chủ").sub(Settings.server).icon(Ui.ICON_HOME).act("server", null));
        page.add(Item.of(Item.HEAD, "Hiển thị"));
        page.add(Item.of(Item.OPTION, "Cỡ chữ").sub(TEXT_SIZES[Math.max(0, Math.min(2, Settings.textSize))])
                .icon(Ui.ICON_GEAR).act("textsize", null));
        page.add(Item.of(Item.OPTION, "Ảnh thu nhỏ").sub(Settings.thumbs ? "Bật" : "Tắt — danh sách nhẹ hơn")
                .icon(Ui.ICON_GEAR).act("thumbs", null));
        page.add(Item.of(Item.TEXT, APP + " " + getAppProperty("MIDlet-Version") + " · " + Settings.server
                + (Device.BLACKBERRY ? " · BlackBerry" : "")));
        if (reuse == null) {
            open(page);
        } else {
            page.changed();
        }
    }

    private void askServer() {
        if (serverBox == null) {
            serverField = new TextField(null, "", 200, TextField.URL);
            serverBox = inputForm("Địa chỉ máy chủ", serverField, cmdOk);
        }
        serverField.setString(Settings.server);
        showNative(serverBox);
    }

    private Form inputForm(String title, TextField field, Command ok) {
        Form form = new Form(title);
        form.append(field);
        field.setDefaultCommand(ok);
        field.setItemCommandListener(this);
        form.addCommand(ok);
        form.addCommand(cmdCancel);
        form.setCommandListener(this);
        form.setItemStateListener(this);
        return form;
    }

    private void saveServer(String value) {
        String server = Settings.normalize(value);
        if (server.equals(Settings.server)) {
            display.setCurrent(current());
            return;
        }
        // Ma thiet bi do may chu cu phat, may chu moi khong biet no.
        Settings.server = server;
        Settings.device = "";
        Settings.save();
        home.clear();
        hello();
    }

    // ---------- Page.Host ----------

    private Item[] menu() {
        Audio audio = Audio.current();
        Item[] base = baseMenu();
        if (audio == null) {
            return base;
        }
        Item[] items = new Item[base.length + 2];
        items[0] = Item.of(Item.OPTION, "Đang nghe: " + audio.title).icon(Ui.ICON_NOTE).act("listening", null);
        items[1] = Item.of(Item.OPTION, "Ẩn app, vẫn nghe").icon(Ui.ICON_BACK).act("a-hide", null);
        System.arraycopy(base, 0, items, 2, base.length);
        return items;
    }

    private Item[] baseMenu() {
        return new Item[] {
            Item.of(Item.OPTION, "Trang chính").icon(Ui.ICON_HOME).act("home", null),
            Item.of(Item.OPTION, "Tìm kiếm").icon(Ui.ICON_SEARCH).act("search", null),
            Item.of(Item.OPTION, "Cài đặt").icon(Ui.ICON_GEAR).act("settings", null),
            Item.of(Item.OPTION, "Thoát").icon(Ui.ICON_EXIT).act("exit", null),
        };
    }

    public void leftSoft(Page page) {
        page.openMenu(menu());
    }

    public void rightSoft(Page page) {
        if (page.isBusy()) {
            // Huy viec dang cho: ket qua ve sau se bi bo qua.
            ticket++;
            page.setBusy(null);
            if (page != home) {
                back();
            }
            return;
        }
        back();
    }

    public void searchTap(Page page) {
        askSearch(null);
    }

    public void typed(Page page, char ch) {
        if (!page.isBusy()) {
            askSearch(String.valueOf(ch));
        }
    }

    public void select(Page page, Item item) {
        String a = item.action;
        String v = item.value;
        if ("video".equals(a)) {
            openVideo(v);
        } else if ("more".equals(a)) {
            loadResults(page, page.title, v);
        } else if ("listen".equals(a)) {
            // Bai nay truoc, roi toi cac video lien quan tren trang.
            int tab = v.indexOf('\t');
            Vector items = new Vector();
            items.addElement(new String[] {v.substring(0, tab), v.substring(tab + 1)});
            for (int i = 0; i < page.playlist.size(); i++) {
                items.addElement(page.playlist.elementAt(i));
            }
            listen(items, 0);
        } else if ("listall".equals(a)) {
            listen(page.playlist, 0);
        } else if ("listening".equals(a)) {
            showListening();
        } else if (a.startsWith("a-")) {
            audioAction(page, a);
        } else if ("play".equals(a)) {
            int x = v.indexOf('\t');
            int y = v.indexOf('\t', x + 1);
            play("app".equals(v.substring(0, x)), v.substring(x + 1, y), v.substring(y + 1));
        } else if ("convert".equals(a)) {
            int x = v.indexOf('\t');
            int y = v.indexOf('\t', x + 1);
            startConvert(v.substring(0, x), v.substring(x + 1, y), v.substring(y + 1));
        } else if ("about".equals(a)) {
            showAbout(page.title, v);
        } else if ("search".equals(a)) {
            askSearch(null);
        } else if ("search-go".equals(a)) {
            Item input = searchInput(page);
            String query = input != null ? input.title.trim() : "";
            // Bam vao chinh o tim (hoac o con trong): mo o nhap cua may de go.
            boolean onInput = item.type == Item.INPUT;
            if (query.length() > 0 && !(onInput && !Page.qwerty)) {
                search(query);
            } else {
                askNativeSearch(input != null ? input.title : "");
            }
        } else if ("search-q".equals(a)) {
            search(v);
        } else if ("search-clear".equals(a)) {
            Settings.clearHistory();
            buildSearchPage(page, searchInput(page) != null ? searchInput(page).title : "");
        } else if ("search-native".equals(a)) {
            Item input = searchInput(page);
            askNativeSearch(input != null ? input.title : lastQuery);
        } else if ("home".equals(a)) {
            goHome();
        } else if ("reload".equals(a)) {
            goHome();
            loadHome();
        } else if ("hello".equals(a)) {
            hello();
        } else if ("login".equals(a)) {
            login(null, false);
        } else if ("login-check".equals(a)) {
            login(page, false);
        } else if ("login-new".equals(a)) {
            login(page, true);
        } else if ("settings".equals(a)) {
            if (!"settings".equals(page.kind)) {
                showSettings(null);
            }
        } else if ("server".equals(a)) {
            askServer();
        } else if ("textsize".equals(a)) {
            Settings.textSize = (Settings.textSize + 1) % 3;
            Settings.save();
            Ui.forceSetup();
            showSettings(page);
        } else if ("thumbs".equals(a)) {
            Settings.thumbs = !Settings.thumbs;
            Settings.save();
            Ui.forceSetup();
            showSettings(page);
        } else if ("exit".equals(a)) {
            exit();
        }
    }

    private void audioAction(Page page, String a) {
        Audio audio = Audio.current();
        if ("a-hide".equals(a)) {
            // MIDP: setCurrent(null) xin may dua app ra nen; nhac van chay.
            display.setCurrent(null);
            return;
        }
        if (audio == null) {
            page.showToast("Không có bài nào đang nghe.", Item.TONE_WARN);
            return;
        }
        if ("a-toggle".equals(a)) {
            audio.toggle();
        } else if ("a-next".equals(a)) {
            Audio.next();
        } else if ("a-prev".equals(a)) {
            Audio.previous();
        } else if ("a-jump".equals(a)) {
            Audio.jump(parseInt(page.focused() != null ? page.focused().value : "-1"));
        } else if ("a-rew".equals(a)) {
            audio.rewind();
        } else if ("a-fwd".equals(a)) {
            audio.forward();
        } else if ("a-stop".equals(a)) {
            Audio.stopAll();
            if ("listen".equals(page.kind)) {
                listenPage = null;
                back();
            }
        }
    }

    // ---------- o nhap chu (TextBox cua may) ----------

    public void commandAction(Command c, Displayable d) {
        if (d == searchBox) {
            String query = searchField.getString().trim();
            // Quay lai cung giu chu da go cho lan mo sau.
            lastQuery = query;
            if (c != cmdCancel && query.length() > 0) {
                search(query);
            } else {
                Page page = current();
                Item input = searchInput(page);
                if (input != null) {
                    input.title = searchField.getString();
                    page.changed();
                }
                display.setCurrent(page);
            }
        } else if (d == serverBox) {
            if (c != cmdCancel) {
                saveServer(serverField.getString());
            } else {
                display.setCurrent(current());
            }
        }
    }

    /** Bam trackpad/OK tren o chu: nut mac dinh cua no. */
    public void commandAction(Command c, javax.microedition.lcdui.Item item) {
        commandAction(c, item == searchField ? (Displayable) searchBox : serverBox);
    }

    /** Enter chen dau xuong dong: bo di roi chay nhu bam Tim/OK. */
    public void itemStateChanged(javax.microedition.lcdui.Item item) {
        if (!(item instanceof TextField)) {
            return;
        }
        TextField field = (TextField) item;
        String text = field.getString();
        if (text.indexOf('\n') < 0 && text.indexOf('\r') < 0) {
            return;
        }
        StringBuffer clean = new StringBuffer(text.length());
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (ch != '\n' && ch != '\r') {
                clean.append(ch);
            }
        }
        field.setString(clean.toString());
        if (field == searchField) {
            commandAction(cmdSearch, searchBox);
        } else if (field == serverField) {
            commandAction(cmdOk, serverBox);
        }
    }

    private Page lastPage;
}
