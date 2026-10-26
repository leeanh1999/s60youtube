package s60tube;

import java.io.IOException;
import java.util.Vector;

import javax.microedition.lcdui.Command;
import javax.microedition.lcdui.CommandListener;
import javax.microedition.lcdui.Display;
import javax.microedition.lcdui.Displayable;
import javax.microedition.lcdui.TextBox;
import javax.microedition.lcdui.TextField;
import javax.microedition.midlet.MIDlet;
import javax.microedition.midlet.MIDletStateChangeException;

/**
 * App YouTube cho Nokia E6. Moi viec nang (tim kiem, lay luong, chuyen ma) van
 * do may chu lam; app ve giao dien giong ban web (xem Page, Item, Ui) va dung
 * phim mem cua may.
 */
public class S60Tube extends MIDlet implements Page.Host, CommandListener {

    private static final String APP = "S60Tube";

    private final Command cmdOk = new Command("OK", Command.OK, 1);
    private final Command cmdCancel = new Command("Huỷ", Command.BACK, 1);

    private Display display;
    private ThumbLoader thumbs;
    private final Vector history = new Vector();

    /** Tang moi khi bo mot viec dang cho; ket qua ve tre thi bo qua. */
    private int ticket;

    private Page home;
    private TextBox searchBox;
    private TextBox serverBox;
    private String lastQuery = "";
    private String loginCode = "";

    protected void startApp() throws MIDletStateChangeException {
        if (display != null) {
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
        home.rightLabel = "Thoát";
        display.setCurrent(home);
        hello();
    }

    protected void pauseApp() {
    }

    protected void destroyApp(boolean unconditional) {
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
        for (int i = 0; i < rows.size(); i++) {
            String[] row = (String[]) rows.elementAt(i);
            if ("V".equals(row[0])) {
                addVideo(page, row);
                count++;
            }
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
                home.add(Item.of(Item.OPTION, "Tìm kiếm video").icon(Ui.ICON_SEARCH).act("search", null));
                int start = home.items.size();
                home.add(Item.of(Item.HEAD, "Gợi ý cho bạn"));
                if (addVideos(home, rows) == 0) {
                    home.items.removeElementAt(start);
                }
            }
        });
    }

    private void askSearch() {
        if (searchBox == null) {
            searchBox = new TextBox("Tìm trên YouTube", lastQuery, 200, TextField.ANY);
            searchBox.addCommand(cmdOk);
            searchBox.addCommand(cmdCancel);
            searchBox.setCommandListener(this);
        }
        showNative(searchBox);
    }

    private void search(final String query) {
        lastQuery = query;
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
                        String label = "Xem " + Api.field(row, 1) + "p";
                        Item play = Item.of(first ? Item.BUTTON : Item.OPTION, label).icon(Ui.ICON_PLAY)
                                .act("play", Api.field(row, 2) + "\t" + title);
                        page.add(play);
                        first = false;
                    } else if ("A".equals(row[0])) {
                        page.add(Item.of(Item.OPTION, "Nghe chỉ tiếng (.m4a)").icon(Ui.ICON_NOTE)
                                .sub("Nhẹ, nghe nhạc khi tắt màn hình").act("play", Api.field(row, 1) + "\t" + title));
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

    private void play(String path, String title) {
        String url = Settings.server + path;
        Page from = current();
        if (Settings.inApp) {
            lastPage = from;
            display.setCurrent(new PlayerCanvas(this, url, title, from));
            return;
        }
        try {
            if (platformRequest(url)) {
                from.showToast("Đóng app để máy mở trình phát.", Item.TONE_WARN);
            }
        } catch (Exception e) {
            from.showToast("Máy không mở được địa chỉ này:\n" + url + "\n" + e, Item.TONE_ERR);
        }
    }

    void playerClosed(Displayable back, String error) {
        display.setCurrent(back);
        if (error != null && back instanceof Page) {
            ((Page) back).showToast("Không phát được trong app: " + error
                    + "\n\nVào Cài đặt → Cách phát, chọn “Trình phát của máy”.", Item.TONE_ERR);
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
                            status.title = "Xong — bấm Phát.";
                            String path = Api.field(job, 4);
                            page.add(Item.of(Item.BUTTON, "Phát").icon(Ui.ICON_PLAY).act("play", path + "\t" + title));
                            page.changed();
                            if (display.getCurrent() == page) {
                                play(path, title);
                            }
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
        page.add(Item.of(Item.HEAD, "Máy chủ"));
        page.add(Item.of(Item.OPTION, "Địa chỉ máy chủ").sub(Settings.server).icon(Ui.ICON_HOME).act("server", null));
        page.add(Item.of(Item.HEAD, "Hiển thị"));
        page.add(Item.of(Item.OPTION, "Cỡ chữ").sub(TEXT_SIZES[Math.max(0, Math.min(2, Settings.textSize))])
                .icon(Ui.ICON_GEAR).act("textsize", null));
        page.add(Item.of(Item.OPTION, "Ảnh thu nhỏ").sub(Settings.thumbs ? "Bật" : "Tắt — danh sách nhẹ hơn")
                .icon(Ui.ICON_GEAR).act("thumbs", null));
        page.add(Item.of(Item.HEAD, "Phát video"));
        page.add(Item.of(Item.OPTION, "Cách phát")
                .sub(Settings.inApp ? "Trong app (thử) — 5 dừng, 4/6 tua" : "Trình phát của máy")
                .icon(Ui.ICON_PLAY).act("playmode", null));
        page.add(Item.of(Item.TEXT, APP + " " + getAppProperty("MIDlet-Version") + " · " + Settings.server));
        if (reuse == null) {
            open(page);
        } else {
            page.changed();
        }
    }

    private void askServer() {
        if (serverBox == null) {
            serverBox = new TextBox("Địa chỉ máy chủ", Settings.server, 200, TextField.URL);
            serverBox.addCommand(cmdOk);
            serverBox.addCommand(cmdCancel);
            serverBox.setCommandListener(this);
        }
        serverBox.setString(Settings.server);
        showNative(serverBox);
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
        return new Item[] {
            Item.of(Item.OPTION, "Trang chính").icon(Ui.ICON_HOME).act("home", null),
            Item.of(Item.OPTION, "Tìm kiếm").icon(Ui.ICON_SEARCH).act("search", null),
            Item.of(Item.OPTION, "Tải lại trang chính").icon(Ui.ICON_RELOAD).act("reload", null),
            Item.of(Item.OPTION, "Đăng nhập").icon(Ui.ICON_USER).act("login", null),
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
        askSearch();
    }

    public void select(Page page, Item item) {
        String a = item.action;
        String v = item.value;
        if ("video".equals(a)) {
            openVideo(v);
        } else if ("more".equals(a)) {
            loadResults(page, page.title, v);
        } else if ("play".equals(a)) {
            int tab = v.indexOf('\t');
            play(v.substring(0, tab), v.substring(tab + 1));
        } else if ("convert".equals(a)) {
            int x = v.indexOf('\t');
            int y = v.indexOf('\t', x + 1);
            startConvert(v.substring(0, x), v.substring(x + 1, y), v.substring(y + 1));
        } else if ("about".equals(a)) {
            showAbout(page.title, v);
        } else if ("search".equals(a)) {
            askSearch();
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
        } else if ("playmode".equals(a)) {
            Settings.inApp = !Settings.inApp;
            Settings.save();
            showSettings(page);
        } else if ("exit".equals(a)) {
            exit();
        }
    }

    // ---------- o nhap chu (TextBox cua may) ----------

    public void commandAction(Command c, Displayable d) {
        if (d == searchBox) {
            String query = searchBox.getString().trim();
            if (c == cmdOk && query.length() > 0) {
                search(query);
            } else {
                display.setCurrent(current());
            }
        } else if (d == serverBox) {
            if (c == cmdOk) {
                saveServer(serverBox.getString());
            } else {
                display.setCurrent(current());
            }
        }
    }

    private Page lastPage;
}
