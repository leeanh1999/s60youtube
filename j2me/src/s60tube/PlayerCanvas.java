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

    PlayerCanvas(S60Tube app, String url, String title, Displayable back) {
        this.app = app;
        this.url = url;
        this.title = title;
        this.back = back;
        setFullScreenMode(true);
        addCommand(cmdStop);
        setCommandListener(this);
        new Thread(this).start();
    }

    public void run() {
        try {
            player = Manager.createPlayer(url);
            player.addPlayerListener(this);
            player.realize();
            video = (VideoControl) player.getControl("VideoControl");
            if (video != null) {
                video.initDisplayMode(VideoControl.USE_DIRECT_VIDEO, this);
                fitVideo();
                video.setVisible(true);
            }
            status = "Đang đệm…";
            repaint();
            player.prefetch();
            player.start();
        } catch (Throwable e) {
            close(e.toString());
        }
    }

    /** Giu ty le khung hinh, dat giua man hinh. */
    private void fitVideo() {
        try {
            int sw = getWidth();
            int sh = getHeight();
            int vw = video.getSourceWidth();
            int vh = video.getSourceHeight();
            if (vw <= 0 || vh <= 0) {
                video.setDisplayFullScreen(true);
                return;
            }
            int w = sw;
            int h = vh * sw / vw;
            if (h > sh) {
                h = sh;
                w = vw * sh / vh;
            }
            video.setDisplaySize(w, h);
            video.setDisplayLocation((sw - w) / 2, (sh - h) / 2);
        } catch (Exception e) {
            // may khong cho dat co thi de mac dinh
        }
    }

    protected void sizeChanged(int w, int h) {
        if (video != null) {
            fitVideo();
        }
    }

    protected void paint(Graphics g) {
        g.setColor(0x000000);
        g.fillRect(0, 0, getWidth(), getHeight());
        if (video != null && player != null && player.getState() == Player.STARTED) {
            return;
        }
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
            repaint();
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
