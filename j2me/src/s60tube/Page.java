package s60tube;

import java.util.Vector;

import javax.microedition.lcdui.Canvas;
import javax.microedition.lcdui.Command;
import javax.microedition.lcdui.CommandListener;
import javax.microedition.lcdui.Displayable;
import javax.microedition.lcdui.Graphics;

/**
 * Mot man hinh cua app, tu ve het theo kieu ban web: thanh do o tren (.bar),
 * cac khoi xep mot cot o giua, thanh phim mem o duoi (.nav).
 *
 * Moi kich thuoc deu tinh lai tu be ngang that luc ve, nen man hinh nao cung
 * vua: E6 640x480 nam ngang, N8 360x640 dung, may 240x320 cua S60v3, va ca
 * luc xoay may (sizeChanged).
 */
final class Page extends Canvas implements Runnable, CommandListener {

    /** Phim mem (xem Device.soft); Command cua BlackBerry goi lai bang hai ma nay. */
    private static final int LEFT_SOFT = -6;
    private static final int RIGHT_SOFT = -7;
    private static final int KEY_CLEAR = -8;
    private static final int KEY_CENTER = -5;
    /** Ban phim QWERTY (BlackBerry, E6): Enter, Esc, xoa lui. */
    private static final int KEY_ENTER = 10;
    private static final int KEY_RETURN = 13;
    private static final int KEY_ESC = 27;
    private static final int KEY_BACKSPACE = 8;

    // BlackBerry khong co phim mem: phim Menu mo cac Command nay, phim thoat goi BACK.
    private static final Command CMD_MENU = new Command("Menu", Command.SCREEN, 1);
    private static final Command CMD_SEARCH = new Command("Tìm kiếm", Command.SCREEN, 2);
    private static final Command CMD_BACK = new Command("Quay lại", Command.BACK, 1);

    interface Host {
        void select(Page page, Item item);

        void leftSoft(Page page);

        void rightSoft(Page page);

        void searchTap(Page page);

        /** Go mot chu cai khi trang khong co o nhap: mo o tim kiem voi chu do. */
        void typed(Page page, char ch);
    }

    private final Host host;
    String title;
    /** Ten cua trang dung khi tao lai (vd. tai lai trang chinh). */
    String kind = "";
    final Vector items = new Vector();
    private int focus = -1;
    private int scrollY;
    private int contentH;
    private int layoutW = -1;
    private int layoutVersion = -1;

    /** Bieu tuong phim mem phai: mui ten Quay lai, hoac dau X (Thoat) o trang chinh. */
    int rightIcon = Ui.ICON_BACK;

    // Lop phu: menu, hop cho, hop thong bao.
    private Item[] menu;
    private int menuFocus;
    private String busy;
    private int busyPhase;
    private String toast;
    private int toastTone;
    private String[] toastLines;

    // Cham va keo.
    private int pressY;
    private int pressScroll;
    private boolean dragged;

    Page(Host host, String title) {
        this.host = host;
        this.title = title;
        setFullScreenMode(true);
        if (Device.BLACKBERRY) {
            addCommand(CMD_MENU);
            addCommand(CMD_SEARCH);
            addCommand(CMD_BACK);
            setCommandListener(this);
        }
    }

    public void commandAction(Command c, Displayable d) {
        if (c == CMD_SEARCH) {
            if (busy == null) {
                host.searchTap(this);
            }
            return;
        }
        handleKey(c == CMD_MENU ? LEFT_SOFT : RIGHT_SOFT, false);
    }

    // ---------- noi dung ----------

    Item add(Item item) {
        items.addElement(item);
        layoutW = -1;
        if (focus < 0 && item.focusable()) {
            focus = items.size() - 1;
        }
        return item;
    }

    void clear() {
        items.removeAllElements();
        focus = -1;
        scrollY = 0;
        layoutW = -1;
    }

    Item focused() {
        return focus >= 0 && focus < items.size() ? (Item) items.elementAt(focus) : null;
    }

    /** Doi chu trong khoi nao do (vd. tien do chuyen ma) roi ve lai. */
    void changed() {
        layoutW = -1;
        repaint();
    }

    // ---------- lop phu ----------

    void setBusy(String text) {
        boolean start = busy == null && text != null;
        busy = text;
        toast = null;
        repaint();
        if (start) {
            new Thread(this).start();
        }
    }

    boolean isBusy() {
        return busy != null;
    }

    void showToast(String text, int tone) {
        busy = null;
        toast = text;
        toastTone = tone;
        toastLines = null;
        repaint();
    }

    void openMenu(Item[] entries) {
        menu = entries;
        menuFocus = 0;
        repaint();
    }

    /** Hoat hinh cua hop cho — chay chung nao con dang cho. */
    public void run() {
        while (busy != null) {
            busyPhase++;
            if (isShown()) {
                repaint();
            }
            try {
                Thread.sleep(120);
            } catch (InterruptedException e) {
                return;
            }
        }
    }

    // ---------- bo cuc ----------

    private int barH() {
        return Ui.bold.getHeight() + Ui.pad * 2;
    }

    private int navH() {
        return navIcon() + Ui.pad * 2;
    }

    private int viewH() {
        return getHeight() - barH() - navH();
    }

    private void layout() {
        Ui.setup();
        int w = getWidth();
        if (w == layoutW && layoutVersion == Ui.version) {
            return;
        }
        layoutW = w;
        layoutVersion = Ui.version;
        int inner = w - Ui.gap * 2;
        int y = Ui.gap;
        for (int i = 0; i < items.size(); i++) {
            Item item = (Item) items.elementAt(i);
            item.invalidate();
            // Tieu de muc (h2) cach khoi tren xa hon, giong margin-top 14px ben web.
            if (item.type == Item.HEAD && i > 0) {
                y += Ui.gap;
            }
            item.measure(inner);
            item.y = y;
            y += item.h + Ui.gap;
        }
        contentH = y;
        clampScroll();
        Item f = focused();
        if (f != null && visible(f)) {
            reveal(f);
        } else if (f != null) {
            // Khoi bam duoc dau tien nam duoi man hinh — dung de phim OK mo cai khong thay.
            scrollBy(0);
        }
    }

    protected void sizeChanged(int w, int h) {
        layoutW = -1;
        repaint();
    }

    private void clampScroll() {
        int max = Math.max(0, contentH - viewH());
        if (scrollY > max) {
            scrollY = max;
        }
        if (scrollY < 0) {
            scrollY = 0;
        }
    }

    /** Cuon vua du de thay ca khoi (khoi cao hon man hinh thi thay phan dau). */
    private void reveal(Item item) {
        int view = viewH();
        if (item.y + item.h + Ui.gap > scrollY + view) {
            scrollY = item.y + item.h + Ui.gap - view;
        }
        if (item.y - Ui.gap < scrollY || item.h > view) {
            scrollY = item.y - Ui.gap;
        }
        clampScroll();
    }

    private boolean visible(Item item) {
        return item.y + item.h > scrollY && item.y < scrollY + viewH();
    }

    // ---------- ve ----------

    protected void paint(Graphics g) {
        layout();
        int w = getWidth();
        int h = getHeight();
        int top = barH();
        int view = viewH();

        g.setColor(Ui.BG);
        g.fillRect(0, 0, w, h);

        g.setClip(0, top, w, view);
        int inner = w - Ui.gap * 2;
        for (int i = 0; i < items.size(); i++) {
            Item item = (Item) items.elementAt(i);
            if (item.y + item.h < scrollY || item.y > scrollY + view) {
                continue;
            }
            item.paint(g, Ui.gap, top + item.y - scrollY, inner, i == focus && menu == null);
        }
        // Thanh cuon mong ben phai khi trang dai hon man hinh.
        if (contentH > view) {
            int bar = Math.max(Ui.em, view * view / contentH);
            int by = top + (view - bar) * scrollY / Math.max(1, contentH - view);
            g.setColor(Ui.LINE_SOFT);
            g.fillRect(w - 3, by, 2, bar);
        }
        g.setClip(0, 0, w, h);

        paintBar(g, w);
        paintNav(g, w, h);

        if (menu != null) {
            paintMenu(g, w, h);
        }
        if (busy != null) {
            paintBusy(g, w, h);
        } else if (toast != null) {
            paintToast(g, w, h);
        }
    }

    private void paintBar(Graphics g, int w) {
        int bh = barH();
        g.setColor(Ui.RED);
        g.fillRect(0, 0, w, bh);
        g.setColor(Ui.RED_DARK);
        g.fillRect(0, bh - 2, w, 2);

        int p = Ui.pad;
        int lh = Ui.bold.getHeight() * 3 / 4;
        int x = p;
        Ui.logo(g, x, (bh - 2 - lh) / 2, lh, Ui.WHITE, Ui.RED);
        x += Ui.logoWidth(lh) + p;

        int s = Ui.bold.getHeight() * 3 / 4;
        int searchX = w - p - s;
        Ui.icon(g, Ui.ICON_SEARCH, searchX, (bh - 2 - s) / 2, s, Ui.WHITE);

        g.setFont(Ui.bold);
        g.setColor(Ui.WHITE);
        g.drawString(Ui.ellipsis(title, Ui.bold, searchX - p - x), x, (bh - 2 - Ui.bold.getHeight()) / 2,
                Graphics.TOP | Graphics.LEFT);
    }

    private void paintNav(Graphics g, int w, int h) {
        int nh = navH();
        int y = h - nh;
        g.setColor(Ui.NAV);
        g.fillRect(0, y, w, nh);
        g.setColor(Ui.NAV_LINE);
        g.drawLine(0, y, w, y);
        int s = navIcon();
        int iy = y + (nh - s) / 2;
        // Ba o nhu .nav ben web, cung la ba vung cham: trai, giua, phai.
        g.setColor(0xdee3e8);
        g.drawLine(w / 3, y + Ui.pad / 2, w / 3, h - Ui.pad / 2);
        g.drawLine(w * 2 / 3, y + Ui.pad / 2, w * 2 / 3, h - Ui.pad / 2);

        // Thanh duoi chi con bieu tuong, dat dung cho ba phim: trai, giua, phai.
        int left = busy != null || toast != null ? 0 : menu != null ? Ui.ICON_CHECK : Ui.ICON_MENU;
        int right = toast != null ? Ui.ICON_CHECK : busy != null || menu != null ? Ui.ICON_EXIT : rightIcon;
        boolean center = busy == null && toast == null && menu == null && focused() != null;

        if (left != 0) {
            Ui.icon(g, left, (w / 3 - s) / 2, iy, s, Ui.NAV_TEXT);
        }
        Ui.icon(g, right, w * 2 / 3 + (w / 3 - s) / 2, iy, s, Ui.NAV_TEXT);
        if (center) {
            Ui.icon(g, Ui.ICON_CHECK, (w - s) / 2, iy, s, Ui.RED);
        }
    }

    private static int navIcon() {
        return Math.max(12, Ui.bold.getHeight() * 4 / 5);
    }

    private void paintMenu(Graphics g, int w, int h) {
        int p = Ui.pad;
        int rowH = Ui.bold.getHeight() + p * 2;
        int mw = Math.min(w - Ui.gap * 2, Math.max(w / 2, Ui.em * 10));
        int mh = rowH * menu.length + 2;
        int x = Ui.gap;
        int y = h - navH() - mh - Ui.gap;
        Ui.box(g, x, y, mw, mh, Ui.CARD, Ui.NAV_LINE);
        for (int i = 0; i < menu.length; i++) {
            int ry = y + 1 + i * rowH;
            if (i == menuFocus) {
                g.setColor(Ui.FOCUS);
                g.fillRect(x + 1, ry, mw - 2, rowH);
                g.setColor(Ui.RED);
                g.fillRect(x + 1, ry, 3, rowH);
            } else if (i > 0) {
                g.setColor(0xe6eaee);
                g.drawLine(x + p, ry, x + mw - p, ry);
            }
            int s = Ui.bold.getHeight() * 3 / 4;
            Ui.icon(g, menu[i].icon, x + p + 2, ry + (rowH - s) / 2, s, Ui.RED);
            g.setFont(Ui.bold);
            g.setColor(Ui.TEXT);
            g.drawString(Ui.ellipsis(menu[i].title, Ui.bold, mw - s - p * 3), x + p * 2 + s + 2,
                    ry + p, Graphics.TOP | Graphics.LEFT);
        }
    }

    private void paintBusy(Graphics g, int w, int h) {
        int p = Ui.pad;
        int bw = Math.min(w - Ui.gap * 4, Ui.em * 14);
        String[] lines = Ui.wrap(busy, Ui.font, bw - p * 2, 3);
        int track = Math.max(8, Ui.em / 2);
        int bh = lines.length * Ui.font.getHeight() + track + p * 3;
        int x = (w - bw) / 2;
        int y = (h - bh) / 2;
        shadow(g, x, y, bw, bh);
        Ui.box(g, x, y, bw, bh, Ui.CARD, Ui.NAV_LINE);
        Ui.lines(g, lines, Ui.font, Ui.TEXT, x + p, y + p);
        int ty = y + p * 2 + lines.length * Ui.font.getHeight();
        int tw = bw - p * 2;
        Ui.round(g, x + p, ty, tw, track, track / 2, 0xe6eaee);
        // Mot doan do chay qua lai trong ranh — thay cho Gauge cua LCDUI.
        int seg = tw / 3;
        int span = tw - seg;
        int pos = busyPhase % (span * 2 / Math.max(1, Ui.em / 2) + 1) * Math.max(1, Ui.em / 2);
        if (pos > span) {
            pos = span * 2 - pos;
        }
        Ui.round(g, x + p + Math.max(0, pos), ty, seg, track, track / 2, Ui.RED);
    }

    /** Bong do duoi hop noi — de hop tach khoi trang ben duoi. */
    private static void shadow(Graphics g, int x, int y, int w, int h) {
        Ui.round(g, x + 2, y + 3, w, h, Ui.radius, 0x9aa1a8);
        Ui.round(g, x + 1, y + 2, w, h, Ui.radius, 0x5c636a);
    }

    private void paintToast(Graphics g, int w, int h) {
        int p = Ui.pad;
        int bw = Math.min(w - Ui.gap * 4, Ui.em * 16);
        if (toastLines == null) {
            toastLines = Ui.wrap(toast, Ui.small, bw - p * 2, Math.max(3, (h - barH() - navH()) / Ui.small.getHeight() - 2));
        }
        int bh = toastLines.length * Ui.small.getHeight() + p * 2;
        int x = (w - bw) / 2;
        int y = Math.max(barH() + Ui.gap, (h - bh) / 2);
        int fill = toastTone == Item.TONE_ERR ? Ui.ERR_BG : toastTone == Item.TONE_OK ? Ui.OK_BG : Ui.WARN_BG;
        int line = toastTone == Item.TONE_ERR ? Ui.RED : toastTone == Item.TONE_OK ? Ui.OK_LINE : Ui.WARN_LINE;
        shadow(g, x, y, bw, bh);
        Ui.box(g, x - 1, y - 1, bw + 2, bh + 2, line, line);
        Ui.box(g, x, y, bw, bh, fill, line);
        Ui.lines(g, toastLines, Ui.small, Ui.TEXT, x + p, y + p);
    }

    // ---------- phim ----------


    private int action(int key) {
        try {
            return getGameAction(key);
        } catch (Exception e) {
            return 0;
        }
    }

    protected void keyPressed(int key) {
        handleKey(key, false);
    }

    protected void keyRepeated(int key) {
        handleKey(key, true);
    }

    private void handleKey(int key, boolean repeat) {
        // Phim co the den truoc lan ve dau tien — bo cuc phai co truoc khi tinh o chon.
        layout();
        int act = key == LEFT_SOFT || key == RIGHT_SOFT ? 0 : action(key);
        int soft = Device.soft(key, act);
        boolean left = soft < 0;
        boolean right = soft > 0;
        if (left || right) {
            act = 0;
        }
        boolean fire = key == KEY_CENTER || key == KEY_ENTER || key == KEY_RETURN || act == FIRE
                || (key == KEY_NUM5 && menu == null);

        if (busy != null) {
            if (right && !repeat) {
                host.rightSoft(this);
            }
            return;
        }
        if (toast != null) {
            if (!repeat && (left || right || fire)) {
                toast = null;
                repaint();
            }
            return;
        }
        if (menu != null) {
            if (act == UP || key == KEY_NUM2) {
                menuFocus = (menuFocus + menu.length - 1) % menu.length;
            } else if (act == DOWN || key == KEY_NUM8) {
                menuFocus = (menuFocus + 1) % menu.length;
            } else if (!repeat && (fire || left)) {
                pickMenu(menuFocus);
                return;
            } else if (!repeat && right) {
                menu = null;
            }
            repaint();
            return;
        }
        if (typing(key, act)) {
            repaint();
            return;
        }

        if (act == UP || key == KEY_NUM2) {
            move(-1);
        } else if (act == DOWN || key == KEY_NUM8) {
            move(1);
        } else if (act == LEFT || key == KEY_NUM4) {
            page(-1);
        } else if (act == RIGHT || key == KEY_NUM6) {
            page(1);
        } else if (repeat) {
            return;
        } else if (fire) {
            Item item = focused();
            if (item != null) {
                host.select(this, item);
            }
        } else if (left) {
            host.leftSoft(this);
        } else if (right) {
            host.rightSoft(this);
        } else if (key == KEY_STAR) {
            host.searchTap(this);
        }
        repaint();
    }

    /**
     * Go chu tu ban phim QWERTY. Trang co o nhap (Item.INPUT) thi chu vao thang
     * o do; trang khac thi go chu cai la mo o tim kiem. So, '*' va '#' van la
     * phim dieu khien cua may ban phim so.
     */
    private boolean typing(int key, int act) {
        Item input = null;
        int at = -1;
        for (int i = 0; i < items.size(); i++) {
            Item item = (Item) items.elementAt(i);
            if (item.type == Item.INPUT) {
                input = item;
                at = i;
                break;
            }
        }
        if (input != null) {
            if (key == KEY_BACKSPACE || (key == KEY_CLEAR && !Device.BLACKBERRY)) {
                if (input.title.length() == 0) {
                    return false;
                }
                input.title = input.title.substring(0, input.title.length() - 1);
            } else if (key >= 32 && key != 127) {
                // Ke ca khi may coi phim do la OK (BlackBerry gan FIRE cho phim cach):
                // dang go thi no la chu. Tim kiem bang Enter hoac nut Tim.
                if (input.title.length() >= 200) {
                    return true;
                }
                input.title += (char) key;
            } else {
                return false;
            }
            focus = at;
            reveal(input);
            return true;
        }
        if (act == 0 && key < 65536 && key > 32) {
            char ch = (char) key;
            if (Character.isLowerCase(ch) || Character.isUpperCase(ch)) {
                host.typed(this, ch);
                return true;
            }
        }
        return false;
    }

    private void pickMenu(int index) {
        Item entry = menu[index];
        menu = null;
        repaint();
        host.select(this, entry);
    }

    /**
     * Phim len/xuong: sang khoi bam duoc ke ben neu no da lo ra tren man hinh;
     * con khong (giua chung la doan mo ta dai) thi cuon mot doan truoc da.
     */
    private void move(int dir) {
        int view = viewH();
        Item cur = focused();
        if (cur != null && visible(cur)) {
            if (dir > 0 && cur.y + cur.h > scrollY + view) {
                scrollBy(view * 2 / 3);
                return;
            }
            if (dir < 0 && cur.y < scrollY) {
                scrollBy(-view * 2 / 3);
                return;
            }
        }
        // O chon dang khuat (vua keo bang tay) thi tim tu khoi dau tien con thay.
        int i = cur != null && visible(cur) ? focus + dir : firstVisible(dir);
        for (; i >= 0 && i < items.size(); i += dir) {
            Item item = (Item) items.elementAt(i);
            if (!item.focusable()) {
                continue;
            }
            boolean near = dir > 0 ? item.y < scrollY + view + view / 3 : item.y + item.h > scrollY - view / 3;
            if (near) {
                focus = i;
                reveal(item);
                return;
            }
            break;
        }
        scrollBy(dir * view * 2 / 3);
    }

    /** Khoi dau tien (theo huong) dang nam trong man hinh, de bat dau tim tu do. */
    private int firstVisible(int dir) {
        if (dir > 0) {
            for (int i = 0; i < items.size(); i++) {
                if (visible((Item) items.elementAt(i))) {
                    return i;
                }
            }
            return 0;
        }
        for (int i = items.size() - 1; i >= 0; i--) {
            if (visible((Item) items.elementAt(i))) {
                return i;
            }
        }
        return items.size() - 1;
    }

    private void page(int dir) {
        scrollBy(dir * (viewH() - Ui.em));
    }

    /** Cuon roi dat lai o chon vao khoi bam duoc dau tien con thay. */
    private void scrollBy(int dy) {
        scrollY += dy;
        clampScroll();
        Item cur = focused();
        if (cur != null && visible(cur)) {
            return;
        }
        focus = -1;
        for (int i = 0; i < items.size(); i++) {
            Item item = (Item) items.elementAt(i);
            if (item.focusable() && item.y >= scrollY && item.y + item.h <= scrollY + viewH()) {
                focus = i;
                return;
            }
        }
    }

    // ---------- cham ----------

    protected void pointerPressed(int x, int y) {
        pressY = y;
        pressScroll = scrollY;
        dragged = false;
    }

    protected void pointerDragged(int x, int y) {
        if (menu != null || busy != null || toast != null) {
            return;
        }
        if (!dragged && Math.abs(y - pressY) < Math.max(6, Ui.em / 2)) {
            return;
        }
        dragged = true;
        scrollY = pressScroll - (y - pressY);
        clampScroll();
        repaint();
    }

    protected void pointerReleased(int x, int y) {
        if (dragged) {
            dragged = false;
            Item cur = focused();
            if (cur != null && !visible(cur)) {
                scrollBy(0);
            }
            return;
        }
        tap(x, y);
    }

    private void tap(int x, int y) {
        layout();
        int w = getWidth();
        int h = getHeight();
        boolean onNav = y >= h - navH();
        boolean navLeft = onNav && x < w / 3;
        boolean navRight = onNav && x > w * 2 / 3;

        if (busy != null) {
            if (navRight) {
                host.rightSoft(this);
            }
            return;
        }
        if (toast != null) {
            toast = null;
            repaint();
            return;
        }
        if (menu != null) {
            int rowH = Ui.bold.getHeight() + Ui.pad * 2;
            int mh = rowH * menu.length + 2;
            int my = h - navH() - mh - Ui.gap;
            int mw = Math.min(w - Ui.gap * 2, Math.max(w / 2, Ui.em * 10));
            if (x >= Ui.gap && x <= Ui.gap + mw && y >= my && y < my + mh - 2) {
                pickMenu(Math.min(menu.length - 1, (y - my - 1) / rowH));
            } else {
                menu = null;
                repaint();
            }
            return;
        }
        if (y < barH()) {
            if (x > w - barH() * 3 / 2) {
                host.searchTap(this);
            }
            return;
        }
        if (onNav) {
            if (navLeft) {
                host.leftSoft(this);
            } else if (navRight) {
                host.rightSoft(this);
            } else if (focused() != null) {
                host.select(this, focused());
            }
            return;
        }
        int cy = y - barH() + scrollY;
        for (int i = 0; i < items.size(); i++) {
            Item item = (Item) items.elementAt(i);
            if (cy >= item.y && cy < item.y + item.h) {
                if (item.focusable()) {
                    focus = i;
                    repaint();
                    host.select(this, item);
                }
                return;
            }
        }
    }
}
