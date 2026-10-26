package s60tube;

/**
 * Khac biet giua cac dong may. BlackBerry (vd. Bold 9900) khong co phim mem:
 * phim Menu chi mo danh sach Command, phim thoat goi Command BACK, va o go chu
 * cua may (TextBox) kho dung — nen app them Command va o tim kiem tu ve.
 *
 * Ket noi HTTP tren BlackBerry phai noi ro di duong nao bang duoi ";..." cuoi
 * dia chi; khong co thi may di qua may chu BES/MDS, may thuong khong co.
 */
final class Device {

    static final boolean BLACKBERRY = detect();

    /** Thu lan luot: Wi-Fi, mang di dong truc tiep, roi mac dinh cua may. */
    static final String[] SUFFIXES = {";interface=wifi", ";deviceside=true", ""};

    /** Duoi da noi duoc lan truoc; null la chua thu. */
    static String suffix;

    private Device() {
    }

    private static boolean detect() {
        String platform = System.getProperty("microedition.platform");
        if (platform != null && (platform.startsWith("BlackBerry") || platform.startsWith("RIM"))) {
            return true;
        }
        try {
            Class.forName("net.rim.device.api.system.DeviceInfo");
            return true;
        } catch (Throwable e) {
            return false;
        }
    }

    // Ma phim mem: Nokia/Sony Ericsson -6/-7, Motorola -21/-22, Siemens 21/22,
    // 105/106; -8 la phim C (xoa) cua Nokia, 27 la Esc cua ban phim QWERTY.
    // BlackBerry khong co phim mem, ma cac ma 21/22/105/106/-8 lai trung chu cai
    // hoac nut giua trackpad — tren do chi Esc (va -6/-7 app tu goi tu Command).
    private static final int[] LEFT = {-6, -21, 21, -202, 105};
    private static final int[] RIGHT = {-7, -22, 22, -203, 106, -8, 27};
    private static final int[] BB_LEFT = {-6};
    private static final int[] BB_RIGHT = {-7, 27};

    /**
     * -1 phim mem trai, 1 phim mem phai (quay lai), 0 khong phai. Phim may coi
     * la OK (game action FIRE) khong bao gio la phim mem.
     */
    static int soft(int key, int gameAction) {
        if (gameAction == javax.microedition.lcdui.Canvas.FIRE) {
            return 0;
        }
        if (isIn(key, BLACKBERRY ? BB_LEFT : LEFT)) {
            return -1;
        }
        return isIn(key, BLACKBERRY ? BB_RIGHT : RIGHT) ? 1 : 0;
    }

    private static boolean isIn(int key, int[] codes) {
        for (int i = 0; i < codes.length; i++) {
            if (codes[i] == key) {
                return true;
            }
        }
        return false;
    }

    /** Dia chi cho Connector/Manager: tren BlackBerry them duoi ket noi da biet. */
    static String url(String url) {
        return BLACKBERRY && suffix != null ? url + suffix : url;
    }
}
