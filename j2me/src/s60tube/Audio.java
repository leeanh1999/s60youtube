package s60tube;

import javax.microedition.media.Manager;
import javax.microedition.media.Player;
import javax.microedition.media.PlayerListener;
import javax.microedition.media.control.VolumeControl;

/**
 * Nghe nhac nen: mot trinh phat chi tieng (.m4a) khong gan voi man hinh nao.
 * Quay ra trang khac, an app hay tat man hinh thi van chay, vi app khong dong
 * no khi man hinh doi (pauseApp de trong) — chi dong khi bam Dung, mo bai khac,
 * xem video hay thoat app.
 *
 * Trang "Dang nghe" (S60Tube.showListening) gan cac khoi cua no vao day de
 * moi giay cap nhat thoi gian va trang thai.
 */
final class Audio implements Runnable, PlayerListener {

    private static final long STEP_US = 10000000L;

    private static Audio current;

    final String title;
    private final String url;
    private Player player;
    private volatile boolean closed;
    private String status = "Đang mở…";

    // Cac khoi cua trang Dang nghe, null khi chua mo trang do.
    private Page page;
    private Item info;
    private Item bar;
    private Item time;
    private Item toggle;

    private Audio(String url, String title) {
        this.url = url;
        this.title = title;
    }

    /** Bai dang nghe (co the dang dung tam), hoac null. */
    static Audio current() {
        return current;
    }

    static Audio start(String url, String title) {
        stopAll();
        Audio audio = new Audio(url, title);
        current = audio;
        new Thread(audio).start();
        new Thread(new Runnable() {
            public void run() {
                audioTick();
            }
        }).start();
        return audio;
    }

    /** Dung han bai dang nghe (truoc khi xem video, thoat app). */
    static void stopAll() {
        Audio audio = current;
        current = null;
        if (audio != null) {
            audio.close();
        }
    }

    void attach(Page page, Item info, Item bar, Item time, Item toggle) {
        this.page = page;
        this.info = info;
        this.bar = bar;
        this.time = time;
        this.toggle = toggle;
        refresh();
    }

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
            if (!closed) {
                setStatus("Lỗi: " + e.toString());
                closed = true;
                if (current == this) {
                    current = null;
                }
            }
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

    private static void audioTick() {
        Audio audio = current;
        while (audio != null && !audio.closed) {
            try {
                Thread.sleep(1000);
            } catch (InterruptedException e) {
                return;
            }
            if (audio.page != null && audio.page.isShown()) {
                audio.refresh();
            }
        }
    }

    boolean playing() {
        Player p = player;
        return p != null && !closed && p.getState() == Player.STARTED;
    }

    boolean ended() {
        return closed;
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

    /** Doi am luong, tra ve muc moi (0-100) hoac -1 neu may khong cho. */
    int volume(int delta) {
        Player p = player;
        if (p == null || closed) {
            return -1;
        }
        VolumeControl control = (VolumeControl) p.getControl("VolumeControl");
        if (control == null) {
            return -1;
        }
        int level = control.setLevel(Math.max(0, Math.min(100, control.getLevel() + delta)));
        setStatus("Âm lượng " + level);
        return level;
    }

    public void playerUpdate(Player p, String event, Object data) {
        if (END_OF_MEDIA.equals(event)) {
            setStatus("Đã nghe hết");
        } else if (ERROR.equals(event)) {
            setStatus("Lỗi: " + data);
        } else if ("bufferingStarted".equals(event)) {
            setStatus("Đang đệm…");
        } else if (STARTED.equals(event) || "bufferingStopped".equals(event)) {
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
        if (pg == null) {
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
        refresh();
    }

    private static void background(Runnable job) {
        new Thread(job).start();
    }
}
