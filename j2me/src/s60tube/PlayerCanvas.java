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
 * Phat ngay trong app bang MMAPI (JSR-135). Phim: 5/OK tam dung, 4/6 lui/toi
 * 10 giay, len/xuong chinh am luong. Luong tieng (.m4a) khong co VideoControl
 * thi chi hien tieu de va thoi gian.
 */
final class PlayerCanvas extends Canvas implements Runnable, PlayerListener, CommandListener {

    private static final long STEP_US = 10000000L;

    private final S60Tube app;
    private final String url;
    private final String title;
    private final Displayable back;
    private final Command cmdStop = new Command("Dừng", Command.BACK, 1);

    private Player player;
    private VideoControl video;
    private String status = "Đang mở…";
    private boolean closed;
    private boolean started;
    /** Khung hinh dang chiem tren man hinh; paint() khong to de len cho nay. */
    private int vx, vy, vw, vh;

    PlayerCanvas(S60Tube app, String url, String title, Displayable back) {
        this.app = app;
        this.url = url;
        this.title = title;
        this.back = back;
        setFullScreenMode(true);
        addCommand(cmdStop);
        setCommandListener(this);
    }

    /**
     * Chi mo trinh phat khi man hinh nay da hien: goi initDisplayMode luc Canvas
     * chua len man hinh thi co may chi hien man den (gap tren E6).
     */
    protected void showNotify() {
        if (!started) {
            started = true;
            new Thread(this).start();
        } else if (video != null) {
            showVideo();
        }
    }

    public void run() {
        try {
            player = Manager.createPlayer(Device.url(url));
            player.addPlayerListener(this);
            player.realize();
            video = (VideoControl) player.getControl("VideoControl");
            if (video != null) {
                video.initDisplayMode(VideoControl.USE_DIRECT_VIDEO, this);
            }
            status = "Đang đệm…";
            repaint();
            player.prefetch();
            // Kich thuoc that cua phim chi biet sau prefetch.
            showVideo();
            player.start();
            showVideo();
        } catch (Throwable e) {
            close(e.toString());
        }
    }

    private void showVideo() {
        if (video == null) {
            return;
        }
        fitVideo();
        try {
            video.setVisible(true);
        } catch (Exception ignored) {
        }
        repaint();
    }

    /** Giu ty le khung hinh, dat giua man hinh. */
    private void fitVideo() {
        int sw = getWidth();
        int sh = getHeight();
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
            video.setDisplayLocation((sw - w) / 2, (sh - h) / 2);
            video.setDisplaySize(w, h);
        } catch (Exception e) {
            // may khong cho dat co thi de mac dinh
        }
        vx = (sw - w) / 2;
        vy = (sh - h) / 2;
        vw = w;
        vh = h;
    }

    protected void sizeChanged(int w, int h) {
        showVideo();
    }

    protected void paint(Graphics g) {
        int sw = getWidth();
        int sh = getHeight();
        g.setColor(0x000000);
        if (video != null && player != null && player.getState() == Player.STARTED && vw > 0) {
            // Chi to vien den quanh khung: co may ve Canvas de len hinh, to kin
            // man hinh la che mat phim.
            g.fillRect(0, 0, sw, vy);
            g.fillRect(0, vy + vh, sw, sh - vy - vh);
            g.fillRect(0, vy, vx, vh);
            g.fillRect(vx + vw, vy, sw - vx - vw, vh);
            return;
        }
        g.fillRect(0, 0, sw, sh);
        g.setColor(0xffffff);
        Font font = Font.getFont(Font.FACE_SYSTEM, Font.STYLE_PLAIN, Font.SIZE_MEDIUM);
        g.setFont(font);
        int y = getHeight() / 2 - font.getHeight();
        g.drawString(title, getWidth() / 2, y, Graphics.TOP | Graphics.HCENTER);
        g.drawString(status, getWidth() / 2, y + font.getHeight() + 4, Graphics.TOP | Graphics.HCENTER);
    }

    protected void keyPressed(int key) {
        if (player == null) {
            return;
        }
        int action = getGameAction(key);
        try {
            if (key == KEY_NUM5 || action == FIRE) {
                if (player.getState() == Player.STARTED) {
                    player.stop();
                    status = "Tạm dừng";
                } else {
                    player.start();
                }
            } else if (key == KEY_NUM4 || action == LEFT) {
                seek(-STEP_US);
            } else if (key == KEY_NUM6 || action == RIGHT) {
                seek(STEP_US);
            } else if (action == UP || action == DOWN) {
                VolumeControl volume = (VolumeControl) player.getControl("VolumeControl");
                if (volume != null) {
                    volume.setLevel(volume.getLevel() + (action == UP ? 10 : -10));
                }
            }
        } catch (Exception e) {
            // tua khong duoc (luong khong co chi muc) thi bo qua
        }
        repaint();
    }

    private void seek(long delta) throws Exception {
        long now = player.getMediaTime();
        if (now >= 0) {
            player.setMediaTime(Math.max(0, now + delta));
        }
    }

    public void playerUpdate(Player p, String event, Object data) {
        if (END_OF_MEDIA.equals(event)) {
            close(null);
        } else if (ERROR.equals(event)) {
            close(String.valueOf(data));
        } else if ("bufferingStarted".equals(event)) {
            status = "Đang đệm…";
            repaint();
        } else if (STARTED.equals(event) || "bufferingStopped".equals(event)) {
            status = "Đang phát";
            showVideo();
        } else if ("sizeChanged".equals(event)) {
            showVideo();
        }
    }

    public void commandAction(Command c, Displayable d) {
        close(null);
    }

    private synchronized void close(String error) {
        if (closed) {
            return;
        }
        closed = true;
        if (player != null) {
            try {
                player.close();
            } catch (Exception ignored) {
            }
        }
        app.playerClosed(back, error);
    }
}
