package s60tube;

import java.util.Vector;

import javax.microedition.lcdui.Font;
import javax.microedition.lcdui.Graphics;

/**
 * Mau, co chu va cac ham ve chung — theo dung public/s60.css cua ban web.
 *
 * Moi khoang cach deu tinh theo chieu cao dong chu ('em'), nen doi co chu
 * trong Cai dat hay sang may man hinh khac la ca giao dien to nho theo, giong
 * nhu CSS do bang em.
 */
final class Ui {

    // Mau lay tu s60.css.
    static final int BG = 0xe9ecef;
    static final int TEXT = 0x14161a;
    static final int RED = 0xc00000;
    static final int RED_DARK = 0x8c0000;
    static final int RED_PRESS = 0xa30000;
    static final int CARD = 0xffffff;
    static final int LINE = 0xd3d8dd;
    static final int LINE_SOFT = 0xb9bfc6;
    static final int FOCUS = 0xfff6d5;
    static final int TITLE = 0x0b2f8f;
    static final int LINK = 0x0b3fbf;
    static final int SUB = 0x3d434a;
    static final int MUTED = 0x6b7178;
    static final int HEAD = 0x33383d;
    static final int NAV = 0xf4f6f8;
    static final int NAV_LINE = 0xc3c9cf;
    static final int NAV_TEXT = 0x4a5058;
    static final int WARN_BG = 0xfff9e0;
    static final int WARN_LINE = 0xe0bf00;
    static final int ERR_BG = 0xffeceb;
    static final int OK_BG = 0xecfaec;
    static final int OK_LINE = 0x2f9e2f;
    static final int BLACK = 0x000000;
    static final int WHITE = 0xffffff;

    static final int ICON_PLAY = 1;
    static final int ICON_NOTE = 2;
    static final int ICON_GEAR = 3;
    static final int ICON_INFO = 4;
    static final int ICON_SEARCH = 5;
    static final int ICON_HOME = 6;
    static final int ICON_USER = 7;
    static final int ICON_NEXT = 8;
    static final int ICON_EXIT = 9;
    static final int ICON_RELOAD = 10;

    static Font font;
    static Font bold;
    static Font small;
    static Font smallBold;
    static Font big;
    static Font mono;

    /** Chieu cao dong chu chinh — don vi do cua ca giao dien. */
    static int em;
    /** Khoang cach chung: le ngoai the, dem trong the. */
    static int gap;
    static int pad;
    static int radius;

    private static int lastSize = -1;
    /** Tang moi lan doi co chu/an hien anh — trang nao thay khac so la sap lai. */
    static int version;

    private Ui() {
    }

    /** Chon co chu theo cai dat; goi lai moi khi doi co chu. */
    static void setup() {
        if (lastSize == Settings.textSize) {
            return;
        }
        lastSize = Settings.textSize;
        version++;
        int size = Settings.textSize == 0 ? Font.SIZE_SMALL
                : Settings.textSize == 2 ? Font.SIZE_LARGE : Font.SIZE_MEDIUM;
        int smaller = size == Font.SIZE_LARGE ? Font.SIZE_MEDIUM : Font.SIZE_SMALL;
        int bigger = size == Font.SIZE_SMALL ? Font.SIZE_MEDIUM : Font.SIZE_LARGE;
        font = Font.getFont(Font.FACE_PROPORTIONAL, Font.STYLE_PLAIN, size);
        bold = Font.getFont(Font.FACE_PROPORTIONAL, Font.STYLE_BOLD, size);
        small = Font.getFont(Font.FACE_PROPORTIONAL, Font.STYLE_PLAIN, smaller);
        smallBold = Font.getFont(Font.FACE_PROPORTIONAL, Font.STYLE_BOLD, smaller);
        big = Font.getFont(Font.FACE_MONOSPACE, Font.STYLE_BOLD, bigger);
        mono = Font.getFont(Font.FACE_MONOSPACE, Font.STYLE_PLAIN, smaller);
        em = font.getHeight();
        gap = Math.max(3, em * 3 / 10);
        pad = Math.max(4, em * 4 / 10);
        radius = Math.max(4, em / 3);
    }

    static void forceSetup() {
        lastSize = -1;
        setup();
    }

    // ---------- ve ----------

    /** Hop bo goc co nen va vien (CSS: background + border + border-radius). */
    static void box(Graphics g, int x, int y, int w, int h, int fill, int line) {
        int r = radius * 2;
        g.setColor(line);
        g.fillRoundRect(x, y, w, h, r, r);
        g.setColor(fill);
        g.fillRoundRect(x + 1, y + 1, w - 2, h - 2, r - 2, r - 2);
    }

    static void icon(Graphics g, int kind, int x, int y, int s, int color) {
        g.setColor(color);
        int c = s / 2;
        switch (kind) {
            case ICON_PLAY:
                g.fillTriangle(x + s / 6, y, x + s / 6, y + s, x + s, y + c);
                break;
            case ICON_NEXT:
                g.fillTriangle(x + s / 4, y + s / 8, x + s / 4, y + s - s / 8, x + s - s / 6, y + c);
                break;
            case ICON_NOTE: {
                int head = Math.max(4, s * 5 / 12);
                g.fillArc(x, y + s - head, head + 2, head, 0, 360);
                g.fillRect(x + head, y + 1, Math.max(2, s / 8), s - head / 2);
                g.fillTriangle(x + head, y + 1, x + s, y + s / 4, x + head, y + s / 2);
                break;
            }
            case ICON_GEAR: {
                int t = Math.max(2, s / 6);
                g.fillRect(x + c - t / 2, y, t, s);
                g.fillRect(x, y + c - t / 2, s, t);
                g.fillArc(x + s / 6, y + s / 6, s - s / 3, s - s / 3, 0, 360);
                g.setColor(0xffffff);
                g.fillArc(x + c - s / 6, y + c - s / 6, s / 3, s / 3, 0, 360);
                break;
            }
            case ICON_INFO: {
                g.fillArc(x, y, s, s, 0, 360);
                g.setColor(0xffffff);
                int t = Math.max(2, s / 7);
                g.fillRect(x + c - t / 2, y + s * 7 / 16, t, s * 3 / 8);
                g.fillRect(x + c - t / 2, y + s / 5, t, t);
                break;
            }
            case ICON_SEARCH: {
                int t = Math.max(2, s / 7);
                int d = s * 2 / 3;
                for (int i = 0; i < t; i++) {
                    g.drawArc(x + i, y + i, d - 2 * i, d - 2 * i, 0, 360);
                }
                for (int i = -t / 2; i <= t / 2; i++) {
                    g.drawLine(x + d - s / 10 + i, y + d - s / 10, x + s - 1 + i, y + s - 1);
                }
                break;
            }
            case ICON_HOME:
                g.fillTriangle(x, y + c, x + c, y, x + s, y + c);
                g.fillRect(x + s / 6, y + c, s - s / 3, s - c);
                break;
            case ICON_USER:
                g.fillArc(x + s / 4, y, s / 2, s / 2, 0, 360);
                g.fillArc(x, y + s / 2, s, s, 0, 180);
                break;
            case ICON_EXIT: {
                int t = Math.max(2, s / 7);
                for (int i = -t / 2; i <= t / 2; i++) {
                    g.drawLine(x + i, y, x + s - 1 + i, y + s - 1);
                    g.drawLine(x + s - 1 + i, y, x + i, y + s - 1);
                }
                break;
            }
            case ICON_RELOAD: {
                int t = Math.max(2, s / 7);
                for (int i = 0; i < t; i++) {
                    g.drawArc(x + i, y + i, s - 2 * i, s - 2 * i, 30, 280);
                }
                g.fillTriangle(x + s - t, y, x + s, y + s / 2, x + s / 2, y + s / 3);
                break;
            }
            default:
                break;
        }
    }

    /** Logo nut phat YouTube: khung bo goc + tam giac. */
    static void logo(Graphics g, int x, int y, int h, int frame, int mark) {
        int w = h * 143 / 100;
        g.setColor(frame);
        g.fillRoundRect(x, y, w, h, h * 45 / 100, h * 45 / 100);
        int th = h / 2;
        int tw = th * 87 / 100;
        int cx = x + w / 2 + tw / 12;
        int cy = y + h / 2;
        g.setColor(mark);
        g.fillTriangle(cx - tw / 2, cy - th / 2, cx - tw / 2, cy + th / 2, cx + tw / 2, cy);
    }

    static int logoWidth(int h) {
        return h * 143 / 100;
    }

    // ---------- chu ----------

    /** Cat dong theo tu cho vua be ngang; qua maxLines thi dong cuoi them '...'. */
    static String[] wrap(String text, Font f, int width, int maxLines) {
        Vector lines = new Vector();
        if (width < f.charWidth('W')) {
            width = f.charWidth('W');
        }
        int start = 0;
        int n = text.length();
        while (start < n) {
            int nl = text.indexOf('\n', start);
            int end = nl < 0 ? n : nl;
            wrapParagraph(text.substring(start, end), f, width, lines);
            start = end + 1;
            if (nl >= 0 && nl == n - 1) {
                break;
            }
        }
        if (lines.isEmpty()) {
            lines.addElement("");
        }
        if (maxLines > 0 && lines.size() > maxLines) {
            lines.setSize(maxLines);
            String last = (String) lines.elementAt(maxLines - 1);
            lines.setElementAt(ellipsis(last + "...", f, width), maxLines - 1);
        }
        String[] result = new String[lines.size()];
        lines.copyInto(result);
        return result;
    }

    private static void wrapParagraph(String text, Font f, int width, Vector out) {
        if (text.length() == 0) {
            out.addElement("");
            return;
        }
        int start = 0;
        while (start < text.length()) {
            int end = text.length();
            if (f.substringWidth(text, start, end - start) > width) {
                // Lui ve cho cat dai nhat con vua, uu tien cat o dau cach.
                end = start + 1;
                int lastSpace = -1;
                while (end < text.length()
                        && f.substringWidth(text, start, end + 1 - start) <= width) {
                    end++;
                    if (text.charAt(end - 1) == ' ') {
                        lastSpace = end;
                    }
                }
                if (lastSpace > start && end < text.length()) {
                    end = lastSpace;
                }
            }
            out.addElement(text.substring(start, end).trim());
            start = end;
            while (start < text.length() && text.charAt(start) == ' ') {
                start++;
            }
        }
    }

    /** Cat chu cho vua mot dong, them '...' neu phai cat. */
    static String ellipsis(String text, Font f, int width) {
        if (f.stringWidth(text) <= width) {
            return text;
        }
        int dots = f.stringWidth("...");
        int end = text.length();
        while (end > 0 && f.substringWidth(text, 0, end) + dots > width) {
            end--;
        }
        return text.substring(0, end).trim() + "...";
    }

    static void lines(Graphics g, String[] lines, Font f, int color, int x, int y) {
        g.setFont(f);
        g.setColor(color);
        int lh = f.getHeight();
        for (int i = 0; i < lines.length; i++) {
            g.drawString(lines[i], x, y + i * lh, Graphics.TOP | Graphics.LEFT);
        }
    }
}
