package s60tube;

import javax.microedition.lcdui.Graphics;
import javax.microedition.lcdui.Image;

/**
 * Mot khoi tren trang — ung voi mot lop CSS cua ban web:
 * CARD = .card, OPTION = .opts li, BUTTON = a.go, MORE = .more, HEAD = h2,
 * NOTE = .desc/.warn/.err/.ok, CODE = .code, URL = .url, PROGRESS = .pbar,
 * TEXT = chu tran (.hint), INFO = .head (tieu de trang video).
 */
final class Item {

    static final int CARD = 1;
    static final int OPTION = 2;
    static final int BUTTON = 3;
    static final int MORE = 4;
    static final int HEAD = 5;
    static final int NOTE = 6;
    static final int CODE = 7;
    static final int URL = 8;
    static final int PROGRESS = 9;
    static final int TEXT = 10;
    static final int INFO = 11;

    static final int TONE_DESC = 0;
    static final int TONE_WARN = 1;
    static final int TONE_ERR = 2;
    static final int TONE_OK = 3;

    final int type;
    String title = "";
    String sub = "";
    String meta = "";
    /** Viec lam khi chon: S60Tube.act(action, value). */
    String action;
    String value;
    int icon;
    int tone;
    int progress;
    /** Chu nho ben phai muc chon (vd. trang thai cai dat). */
    String badge = "";

    /** Anh goc tu may chu va ban da thu nho theo khung hien tai. */
    Image thumb;
    private Image scaled;
    private int scaledW;

    // Bo cuc tinh lai moi khi doi be ngang.
    int y;
    int h;
    private int layoutW = -1;
    private String[] titleLines;
    private String[] subLines;
    private String[] metaLines;
    private int thumbW;
    private int thumbH;

    Item(int type) {
        this.type = type;
    }

    static Item of(int type, String title) {
        Item item = new Item(type);
        item.title = title == null ? "" : title;
        return item;
    }

    Item act(String action, String value) {
        this.action = action;
        this.value = value;
        return this;
    }

    Item icon(int icon) {
        this.icon = icon;
        return this;
    }

    Item tone(int tone) {
        this.tone = tone;
        return this;
    }

    Item sub(String sub) {
        this.sub = sub == null ? "" : sub;
        return this;
    }

    Item meta(String meta) {
        this.meta = meta == null ? "" : meta;
        return this;
    }

    boolean focusable() {
        return action != null && (type == CARD || type == OPTION || type == BUTTON || type == MORE);
    }

    void setThumb(Image image) {
        thumb = image;
        scaled = null;
    }

    void invalidate() {
        layoutW = -1;
    }

    /** Tinh chieu cao cho be ngang w (be ngang cua ca khoi, chua tru le). */
    int measure(int w) {
        if (w == layoutW) {
            return h;
        }
        layoutW = w;
        int p = Ui.pad;
        switch (type) {
            case CARD: {
                // Man hep qua (duoi 200 diem) thi anh chiem het cho cua chu.
                boolean withThumb = Settings.thumbs && w >= 200;
                thumbW = withThumb ? Math.min(w * 36 / 100, Ui.em * 8) : 0;
                thumbH = thumbW * 9 / 16;
                int tw = w - p * 2 - (withThumb ? thumbW + p : 0);
                titleLines = Ui.wrap(title, Ui.bold, tw, w < 300 ? 2 : 3);
                subLines = sub.length() > 0 ? Ui.wrap(sub, Ui.small, tw, 1) : new String[0];
                metaLines = meta.length() > 0 ? Ui.wrap(meta, Ui.small, tw, 1) : new String[0];
                int textH = titleLines.length * Ui.bold.getHeight()
                        + (subLines.length + metaLines.length) * Ui.small.getHeight() + 2;
                h = Math.max(thumbH, textH) + p * 2;
                break;
            }
            case OPTION: {
                int iconW = icon != 0 ? Ui.em + p : 0;
                int badgeW = badge.length() > 0 ? Ui.small.stringWidth(badge) + p : 0;
                titleLines = Ui.wrap(title, Ui.bold, w - p * 2 - iconW - badgeW, 2);
                subLines = sub.length() > 0 ? Ui.wrap(sub, Ui.small, w - p * 2 - iconW, 2) : new String[0];
                h = titleLines.length * Ui.bold.getHeight() + subLines.length * Ui.small.getHeight()
                        + p * 2 + p / 2;
                break;
            }
            case BUTTON:
            case MORE:
                titleLines = Ui.wrap(title, Ui.bold, w - p * 2 - Ui.em, 2);
                h = titleLines.length * Ui.bold.getHeight() + p * 3;
                break;
            case HEAD:
                titleLines = Ui.wrap(title, Ui.smallBold, w - p * 2, 2);
                h = titleLines.length * Ui.smallBold.getHeight() + Ui.gap;
                break;
            case NOTE:
                titleLines = Ui.wrap(title, Ui.small, w - p * 2, 0);
                h = titleLines.length * Ui.small.getHeight() + p * 2;
                break;
            case TEXT:
                titleLines = Ui.wrap(title, Ui.small, w - p, 0);
                h = titleLines.length * Ui.small.getHeight();
                break;
            case CODE:
                h = Ui.big.getHeight() + p * 3;
                break;
            case URL:
                titleLines = Ui.wrap(title, Ui.mono, w - p * 2, 0);
                h = titleLines.length * Ui.mono.getHeight() + p * 2;
                break;
            case PROGRESS:
                h = Math.max(10, Ui.em * 2 / 3);
                break;
            case INFO:
                titleLines = Ui.wrap(title, Ui.bold, w - p * 2, 4);
                subLines = sub.length() > 0 ? Ui.wrap(sub, Ui.small, w - p * 2, 2) : new String[0];
                metaLines = meta.length() > 0 ? Ui.wrap(meta, Ui.small, w - p * 2, 2) : new String[0];
                h = titleLines.length * Ui.bold.getHeight()
                        + (subLines.length + metaLines.length) * Ui.small.getHeight() + p * 2 + 4;
                break;
            default:
                h = 0;
        }
        return h;
    }

    void paint(Graphics g, int x, int top, int w, boolean focused) {
        int p = Ui.pad;
        switch (type) {
            case CARD: {
                Ui.box(g, x, top, w, h, focused ? Ui.FOCUS : Ui.CARD, focused ? Ui.RED : Ui.LINE);
                int tx = x + p;
                if (thumbW > 0) {
                    int ty = top + p;
                    g.setColor(Ui.BLACK);
                    g.fillRoundRect(x + p, ty, thumbW, thumbH, Ui.radius, Ui.radius);
                    Image img = scaledThumb();
                    if (img != null) {
                        g.drawImage(img, x + p, ty, Graphics.TOP | Graphics.LEFT);
                    }
                    if (focused) {
                        int s = Math.max(10, thumbH / 3);
                        Ui.icon(g, Ui.ICON_PLAY, x + p + (thumbW - s) / 2, ty + (thumbH - s) / 2, s, Ui.WHITE);
                    }
                    if (badge.length() > 0) {
                        int bw = Ui.smallBold.stringWidth(badge) + 6;
                        int bh = Ui.smallBold.getHeight();
                        int bx = x + p + thumbW - bw - 3;
                        int by = ty + thumbH - bh - 3;
                        g.setColor(Ui.BLACK);
                        g.fillRoundRect(bx, by, bw, bh, 6, 6);
                        g.setColor(Ui.WHITE);
                        g.setFont(Ui.smallBold);
                        g.drawString(badge, bx + 3, by, Graphics.TOP | Graphics.LEFT);
                    }
                    tx += thumbW + p;
                }
                int ty = top + p;
                Ui.lines(g, titleLines, Ui.bold, Ui.TITLE, tx, ty);
                ty += titleLines.length * Ui.bold.getHeight() + 2;
                Ui.lines(g, subLines, Ui.small, Ui.SUB, tx, ty);
                ty += subLines.length * Ui.small.getHeight();
                Ui.lines(g, metaLines, Ui.small, Ui.MUTED, tx, ty);
                break;
            }
            case OPTION: {
                Ui.box(g, x, top, w, h, focused ? Ui.FOCUS : Ui.CARD, focused ? Ui.RED : Ui.LINE);
                int tx = x + p;
                int ty = top + p + p / 4;
                if (icon != 0) {
                    int s = Ui.bold.getHeight() * 3 / 4;
                    Ui.icon(g, icon, tx, ty + (Ui.bold.getHeight() - s) / 2, s, Ui.RED);
                    tx += Ui.em + p;
                }
                Ui.lines(g, titleLines, Ui.bold, Ui.LINK, tx, ty);
                if (badge.length() > 0) {
                    g.setFont(Ui.small);
                    g.setColor(Ui.MUTED);
                    g.drawString(badge, x + w - p, ty + (Ui.bold.getHeight() - Ui.small.getHeight()) / 2,
                            Graphics.TOP | Graphics.RIGHT);
                }
                ty += titleLines.length * Ui.bold.getHeight();
                Ui.lines(g, subLines, Ui.small, Ui.MUTED, tx, ty);
                break;
            }
            case BUTTON: {
                Ui.box(g, x, top, w, h, focused ? Ui.RED_PRESS : Ui.RED, focused ? Ui.WHITE : Ui.RED_DARK);
                if (focused) {
                    g.setColor(Ui.RED_DARK);
                    g.drawRoundRect(x, top, w - 1, h - 1, Ui.radius * 2, Ui.radius * 2);
                }
                centered(g, x, top, w, Ui.WHITE, Ui.WHITE);
                break;
            }
            case MORE:
                Ui.box(g, x, top, w, h, focused ? Ui.FOCUS : Ui.CARD, focused ? Ui.RED : Ui.LINE);
                centered(g, x, top, w, Ui.LINK, Ui.RED);
                break;
            case HEAD: {
                g.setColor(Ui.RED);
                g.fillRect(x, top + Ui.gap / 2, Math.max(3, Ui.em / 6), h - Ui.gap / 2);
                Ui.lines(g, titleLines, Ui.smallBold, Ui.HEAD, x + Math.max(3, Ui.em / 6) + p, top + Ui.gap / 2);
                break;
            }
            case NOTE: {
                int fill = tone == TONE_WARN ? Ui.WARN_BG : tone == TONE_ERR ? Ui.ERR_BG
                        : tone == TONE_OK ? Ui.OK_BG : Ui.CARD;
                int line = tone == TONE_WARN ? Ui.WARN_LINE : tone == TONE_ERR ? Ui.RED
                        : tone == TONE_OK ? Ui.OK_LINE : Ui.LINE;
                Ui.box(g, x, top, w, h, fill, line);
                Ui.lines(g, titleLines, Ui.small, Ui.TEXT, x + p, top + p);
                break;
            }
            case TEXT:
                Ui.lines(g, titleLines, Ui.small, Ui.MUTED, x + p / 2, top);
                break;
            case CODE: {
                Ui.box(g, x, top, w, h, Ui.RED, Ui.RED);
                g.setColor(Ui.CARD);
                g.fillRoundRect(x + 2, top + 2, w - 4, h - 4, Ui.radius * 2 - 2, Ui.radius * 2 - 2);
                g.setFont(Ui.big);
                g.setColor(Ui.TEXT);
                g.drawString(title, x + w / 2, top + (h - Ui.big.getHeight()) / 2, Graphics.TOP | Graphics.HCENTER);
                break;
            }
            case URL:
                Ui.box(g, x, top, w, h, Ui.CARD, Ui.LINE);
                Ui.lines(g, titleLines, Ui.mono, Ui.TEXT, x + p, top + p);
                break;
            case PROGRESS: {
                Ui.box(g, x, top, w, h, Ui.CARD, Ui.LINE_SOFT);
                int fill = (w - 2) * Math.max(0, Math.min(100, progress)) / 100;
                if (fill > 0) {
                    g.setColor(Ui.RED);
                    g.fillRoundRect(x + 1, top + 1, fill, h - 2, Ui.radius, Ui.radius);
                }
                break;
            }
            case INFO: {
                Ui.box(g, x, top, w, h, Ui.CARD, Ui.LINE);
                int ty = top + p;
                Ui.lines(g, titleLines, Ui.bold, Ui.TEXT, x + p, ty);
                ty += titleLines.length * Ui.bold.getHeight() + 4;
                Ui.lines(g, subLines, Ui.small, Ui.SUB, x + p, ty);
                ty += subLines.length * Ui.small.getHeight();
                Ui.lines(g, metaLines, Ui.small, Ui.MUTED, x + p, ty);
                break;
            }
            default:
                break;
        }
    }

    /** Chu (va bieu tuong neu co) can giua — nut do va nut "Trang sau". */
    private void centered(Graphics g, int x, int top, int w, int color, int iconColor) {
        int lh = Ui.bold.getHeight();
        int ty = top + (h - titleLines.length * lh) / 2;
        int s = lh * 3 / 4;
        for (int i = 0; i < titleLines.length; i++) {
            int lw = Ui.bold.stringWidth(titleLines[i]);
            int total = lw + (i == 0 && icon != 0 ? s + Ui.pad : 0);
            int lx = x + (w - total) / 2;
            if (i == 0 && icon != 0) {
                Ui.icon(g, icon, lx, ty + (lh - s) / 2, s, iconColor);
                lx += s + Ui.pad;
            }
            g.setFont(Ui.bold);
            g.setColor(color);
            g.drawString(titleLines[i], lx, ty + i * lh, Graphics.TOP | Graphics.LEFT);
        }
    }

    /** Thu nho anh goc cho dung khung 16:9 cua the — chi lam lai khi doi kich thuoc. */
    private Image scaledThumb() {
        if (thumb == null || thumbW <= 0) {
            return null;
        }
        if (scaled == null || scaledW != thumbW) {
            scaled = scale(thumb, thumbW, thumbH);
            scaledW = thumbW;
        }
        return scaled;
    }

    /** Lay diem gan nhat, cat giua cho dung ty le khung (anh YouTube co the co vien den). */
    static Image scale(Image src, int w, int h) {
        int sw = src.getWidth();
        int sh = src.getHeight();
        if (w <= 0 || h <= 0) {
            return null;
        }
        // Lay vung giua cua anh goc co cung ty le voi khung.
        int cw = sw;
        int ch = sw * h / w;
        if (ch > sh) {
            ch = sh;
            cw = sh * w / h;
        }
        int cx = (sw - cw) / 2;
        int cy = (sh - ch) / 2;
        int[] row = new int[cw];
        int[] out = new int[w * h];
        int lastSy = -1;
        for (int y = 0; y < h; y++) {
            int sy = cy + y * ch / h;
            if (sy != lastSy) {
                src.getRGB(row, 0, cw, cx, sy, cw, 1);
                lastSy = sy;
            }
            int base = y * w;
            for (int x = 0; x < w; x++) {
                out[base + x] = row[x * cw / w];
            }
        }
        return Image.createRGBImage(out, w, h, false);
    }
}
