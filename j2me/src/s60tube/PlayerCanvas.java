package s60tube;

import javax.microedition.lcdui.Canvas;
import javax.microedition.lcdui.Command;
import javax.microedition.lcdui.CommandListener;
import javax.microedition.lcdui.Displayable;
import javax.microedition.lcdui.Font;
import javax.microedition.lcdui.Graphics;
import javax.microedition.media.Manager;
import javax.microedition.media.Player;
import javax.microedition.media.PlayerListener;
import javax.microedition.media.control.VideoControl;
import javax.microedition.media.control.VolumeControl;

/**
 * Phat ngay trong app bang MMAPI (JSR-135), co thanh dieu khien tu ve: tren la
 * nut Quay lai va ten video, duoi la thanh thoi gian va ba nut lui / phat-dung /
 * toi. Thanh tu an sau vai giay khi dang phat; bam phim hay cham bat ky dau la
 * hien lai.
 *
 * Luc hien thanh, khung phim thu nho vao khoang giua hai thanh chu khong de len
 * nhau: co may ve video tren lop rieng phu len Canvas, ve thanh de len phim la
 * khong thay.
 *
 * Phim: mem phai / C / Esc quay lai, mem trai / 5 / OK phat-dung, 4/6 lui/toi
 * 10 giay, len/xuong am luong.
 */
final class PlayerCanvas extends Canvas implements Runnable, PlayerListener, CommandListener {

    private static final long STEP_US = 10000000L;
    private static final long HIDE_MS = 4000;
    private static final int BAR = 0x1b1d21;

    private final S60Tube app;
    private final String url;
    private final String title;
    private final Displayable back;
    /** Chi BlackBerry: phim thoat cua no goi Command BACK chu khong vao keyPressed. */
    private final Command cmdBack = new Command("Quay lại", Command.BACK, 1);

    private Player player;
    private VideoControl video;
    private String status = "Đang mở…";
    private volatile boolean closed;
    private boolean started;
    private boolean controls = true;
    private long hideAt;
    private String notice;
    private long noticeUntil;
    /** Khung hinh dang chiem tren man hinh; paint() khong to de len cho nay. */
    private int vx, vy, vw, vh;
    private int layoutKey = -1;

    PlayerCanvas(S60Tube app, String url, String title, Displayable back) {
        this.app = app;
        this.url = url;
        this.title = title;
        this.back = back;
        setFullScreenMode(true);
        if (Device.BLACKBERRY) {
            addCommand(cmdBack);
            setCommandListener(this);
        }
    }

    /**
     * Chi mo trinh phat khi man hinh nay da hien: goi initDisplayMode luc Canvas
     * chua len man hinh thi co may chi hien man den (gap tren E6).
     */
    protected void showNotify() {
        if (!started) {
            started = true;
            new Thread(this).start();
            new Thread(new Runnable() {
                public void run() {
                    tick();
                }
            }).start();
        } else {
            showVideo();
        }
    }

    public void run() {
        try {
            player = Manager.createPlayer(Device.url(url));
            if (gone()) {
                return;
            }
            player.addPlayerListener(this);
            player.realize();
            if (gone()) {
                return;
            }
            video = (VideoControl) player.getControl("VideoControl");
            if (video != null) {
                video.initDisplayMode(VideoControl.USE_DIRECT_VIDEO, this);
            }
            status = "Đang đệm…";
            repaint();
            player.prefetch();
            if (gone()) {
                return;
            }
            // Kich thuoc that cua phim chi biet sau prefetch.
            showVideo();
            player.start();
            showVideo();
            poke();
        } catch (Throwable e) {
            if (!closed) {
                close(e.toString());
            }
        }
    }

    /** Da bam Quay lai trong luc dang mo: dong trinh phat vua mo xong. */
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

    /** Cap nhat dong ho thoi gian va tu an thanh dieu khien. */
    private void tick() {
        while (!closed) {
            try {
                Thread.sleep(500);
            } catch (InterruptedException e) {
                return;
            }
            if (controls && playing() && System.currentTimeMillis() > hideAt) {
                controls = false;
                showVideo();
            } else if (controls || notice != null) {
                if (notice != null && System.currentTimeMillis() > noticeUntil) {
                    notice = null;
                }
                repaint();
            }
        }
    }

    private boolean playing() {
        return player != null && player.getState() == Player.STARTED;
    }

    /** Hien thanh dieu khien them vai giay. */
    private void poke() {
        hideAt = System.currentTimeMillis() + HIDE_MS;
        if (!controls) {
            controls = true;
            showVideo();
        } else {
            repaint();
        }
    }

    // ---------- bo cuc ----------

    private int topH() {
        return Ui.bold.getHeight() + Ui.pad * 2;
    }

    private int iconSize() {
        return Math.max(16, Ui.em * 6 / 5);
    }

    private int bottomH() {
        return Ui.small.getHeight() + iconSize() + Ui.pad * 3;
    }

    private void showVideo() {
        if (video != null) {
            fitVideo();
            try {
                video.setVisible(true);
            } catch (Exception ignored) {
            }
        }
        repaint();
    }

    /** Giu ty le khung hinh, dat giua khoang trong (tru hai thanh neu dang hien). */
    private void fitVideo() {
        int sw = getWidth();
        int top = controls ? topH() : 0;
        int sh = getHeight() - top - (controls ? bottomH() : 0);
        int w = sw;
        int h = sh;
        try {
            int srcW = video.getSourceWidth();
            int srcH = video.getSourceHeight();
            if (srcW > 0 && srcH > 0) {
                h = srcH * sw / srcW;
                if (h > sh) {
                    h = sh;
                    w = srcW * sh / srcH;
                }
            }
            int key = (sw - w) / 2 * 7 + top + (sh - h) / 2 * 31 + w * 131 + h * 1031;
            if (key != layoutKey) {
                layoutKey = key;
                video.setDisplayLocation((sw - w) / 2, top + (sh - h) / 2);
                video.setDisplaySize(w, h);
            }
        } catch (Exception e) {
            // may khong cho dat co thi de mac dinh
        }
        vx = (sw - w) / 2;
        vy = top + (sh - h) / 2;
        vw = w;
        vh = h;
    }

    protected void sizeChanged(int w, int h) {
        showVideo();
    }

    // ---------- ve ----------

    protected void paint(Graphics g) {
        Ui.setup();
        int sw = getWidth();
        int sh = getHeight();
        g.setColor(0x000000);
        if (video != null && playing() && vw > 0) {
            // Chi to vien den quanh khung: co may ve Canvas de len hinh, to kin
            // man hinh la che mat phim.
            g.fillRect(0, 0, sw, vy);
            g.fillRect(0, vy + vh, sw, sh - vy - vh);
            g.fillRect(0, vy, vx, vh);
            g.fillRect(vx + vw, vy, sw - vx - vw, vh);
        } else {
            g.fillRect(0, 0, sw, sh);
            Font f = Ui.font;
            g.setFont(f);
            g.setColor(0xffffff);
            int cy = sh / 2 - f.getHeight();
            String[] lines = Ui.wrap(video == null && playing() ? title : status, f, sw - Ui.pad * 4, 3);
            for (int i = 0; i < lines.length; i++) {
                g.drawString(lines[i], sw / 2, cy + i * f.getHeight(), Graphics.TOP | Graphics.HCENTER);
            }
        }
        if (controls) {
            paintTop(g, sw);
            paintBottom(g, sw, sh);
        } else if (notice != null) {
            paintTop(g, sw);
        }
    }

    private void paintTop(Graphics g, int sw) {
        int h = topH();
        g.setColor(BAR);
        g.fillRect(0, 0, sw, h);
        int s = iconSize() * 3 / 4;
        Ui.icon(g, Ui.ICON_BACK, Ui.pad, (h - s) / 2, s, Ui.WHITE);
        int tx = Ui.pad * 2 + s;
        g.setFont(Ui.bold);
        g.setColor(Ui.WHITE);
        String text = notice != null ? notice : title;
        g.drawString(Ui.ellipsis(text, Ui.bold, sw - tx - Ui.pad), tx, Ui.pad, Graphics.TOP | Graphics.LEFT);
    }

    private void paintBottom(Graphics g, int sw, int sh) {
        int h = bottomH();
        int top = sh - h;
        int p = Ui.pad;
        g.setColor(BAR);
        g.fillRect(0, top, sw, h);

        // Dong thoi gian: 1:23 [====------] 4:56
        long now = player != null ? safeTime() : -1;
        long total = player != null ? safeDuration() : -1;
        String left = clock(now);
        String right = clock(total);
        g.setFont(Ui.small);
        int lh = Ui.small.getHeight();
        int ty = top + p;
        g.setColor(0xd0d4d8);
        g.drawString(left, p, ty, Graphics.TOP | Graphics.LEFT);
        g.drawString(right, sw - p, ty, Graphics.TOP | Graphics.RIGHT);
        int bx = p * 2 + Ui.small.stringWidth(left);
        int bw = sw - bx - p * 2 - Ui.small.stringWidth(right);
        int bh = Math.max(4, lh / 3);
        int by = ty + (lh - bh) / 2;
        if (bw > 0) {
            Ui.round(g, bx, by, bw, bh, bh / 2, 0x4a4f56);
            if (total > 0 && now > 0) {
                int fill = (int) Math.min(bw, now * bw / total);
                if (fill > bh) {
                    Ui.round(g, bx, by, fill, bh, bh / 2, Ui.RED);
                }
            }
        }

        // Ba nut o giua: lui, phat/dung, toi.
        int s = iconSize();
        int iy = ty + lh + p;
        int cx = sw / 2;
        int step = s * 2 + p;
        Ui.icon(g, Ui.ICON_REWIND, cx - step - s / 2, iy, s, Ui.WHITE);
        Ui.icon(g, playing() ? Ui.ICON_PAUSE : Ui.ICON_PLAY, cx - s / 2, iy, s, Ui.WHITE);
        Ui.icon(g, Ui.ICON_FORWARD, cx + step - s / 2, iy, s, Ui.WHITE);
    }

    private long safeTime() {
        try {
            return player.getMediaTime();
        } catch (Exception e) {
            return -1;
        }
    }

    private long safeDuration() {
        try {
            return player.getDuration();
        } catch (Exception e) {
            return -1;
        }
    }

    private static String clock(long us) {
        if (us < 0) {
            return "--:--";
        }
        long sec = us / 1000000L;
        long min = sec / 60;
        sec %= 60;
        String text = min + ":" + (sec < 10 ? "0" : "") + sec;
        if (min >= 60) {
            long m = min % 60;
            text = (min / 60) + ":" + (m < 10 ? "0" : "") + m + ":" + (sec < 10 ? "0" : "") + sec;
        }
        return text;
    }

    // ---------- phim va cham ----------


    protected void keyPressed(int key) {
        handleKey(key, false);
    }

    protected void keyRepeated(int key) {
        handleKey(key, true);
    }

    private void handleKey(int key, boolean repeat) {
        int action = 0;
        try {
            action = getGameAction(key);
        } catch (Exception ignored) {
        }
        int soft = Device.soft(key, action);
        if (soft > 0) {
            if (!repeat) {
                close(null);
            }
            return;
        }
        boolean wasHidden = !controls;
        poke();
        if (soft < 0 || key == KEY_NUM5 || key == -5 || key == 10 || action == FIRE) {
            if (!repeat && !wasHidden) {
                togglePause();
            }
        } else if (key == KEY_NUM4 || action == LEFT) {
            seek(-STEP_US);
        } else if (key == KEY_NUM6 || action == RIGHT) {
            seek(STEP_US);
        } else if (key == KEY_NUM2 || key == KEY_NUM8 || action == UP || action == DOWN) {
            volume(key == KEY_NUM2 || action == UP ? 10 : -10);
        }
    }

    protected void pointerPressed(int x, int y) {
        int sw = getWidth();
        int sh = getHeight();
        if (!controls) {
            poke();
            return;
        }
        poke();
        if (y < topH()) {
            if (x < topH() * 2) {
                close(null);
            }
            return;
        }
        int top = sh - bottomH();
        if (y < top) {
            // Cham vao giua phim: an/hien thanh.
            controls = false;
            showVideo();
            return;
        }
        int lh = Ui.small.getHeight();
        if (y < top + Ui.pad + lh + Ui.pad / 2) {
            // Thanh thoi gian: tua toi cho cham.
            long total = safeDuration();
            if (total > 0) {
                seekTo(total * x / Math.max(1, sw));
            }
            return;
        }
        int s = iconSize();
        int step = s * 2 + Ui.pad;
        int cx = sw / 2;
        if (x < cx - step / 2) {
            seek(-STEP_US);
        } else if (x > cx + step / 2) {
            seek(STEP_US);
        } else {
            togglePause();
        }
    }

    public void commandAction(Command c, Displayable d) {
        close(null);
    }

    private void togglePause() {
        if (player == null) {
            return;
        }
        final boolean pause = playing();
        status = pause ? "Tạm dừng" : "Đang phát";
        background(new Runnable() {
            public void run() {
                try {
                    if (pause) {
                        player.stop();
                    } else {
                        player.start();
                    }
                } catch (Exception ignored) {
                }
                showVideo();
            }
        });
    }

    private void seek(long delta) {
        long now = safeTime();
        if (now >= 0) {
            seekTo(Math.max(0, now + delta));
        }
    }

    /** Tua co the mat ca giay tren luong HTTP — chay rieng cho khoi dung phim. */
    private void seekTo(final long us) {
        if (player == null) {
            return;
        }
        background(new Runnable() {
            public void run() {
                try {
                    player.setMediaTime(us);
                } catch (Exception e) {
                    note("Không tua được");
                }
                repaint();
            }
        });
    }

    private void volume(int delta) {
        if (player == null) {
            return;
        }
        VolumeControl control = (VolumeControl) player.getControl("VolumeControl");
        if (control != null) {
            int level = control.setLevel(Math.max(0, Math.min(100, control.getLevel() + delta)));
            note("Âm lượng " + level);
        }
    }

    private void note(String text) {
        notice = text;
        noticeUntil = System.currentTimeMillis() + 1500;
        repaint();
    }

    private static void background(Runnable job) {
        new Thread(job).start();
    }

    // ---------- su kien cua trinh phat ----------

    public void playerUpdate(Player p, String event, Object data) {
        if (END_OF_MEDIA.equals(event)) {
            status = "Hết";
            controls = true;
            showVideo();
        } else if (ERROR.equals(event)) {
            close(String.valueOf(data));
        } else if ("bufferingStarted".equals(event)) {
            status = "Đang đệm…";
            repaint();
        } else if (STARTED.equals(event) || "bufferingStopped".equals(event)) {
            status = "Đang phát";
            showVideo();
        } else if (STOPPED.equals(event)) {
            controls = true;
            repaint();
        } else if ("sizeChanged".equals(event)) {
            layoutKey = -1;
            showVideo();
        }
    }

    /**
     * Ve trang truoc ngay, dong trinh phat sau: Player.close() tren luong HTTP co
     * the treo lau, cho no xong moi quay lai thi nhu bam Quay lai khong an.
     */
    private void close(String error) {
        synchronized (this) {
            if (closed) {
                return;
            }
            closed = true;
        }
        app.playerClosed(back, error);
        final Player p = player;
        if (p != null) {
            background(new Runnable() {
                public void run() {
                    try {
                        if (video != null) {
                            video.setVisible(false);
                        }
                    } catch (Exception ignored) {
                    }
                    try {
                        p.close();
                    } catch (Exception ignored) {
                    }
                }
            });
        }
    }
}
