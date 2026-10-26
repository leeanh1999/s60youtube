package s60tube;

import java.util.Vector;

import javax.microedition.media.Manager;
import javax.microedition.media.Player;
import javax.microedition.media.PlayerListener;

/**
 * Nghe nhac nen theo danh sach: moi bai la mot trinh phat chi tieng (.m4a)
 * khong gan voi man hinh nao. Quay ra trang khac, an app hay tat man hinh thi
 * van chay, vi app khong dong no khi man hinh doi (pauseApp de trong).
 *
 * Het bai thi tu sang bai sau trong danh sach; bai loi (vd. video khong co
 * luong AAC) thi bo qua, loi lien tiep nhieu bai thi dung han.
 *
 * Trang "Dang nghe" (S60Tube.showListening) gan cac khoi cua no vao day de
 * moi giay cap nhat thoi gian va trang thai; doi bai thi goi onTrack de dung
 * lai trang.
 */
final class Audio implements Runnable, PlayerListener {

    private static final long STEP_US = 10000000L;
    private static final int MAX_FAILS = 3;

    // ---------- danh sach dang nghe (chung cho moi bai) ----------

    /** Moi phan tu: String[] {ma video, tieu de}. */
    private static final Vector queue = new Vector();
    private static int index = -1;
    private static int fails;
    /** Duoi "?k=..." lay tu duong nghe may chu da dua, de dung cho bai khac. */
    private static String key = "";
    private static String server = "";
    private static Audio current;
    /** S60Tube dat vao: chay khi doi bai (de dung lai trang Dang nghe). */
    static Runnable onTrack;

    // Cac khoi cua trang Dang nghe, null khi chua mo trang do.
    private static Page page;
    private static Item info;
    private static Item bar;
    private static Item time;
    private static Item toggle;

    // ---------- mot bai ----------

    final String title;
    private final String url;
    private Player player;
    private volatile boolean closed;
    private String status = "Đang mở…";
    /** Da nho may chu chuan bi bai sau chua (moi bai mot lan). */
    private boolean prepared;
    private long playedMs;

    /** Dang nghe ban .m4a may chu chep lai (luong goc khong mo duoc). */
    private final boolean converted;

    private Audio(String url, String title, boolean converted) {
        this.url = url;
        this.title = title;
        this.converted = converted;
    }

    /** Bai dang nghe (co the dang dung tam), hoac null. */
    static Audio current() {
        return current;
    }

    /** Nho duoi ?k= tu mot duong /audio may chu tra ve. */
    static void learnKey(String path) {
        int q = path.indexOf('?');
        if (q >= 0) {
            key = path.substring(q);
        }
    }

    /**
     * Nghe ca danh sach tu bai thu 'from'. items la String[] {ma, tieu de};
     * chep ra ban rieng de trang goc co them bot gi cung khong anh huong.
     */
    static void playList(String base, Vector items, int from) {
        stopAll();
        server = base;
        queue.removeAllElements();
        for (int i = 0; i < items.size(); i++) {
            queue.addElement(items.elementAt(i));
        }
        fails = 0;
        playIndex(from);
    }

    static int size() {
        return queue.size();
    }

    static int position() {
        return index;
    }

    static String[] track(int i) {
        return i >= 0 && i < queue.size() ? (String[]) queue.elementAt(i) : null;
    }

    static void next() {
        if (index + 1 < queue.size()) {
            playIndex(index + 1);
        }
    }

    static void previous() {
        if (index > 0) {
            playIndex(index - 1);
        }
    }

    static void jump(int i) {
        if (i >= 0 && i < queue.size()) {
            playIndex(i);
        }
    }

    private static void playIndex(int i) {
        playIndex(i, false);
    }

    /**
     * Nghe luong tieng cua YouTube qua /stream/<ma>/a: may chu sap lai luong
     * MP4 chia doan (DASH) thanh mot file .m4a thuong ngay luc phat (lib/fmp4.js),
     * khong ffmpeg, khong tai truoc. converted=true (/audio, ffmpeg chep ra file)
     * chi con de danh, app khong tu dung toi.
     */
    private static void playIndex(int i, boolean converted) {
        Audio old = current;
        current = null;
        if (old != null) {
            old.close();
        }
        String[] t = track(i);
        if (t == null) {
            return;
        }
        index = i;
        String path = converted ? "/audio/" + t[0] + ".m4a" : "/stream/" + t[0] + "/a";
        Audio audio = new Audio(server + path + key, t[1], converted);
        current = audio;
        new Thread(audio).start();
        new Thread(new Runnable() {
            public void run() {
                audioTick();
            }
        }).start();
        if (onTrack != null) {
            onTrack.run();
        }
    }

    /** Dung han va bo danh sach (truoc khi xem video, thoat app). */
    static void stopAll() {
        Audio audio = current;
        current = null;
        if (audio != null) {
            audio.close();
        }
    }

    static void attach(Page p, Item i, Item b, Item t, Item g) {
        page = p;
        info = i;
        bar = b;
        time = t;
        toggle = g;
        if (current != null) {
            current.refresh();
        }
    }

    // ---------- trinh phat ----------

    public void run() {
        try {
            Player p = Manager.createPlayer(Device.url(url));
            player = p;
            if (gone()) {
                return;
            }
            p.addPlayerListener(this);
            p.realize();
            if (gone()) {
                return;
            }
            setStatus("Đang đệm…");
            p.prefetch();
            if (gone()) {
                return;
            }
            p.start();
        } catch (Throwable e) {
            failed("Lỗi: " + e.toString());
        }
    }

    private boolean gone() {
        if (!closed) {
            return false;
        }
        try {
            player.close();
        } catch (Exception ignored) {
        }
        return true;
    }

    /** Bai nay khong nghe duoc: sang bai sau, tru khi da hong nhieu bai lien. */
    private void failed(String text) {
        if (closed) {
            return;
        }
        setStatus(text);
        if (current != this) {
            return;
        }
        fails++;
        if (fails < MAX_FAILS && index + 1 < queue.size()) {
            next();
        } else {
            close();
            current = null;
            refresh();
        }
    }

    private static void audioTick() {
        Audio audio = current;
        while (audio != null && !audio.closed) {
            try {
                Thread.sleep(1000);
            } catch (InterruptedException e) {
                return;
            }
            if (current != audio) {
                return;
            }
            audio.maybePrepareNext();
            if (page != null && page.isShown()) {
                audio.refresh();
            }
        }
    }

    /**
     * Gan het bai (con duoi 60 giay hoac qua nua bai; khong biet do dai thi sau
     * 30 giay nghe) thi nho may chu chuan bi bai sau: yt-dlp mat vai
     * giay tren NAS, lam truoc thi het bai la sang bai moi ngay.
     */
    private void maybePrepareNext() {
        if (prepared || !playing()) {
            return;
        }
        playedMs += 1000;
        final String[] next = track(index + 1);
        if (next == null) {
            prepared = true;
            return;
        }
        long now = -1;
        long total = -1;
        try {
            now = player.getMediaTime();
            total = player.getDuration();
        } catch (Exception ignored) {
        }
        boolean near = total > 0 && now >= 0
                ? total - now <= 60000000L || now * 2 >= total
                : playedMs >= 30000;
        if (!near) {
            return;
        }
        prepared = true;
        background(new Runnable() {
            public void run() {
                try {
                    Api.fetch("/api/prepare?v=" + Api.encode(next[0]));
                } catch (Exception ignored) {
                    // khong chuan bi duoc thi luc sang bai cho lau hon thoi
                }
            }
        });
    }

    boolean playing() {
        Player p = player;
        return p != null && !closed && p.getState() == Player.STARTED;
    }

    String status() {
        return status;
    }

    void toggle() {
        final Player p = player;
        if (p == null || closed) {
            return;
        }
        final boolean pause = p.getState() == Player.STARTED;
        background(new Runnable() {
            public void run() {
                try {
                    if (pause) {
                        p.stop();
                    } else {
                        p.start();
                    }
                } catch (Exception ignored) {
                }
                setStatus(pause ? "Tạm dừng" : "Đang phát");
            }
        });
    }

    /** Tua co the mat ca giay tren luong HTTP — chay rieng cho khoi dung phim. */
    void seek(final long delta) {
        final Player p = player;
        if (p == null || closed) {
            return;
        }
        background(new Runnable() {
            public void run() {
                try {
                    long now = p.getMediaTime();
                    if (now >= 0) {
                        p.setMediaTime(Math.max(0, now + delta));
                    }
                } catch (Exception e) {
                    setStatus("Không tua được");
                }
                refresh();
            }
        });
    }

    void rewind() {
        seek(-STEP_US);
    }

    void forward() {
        seek(STEP_US);
    }

    public void playerUpdate(Player p, String event, Object data) {
        if (closed) {
            return;
        }
        if (END_OF_MEDIA.equals(event)) {
            fails = 0;
            if (current == this && index + 1 < queue.size()) {
                next();
            } else {
                setStatus("Đã nghe hết");
            }
        } else if (ERROR.equals(event)) {
            failed("Lỗi: " + data);
        } else if ("bufferingStarted".equals(event)) {
            setStatus("Đang đệm…");
        } else if (STARTED.equals(event) || "bufferingStopped".equals(event)) {
            fails = 0;
            setStatus("Đang phát");
        } else if (STOPPED.equals(event)) {
            setStatus("Tạm dừng");
        }
    }

    private void setStatus(String text) {
        status = text;
        refresh();
    }

    /** Ghi lai thoi gian, thanh tien do, chu cua nut phat-dung tren trang Dang nghe. */
    private void refresh() {
        Page pg = page;
        if (pg == null || info == null || current != this) {
            return;
        }
        long now = -1;
        long total = -1;
        Player p = player;
        if (p != null && !closed) {
            try {
                now = p.getMediaTime();
                total = p.getDuration();
            } catch (Exception ignored) {
            }
        }
        info.sub(status);
        if (total > 0 && now >= 0) {
            bar.progress = (int) (now * 100 / total);
        }
        time.title = clock(now) + " / " + clock(total);
        boolean on = playing();
        toggle.title = on ? "Tạm dừng" : "Phát tiếp";
        toggle.icon = on ? Ui.ICON_PAUSE : Ui.ICON_PLAY;
        pg.changed();
    }

    static String clock(long us) {
        if (us < 0) {
            return "--:--";
        }
        long sec = us / 1000000L;
        long min = sec / 60;
        sec %= 60;
        if (min >= 60) {
            long m = min % 60;
            return (min / 60) + ":" + (m < 10 ? "0" : "") + m + ":" + (sec < 10 ? "0" : "") + sec;
        }
        return min + ":" + (sec < 10 ? "0" : "") + sec;
    }

    private void close() {
        closed = true;
        status = "Đã dừng";
        final Player p = player;
        if (p != null) {
            background(new Runnable() {
                public void run() {
                    try {
                        p.close();
                    } catch (Exception ignored) {
                    }
                }
            });
        }
    }

    private static void background(Runnable job) {
        new Thread(job).start();
    }
}
