package s60tube;

import java.io.IOException;
import java.util.Vector;

import javax.microedition.lcdui.Alert;
import javax.microedition.lcdui.AlertType;
import javax.microedition.lcdui.Choice;
import javax.microedition.lcdui.ChoiceGroup;
import javax.microedition.lcdui.Command;
import javax.microedition.lcdui.CommandListener;
import javax.microedition.lcdui.Display;
import javax.microedition.lcdui.Displayable;
import javax.microedition.lcdui.Font;
import javax.microedition.lcdui.Form;
import javax.microedition.lcdui.Gauge;
import javax.microedition.lcdui.Item;
import javax.microedition.lcdui.List;
import javax.microedition.lcdui.StringItem;
import javax.microedition.lcdui.TextBox;
import javax.microedition.lcdui.TextField;
import javax.microedition.midlet.MIDlet;
import javax.microedition.midlet.MIDletStateChangeException;

/**
 * App YouTube cho Nokia E6. Moi viec nang (tim kiem, lay luong, chuyen ma) van
 * do may chu lam; app chi thay trang HTML bang man hinh LCDUI va phim mem.
 */
public class S60Tube extends MIDlet implements CommandListener {

    private static final String APP = "S60Tube";

    // Loai muc trong danh sach: video, trang sau, phat, chuyen ma, thong tin.
    static final String VIDEO = "v";
    static final String NEXT = "n";
    static final String PLAY = "c";
    static final String CONVERT = "p";
    static final String INFO = "i";

    private final Command cmdExit = new Command("Thoát", Command.EXIT, 9);
    private final Command cmdBack = new Command("Quay lại", Command.BACK, 1);
    private final Command cmdOk = new Command("OK", Command.OK, 1);
    private final Command cmdSearch = new Command("Tìm kiếm", Command.SCREEN, 2);
    private final Command cmdHome = new Command("Trang chính", Command.SCREEN, 3);
    private final Command cmdRefresh = new Command("Tải lại", Command.SCREEN, 4);
    private final Command cmdLogin = new Command("Đăng nhập", Command.SCREEN, 5);
    private final Command cmdSettings = new Command("Cài đặt", Command.SCREEN, 6);
    private final Command cmdNewCode = new Command("Mã mới", Command.SCREEN, 2);
    private final Command cmdCheck = new Command("Kiểm tra", Command.SCREEN, 3);
    private final Command cmdPlay = new Command("Phát", Command.OK, 1);

    private Display display;
    private ThumbLoader thumbs;
    private final Vector history = new Vector();

    /** Tang moi lan mo man hinh moi; ket qua mang ve tre (da bam Quay lai) thi bo. */
    private int ticket;

    private List home;
    private TextBox searchBox;
    private String lastQuery = "";

    private Form settingsForm;
    private TextField serverField;
    private ChoiceGroup thumbsChoice;
    private ChoiceGroup playChoice;

    private Form convertForm;
    private Gauge convertGauge;
    private StringItem convertText;
    private String convertPath;
    private String convertTitle;

    private String loginCode = "";

    protected void startApp() throws MIDletStateChangeException {
        if (display != null) {
            return;
        }
        display = Display.getDisplay(this);
        Settings.load();
        thumbs = new ThumbLoader();
        thumbs.start();
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

    private void show(Displayable screen) {
        Displayable current = display.getCurrent();
        if (current != null && current != screen && !(current instanceof Alert)
                && !isLoading(current)) {
            history.addElement(current);
        }
        display.setCurrent(screen);
    }

    private void back() {
        ticket++;
        if (history.isEmpty()) {
            showHome();
            return;
        }
        Displayable previous = (Displayable) history.lastElement();
        history.removeElementAt(history.size() - 1);
        display.setCurrent(previous);
    }

    private void showHome() {
        history.removeAllElements();
        if (home == null) {
            loadHome();
        } else {
            display.setCurrent(home);
        }
    }

    private Form loading;

    private boolean isLoading(Displayable d) {
        return d == loading;
    }

    /** Hien man hinh cho roi chay viec mang tren luong rieng. */
    private void work(String text, final Job job) {
        if (loading == null) {
            loading = new Form(APP);
            loading.append(new Gauge(null, false, Gauge.INDEFINITE, Gauge.CONTINUOUS_RUNNING));
            loading.append(new StringItem(null, ""));
            loading.addCommand(cmdBack);
            loading.setCommandListener(this);
        }
        ((StringItem) loading.get(1)).setText(text);
        Displayable current = display.getCurrent();
        if (current != null && current != loading && !(current instanceof Alert)) {
            history.addElement(current);
        }
        display.setCurrent(loading);
        final int mine = ++ticket;
        new Thread() {
            public void run() {
                try {
                    Vector rows = Api.get(job.path);
                    if (mine == ticket) {
                        job.done(rows);
                    }
                } catch (Throwable e) {
                    if (mine == ticket) {
                        fail("Không kết nối được máy chủ " + Settings.server + "\n" + e);
                    }
                }
            }
        }.start();
    }

    /** Viec mang: duong dan + viec lam khi co ket qua. */
    abstract static class Job {
        final String path;

        Job(String path) {
            this.path = path;
        }

        abstract void done(Vector rows);
    }

    /** Bao loi roi quay ve man hinh truoc man hinh cho. */
    private void fail(String message) {
        Displayable target;
        if (display.getCurrent() == loading) {
            target = history.isEmpty() ? null : (Displayable) history.lastElement();
            if (target != null) {
                history.removeElementAt(history.size() - 1);
            }
        } else {
            target = display.getCurrent();
        }
        if (target == null) {
            target = home != null ? (Displayable) home : settingsScreen();
        }
        alert(message, target);
    }

    private void alert(String message, Displayable next) {
        Alert a = new Alert(APP, message, null, AlertType.ERROR);
        a.setTimeout(Alert.FOREVER);
        display.setCurrent(a, next);
    }

    private void info(String message, Displayable next) {
        Alert a = new Alert(APP, message, null, AlertType.INFO);
        a.setTimeout(3000);
        display.setCurrent(a, next);
    }

    /** Dong 'E' dau tien (neu co) — loi do may chu viet san bang tieng Viet. */
    private static String errorOf(Vector rows) {
        String[] row = Api.first(rows, 'E');
        return row == null ? null : Api.field(row, 1);
    }

    // ---------- khoi dong: xin ma thiet bi ----------

    private void hello() {
        work("Đang nối máy chủ…", new Job("/api/hello") {
            void done(Vector rows) {
                String[] d = Api.first(rows, 'D');
                if (d == null) {
                    fail(errorOf(rows) != null ? errorOf(rows) : "Máy chủ trả lời lạ — kiểm tra địa chỉ trong Cài đặt.");
                    return;
                }
                if (!Api.field(d, 1).equals(Settings.device)) {
                    Settings.device = Api.field(d, 1);
                    Settings.save();
                }
                history.removeAllElements();
                loadHome();
            }
        });
    }

    // ---------- danh sach video ----------

    /** List kem bang muc: moi dong cua List ung voi mot String[]{loai, gia tri}. */
    final class VideoList extends List {
        final Vector entries = new Vector();

        VideoList(String title) {
            super(title, List.IMPLICIT);
            setFitPolicy(Choice.TEXT_WRAP_ON);
            setCommandListener(S60Tube.this);
        }

        void add(String text, String kind, String value) {
            append(text, null);
            entries.addElement(new String[] {kind, value});
        }

        /** Dong V: id, tieu de, kenh, thoi luong, luot xem. */
        void addVideo(String[] row) {
            String text = Api.field(row, 2);
            String meta = join(Api.field(row, 3), join(Api.field(row, 4), Api.field(row, 5)));
            if (meta.length() > 0) {
                text += "\n" + meta;
            }
            int index = size();
            add(text, VIDEO, Api.field(row, 1));
            if (Settings.thumbs) {
                thumbs.request(this, index, Api.field(row, 1));
            }
        }

        String[] entry(int index) {
            return index >= 0 && index < entries.size() ? (String[]) entries.elementAt(index) : null;
        }
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

    private void addVideos(VideoList list, Vector rows) {
        for (int i = 0; i < rows.size(); i++) {
            String[] row = (String[]) rows.elementAt(i);
            if ("V".equals(row[0])) {
                list.addVideo(row);
            }
        }
    }

    private void addCommonCommands(Displayable screen) {
        screen.addCommand(cmdSearch);
        screen.addCommand(cmdLogin);
        screen.addCommand(cmdSettings);
    }

    private void loadHome() {
        work("Đang tải trang chính…", new Job("/api/home") {
            void done(Vector rows) {
                VideoList list = new VideoList(APP);
                list.addCommand(cmdExit);
                list.addCommand(cmdRefresh);
                addCommonCommands(list);
                addVideos(list, rows);
                if (list.size() == 0) {
                    list.add("Tìm kiếm video…", INFO, "search");
                }
                home = list;
                history.removeAllElements();
                String[] warning = Api.first(rows, 'W');
                if (warning != null) {
                    info(Api.field(warning, 1), home);
                } else {
                    display.setCurrent(home);
                }
            }
        });
    }

    private void askSearch() {
        if (searchBox == null) {
            searchBox = new TextBox("Tìm trên YouTube", lastQuery, 200, TextField.ANY);
            searchBox.addCommand(cmdOk);
            searchBox.addCommand(cmdBack);
            searchBox.setCommandListener(this);
        }
        show(searchBox);
    }

    private void search(final String query, final String page) {
        lastQuery = query;
        String path = "/api/search?q=" + Api.encode(query);
        if (page != null) {
            path += "&p=" + Api.encode(page);
        }
        work("Đang tìm “" + query + "”…", new Job(path) {
            void done(Vector rows) {
                String[] go = Api.first(rows, 'G');
                if (go != null) {
                    openVideo(Api.field(go, 1));
                    return;
                }
                String error = errorOf(rows);
                if (error != null) {
                    fail(error);
                    return;
                }
                VideoList list = new VideoList(query);
                list.addCommand(cmdBack);
                list.addCommand(cmdHome);
                addCommonCommands(list);
                addVideos(list, rows);
                String[] next = Api.first(rows, 'N');
                if (next != null) {
                    list.add("Trang sau »", NEXT, Api.field(next, 1));
                }
                if (list.size() == 0) {
                    list.add("Không thấy video nào.", INFO, "");
                }
                display.setCurrent(list);
            }
        });
    }

    // ---------- trang video ----------

    private void openVideo(final String id) {
        work("Đang lấy video… (vài giây)", new Job("/api/watch?v=" + id) {
            void done(Vector rows) {
                String[] meta = Api.first(rows, 'M');
                final String title = meta != null ? Api.field(meta, 1) : "Video";
                VideoList list = new VideoList(title);
                list.addCommand(cmdBack);
                list.addCommand(cmdHome);
                addCommonCommands(list);

                StringBuffer about = new StringBuffer(title);
                if (meta != null) {
                    about.append('\n').append(join(Api.field(meta, 2), Api.field(meta, 3)));
                    if (Api.field(meta, 4).length() > 0) {
                        about.append("\n\n").append(Api.field(meta, 4));
                    }
                }

                for (int i = 0; i < rows.size(); i++) {
                    String[] row = (String[]) rows.elementAt(i);
                    if ("C".equals(row[0])) {
                        list.add("▶ Xem " + Api.field(row, 1) + "p", PLAY, Api.field(row, 2) + "\t" + title);
                    } else if ("A".equals(row[0])) {
                        list.add("♪ Nghe chỉ tiếng (.m4a)", PLAY, Api.field(row, 1) + "\t" + title);
                    } else if ("P".equals(row[0])) {
                        list.add("⚙ " + Api.field(row, 2), CONVERT, id + "\t" + Api.field(row, 1) + "\t" + title);
                    } else if ("E".equals(row[0])) {
                        list.add("⚠ " + Api.field(row, 1), INFO, Api.field(row, 1));
                    }
                }
                list.add("ℹ Thông tin video", INFO, about.toString());
                addVideos(list, rows);
                display.setCurrent(list);
            }
        });
    }

    private void showText(String title, String text) {
        Form form = new Form(title);
        form.append(new StringItem(null, text));
        form.addCommand(cmdBack);
        form.setCommandListener(this);
        show(form);
    }

    // ---------- phat ----------

    private void play(String path, String title) {
        String url = Settings.server + path;
        if (Settings.inApp) {
            Displayable here = display.getCurrent();
            display.setCurrent(new PlayerCanvas(this, url, title, here));
            return;
        }
        try {
            if (platformRequest(url)) {
                info("Đóng app để máy mở trình phát.", display.getCurrent());
            }
        } catch (Exception e) {
            alert("Máy không mở được địa chỉ này:\n" + url + "\n" + e, display.getCurrent());
        }
    }

    void playerClosed(Displayable back, String error) {
        if (error != null) {
            alert("Không phát được trong app: " + error
                    + "\n\nĐổi Cài đặt → Cách phát sang “Trình phát của máy”.", back);
        } else {
            display.setCurrent(back);
        }
    }

    Display display() {
        return display;
    }

    // ---------- chuyen ma ----------

    private void startConvert(final String id, final String profile, String title) {
        convertTitle = title;
        convertPath = null;
        convertForm = new Form("Chuẩn bị video");
        convertGauge = new Gauge("Tiến độ", false, 100, 0);
        convertText = new StringItem(null, "Đang gửi yêu cầu…");
        convertForm.append(new StringItem(null, title));
        convertForm.append(convertGauge);
        convertForm.append(convertText);
        convertForm.addCommand(cmdBack);
        convertForm.setCommandListener(this);
        show(convertForm);

        final Form form = convertForm;
        new Thread() {
            public void run() {
                while (display.getCurrent() == form || display.getCurrent() instanceof Alert) {
                    try {
                        Vector rows = Api.get("/api/convert?v=" + id + "&p=" + profile);
                        String error = errorOf(rows);
                        String[] job = Api.first(rows, 'J');
                        if (error != null || job == null) {
                            convertText.setText(error != null ? error : "Máy chủ trả lời lạ.");
                            return;
                        }
                        String status = Api.field(job, 1);
                        int progress = parseInt(Api.field(job, 2));
                        convertGauge.setValue(Math.min(100, Math.max(0, progress)));
                        if ("done".equals(status)) {
                            convertPath = Api.field(job, 4);
                            convertText.setText("Xong. Bấm Phát.");
                            form.addCommand(cmdPlay);
                            if (display.getCurrent() == form) {
                                play(convertPath, convertTitle);
                            }
                            return;
                        }
                        if ("queued".equals(status)) {
                            convertText.setText("Đang xếp hàng, thứ " + Api.field(job, 3) + "…");
                        } else {
                            convertText.setText("Đang chuyển mã " + progress + "%…");
                        }
                        Thread.sleep(3000);
                    } catch (IOException e) {
                        convertText.setText("Mất kết nối: " + e + " — Quay lại rồi thử lần nữa.");
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

    private void login(boolean fresh) {
        String path = "/api/login?c=" + Api.encode(loginCode) + (fresh ? "&new=1" : "");
        work("Đang lấy mã đăng nhập…", new Job(path) {
            void done(Vector rows) {
                String error = errorOf(rows);
                if (error != null) {
                    fail(error);
                    return;
                }
                String[] code = Api.first(rows, 'K');
                String[] url = Api.first(rows, 'U');
                String[] state = Api.first(rows, 'S');
                loginCode = code != null ? Api.field(code, 1) : "";
                boolean ready = state != null && "1".equals(Api.field(state, 1));
                boolean own = state != null && "1".equals(Api.field(state, 2));

                Form form = new Form("Đăng nhập");
                StringItem status = new StringItem("Trạng thái", own
                        ? "Đã nối tài khoản YouTube riêng."
                        : ready ? "Đang dùng tài khoản chung của máy chủ." : "Chưa nối tài khoản.");
                form.append(status);
                StringItem codeItem = new StringItem("Mã ghép nối", loginCode);
                codeItem.setFont(Font.getFont(Font.FACE_MONOSPACE, Font.STYLE_BOLD, Font.SIZE_LARGE));
                codeItem.setLayout(Item.LAYOUT_NEWLINE_BEFORE | Item.LAYOUT_NEWLINE_AFTER);
                form.append(codeItem);
                form.append(new StringItem(null,
                        "Trên máy tính, mở địa chỉ dưới đây, nhập mã trên và dán nội dung"
                        + " file cookies.txt của YouTube. Mã còn hạn "
                        + (code != null ? Api.field(code, 2) : "?") + " phút."));
                form.append(new StringItem("Địa chỉ", url != null ? Api.field(url, 1) : ""));
                form.addCommand(cmdBack);
                form.addCommand(cmdCheck);
                form.addCommand(cmdNewCode);
                form.setCommandListener(S60Tube.this);
                display.setCurrent(form);
            }
        });
    }

    // ---------- cai dat ----------

    private Form settingsScreen() {
        if (settingsForm == null) {
            settingsForm = new Form("Cài đặt");
            serverField = new TextField("Địa chỉ máy chủ", Settings.server, 200, TextField.URL);
            thumbsChoice = new ChoiceGroup("Danh sách", ChoiceGroup.MULTIPLE);
            thumbsChoice.append("Hiện ảnh thu nhỏ", null);
            playChoice = new ChoiceGroup("Cách phát", ChoiceGroup.EXCLUSIVE);
            playChoice.append("Trình phát của máy", null);
            playChoice.append("Trong app (thử)", null);
            settingsForm.append(serverField);
            settingsForm.append(thumbsChoice);
            settingsForm.append(playChoice);
            settingsForm.addCommand(cmdOk);
            settingsForm.addCommand(cmdBack);
            settingsForm.setCommandListener(this);
        }
        serverField.setString(Settings.server);
        thumbsChoice.setSelectedIndex(0, Settings.thumbs);
        playChoice.setSelectedIndex(Settings.inApp ? 1 : 0, true);
        return settingsForm;
    }

    private void saveSettings() {
        String server = Settings.normalize(serverField.getString());
        Settings.thumbs = thumbsChoice.isSelected(0);
        Settings.inApp = playChoice.getSelectedIndex() == 1;
        boolean moved = !server.equals(Settings.server);
        if (moved) {
            // Ma thiet bi do may chu cu phat, may chu moi khong biet no.
            Settings.server = server;
            Settings.device = "";
            home = null;
        }
        Settings.save();
        if (moved || Settings.device.length() == 0) {
            history.removeAllElements();
            hello();
        } else {
            back();
        }
    }

    // ---------- phim ----------

    public void commandAction(Command c, Displayable d) {
        if (c == cmdExit) {
            destroyApp(true);
            notifyDestroyed();
        } else if (c == cmdBack) {
            back();
        } else if (c == cmdHome) {
            showHome();
        } else if (c == cmdRefresh) {
            home = null;
            loadHome();
        } else if (c == cmdSearch) {
            askSearch();
        } else if (c == cmdLogin) {
            login(false);
        } else if (c == cmdNewCode || c == cmdCheck) {
            // Bo trang dang nhap cu ra khoi duong quay lai roi ve trang moi.
            back();
            login(c == cmdNewCode);
        } else if (c == cmdSettings) {
            show(settingsScreen());
        } else if (c == cmdPlay && convertPath != null) {
            play(convertPath, convertTitle);
        } else if (c == cmdOk && d == searchBox) {
            String query = searchBox.getString().trim();
            if (query.length() > 0) {
                search(query, null);
            }
        } else if (c == cmdOk && d == settingsForm) {
            saveSettings();
        } else if (c == List.SELECT_COMMAND && d instanceof VideoList) {
            select((VideoList) d);
        }
    }

    private void select(VideoList list) {
        String[] entry = list.entry(list.getSelectedIndex());
        if (entry == null) {
            return;
        }
        String kind = entry[0];
        String value = entry[1];
        if (VIDEO.equals(kind)) {
            openVideo(value);
        } else if (NEXT.equals(kind)) {
            search(lastQuery, value);
        } else if (PLAY.equals(kind)) {
            int tab = value.indexOf('\t');
            play(value.substring(0, tab), value.substring(tab + 1));
        } else if (CONVERT.equals(kind)) {
            int a = value.indexOf('\t');
            int b = value.indexOf('\t', a + 1);
            startConvert(value.substring(0, a), value.substring(a + 1, b), value.substring(b + 1));
        } else if (INFO.equals(kind)) {
            if ("search".equals(value)) {
                askSearch();
            } else if (value.length() > 0) {
                showText(list.getTitle(), value);
            }
        }
    }
}
