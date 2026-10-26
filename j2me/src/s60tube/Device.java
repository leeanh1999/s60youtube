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

    /** Dia chi cho Connector/Manager: tren BlackBerry them duoi ket noi da biet. */
    static String url(String url) {
        return BLACKBERRY && suffix != null ? url + suffix : url;
    }
}
