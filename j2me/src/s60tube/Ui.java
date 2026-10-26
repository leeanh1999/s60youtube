package s60tube;

import java.util.Vector;

import javax.microedition.lcdui.Font;
import javax.microedition.lcdui.Graphics;
import javax.microedition.lcdui.Image;

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
    static final int ICON_MENU = 11;
    static final int ICON_BACK = 12;
    static final int ICON_CHECK = 13;

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
        round(g, x, y, w, h, radius, line);
        round(g, x + 1, y + 1, w - 2, h - 2, radius - 1, fill);
    }

    /** Graphics.drawRegion: TRANS_NONE cua Sprite — khong xoay, khong lat. */
    private static final int TRANS_NONE = 0;
    private static final int TOP_LEFT = Graphics.TOP | Graphics.LEFT;

    /**
     * Khoi chu nhat bo goc, goc khu rang cua: than la hinh chu nhat, bon goc la
     * bon phan tu cua mot hinh tron dung san (Shapes.disc).
     */
    static void round(Graphics g, int x, int y, int w, int h, int r, int color) {
        r = Math.min(r, Math.min(w / 2, h / 2));
        g.setColor(color);
        if (r <= 1) {
            g.fillRect(x, y, w, h);
            return;
        }
        g.fillRect(x + r, y, w - 2 * r, h);
        g.fillRect(x, y + r, r, h - 2 * r);
        g.fillRect(x + w - r, y + r, r, h - 2 * r);
        Image disc = Shapes.disc(r, color);
        g.drawRegion(disc, 0, 0, r, r, TRANS_NONE, x, y, TOP_LEFT);
        g.drawRegion(disc, r, 0, r, r, TRANS_NONE, x + w - r, y, TOP_LEFT);
        g.drawRegion(disc, 0, r, r, r, TRANS_NONE, x, y + h - r, TOP_LEFT);
        g.drawRegion(disc, r, r, r, r, TRANS_NONE, x + w - r, y + h - r, TOP_LEFT);
    }

    /** Bo goc mot khoi da ve (anh thu nho): phu mau nen len phan ngoai bon goc. */
    static void clipCorners(Graphics g, int x, int y, int w, int h, int r, int bg) {
        r = Math.min(r, Math.min(w / 2, h / 2));
        if (r <= 1) {
            return;
        }
        Image mask = Shapes.outsideDisc(r, bg);
        g.drawRegion(mask, 0, 0, r, r, TRANS_NONE, x, y, TOP_LEFT);
        g.drawRegion(mask, r, 0, r, r, TRANS_NONE, x + w - r, y, TOP_LEFT);
        g.drawRegion(mask, 0, r, r, r, TRANS_NONE, x, y + h - r, TOP_LEFT);
        g.drawRegion(mask, r, r, r, r, TRANS_NONE, x + w - r, y + h - r, TOP_LEFT);
    }

    static void icon(Graphics g, int kind, int x, int y, int s, int color) {
        if (s > 0) {
            g.drawImage(Shapes.icon(kind, s, color), x, y, TOP_LEFT);
        }
    }

    /** Logo nut phat YouTube: khung bo goc, tam giac khoet trong roi to mau mark. */
    static void logo(Graphics g, int x, int y, int h, int frame, int mark) {
        g.drawImage(Shapes.logo(Shapes.LOGO_FRAME, h, frame), x, y, TOP_LEFT);
        g.drawImage(Shapes.logo(Shapes.LOGO_MARK, h, mark), x, y, TOP_LEFT);
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
