package s60tube;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Vector;

import javax.microedition.io.Connector;
import javax.microedition.io.HttpConnection;

/**
 * Goi /api/* cua may chu. Moi dong tra ve la mot ban ghi: chu cai dau cho biet
 * loai, cac truong cach nhau bang TAB (xem apiField trong server.js).
 */
public final class Api {

    /** Ten may kieu MIDP de may chu coi la may cu (chi luong gop san). */
    private static final String UA = "S60Tube/1.0 Profile/MIDP-2.1 Configuration/CLDC-1.1";

    private Api() {
    }

    /** Tra ve cac dong da tach truong; dong[0] la chu cai loai. */
    public static Vector get(String path) throws IOException {
        return parse(new String(fetch(path), "UTF-8"));
    }

    /** May chu tra loi ma loi: duong mang van tot, khong thu duong khac nua. */
    static final class HttpError extends IOException {
        HttpError(String message) {
            super(message);
        }
    }

    public static byte[] fetch(String path) throws IOException {
        String url = Settings.server + path;
        if (!Device.BLACKBERRY) {
            return fetchUrl(url);
        }
        if (Device.suffix != null) {
            try {
                return fetchUrl(url + Device.suffix);
            } catch (HttpError e) {
                throw e;
            } catch (IOException e) {
                // Vd. vua tat Wi-Fi: do lai tu dau.
                Device.suffix = null;
            }
        }
        IOException last = null;
        for (int i = 0; i < Device.SUFFIXES.length; i++) {
            try {
                byte[] body = fetchUrl(url + Device.SUFFIXES[i]);
                Device.suffix = Device.SUFFIXES[i];
                return body;
            } catch (HttpError e) {
                Device.suffix = Device.SUFFIXES[i];
                throw e;
            } catch (IOException e) {
                last = e;
            }
        }
        throw last;
    }

    private static byte[] fetchUrl(String url) throws IOException {
        HttpConnection conn = null;
        InputStream in = null;
        try {
            conn = (HttpConnection) Connector.open(url);
            conn.setRequestMethod(HttpConnection.GET);
            conn.setRequestProperty("User-Agent", UA);
            if (Settings.device.length() > 0) {
                conn.setRequestProperty("Cookie", "did=" + Settings.device);
            }
            int code = conn.getResponseCode();
            in = conn.openInputStream();
            byte[] body = readAll(in, (int) conn.getLength());
            // Loi cua /api van co dong 'E' de hien; loi khac (proxy, 404) thi bao ma.
            if (code >= 400 && (body.length == 0 || body[0] != 'E')) {
                throw new HttpError("HTTP " + code);
            }
            return body;
        } finally {
            if (in != null) {
                try {
                    in.close();
                } catch (IOException ignored) {
                }
            }
            if (conn != null) {
                try {
                    conn.close();
                } catch (IOException ignored) {
                }
            }
        }
    }

    private static byte[] readAll(InputStream in, int length) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(length > 0 ? length : 4096);
        byte[] buf = new byte[2048];
        int n;
        while ((n = in.read(buf)) > 0) {
            out.write(buf, 0, n);
        }
        return out.toByteArray();
    }

    static Vector parse(String text) {
        Vector rows = new Vector();
        int start = 0;
        while (start < text.length()) {
            int end = text.indexOf('\n', start);
            if (end < 0) {
                end = text.length();
            }
            if (end > start) {
                rows.addElement(splitLine(text.substring(start, end)));
            }
            start = end + 1;
        }
        return rows;
    }

    private static String[] splitLine(String line) {
        Vector parts = new Vector();
        int start = 0;
        while (true) {
            int tab = line.indexOf('\t', start);
            if (tab < 0) {
                parts.addElement(unescape(line.substring(start)));
                break;
            }
            parts.addElement(unescape(line.substring(start, tab)));
            start = tab + 1;
        }
        String[] result = new String[parts.size()];
        parts.copyInto(result);
        return result;
    }

    private static String unescape(String value) {
        if (value.indexOf('\\') < 0) {
            return value;
        }
        StringBuffer out = new StringBuffer(value.length());
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '\\' && i + 1 < value.length()) {
                char next = value.charAt(++i);
                out.append(next == 'n' ? '\n' : next == 't' ? '\t' : next);
            } else {
                out.append(c);
            }
        }
        return out.toString();
    }

    /** Truong thu i cua dong, thieu thi tra chuoi rong. */
    public static String field(String[] row, int i) {
        return i < row.length ? row[i] : "";
    }

    /** Dong dau tien co loai nay, khong co thi null. */
    public static String[] first(Vector rows, char tag) {
        for (int i = 0; i < rows.size(); i++) {
            String[] row = (String[]) rows.elementAt(i);
            if (row[0].length() == 1 && row[0].charAt(0) == tag) {
                return row;
            }
        }
        return null;
    }

    public static String encode(String value) {
        byte[] bytes;
        try {
            bytes = value.getBytes("UTF-8");
        } catch (IOException e) {
            bytes = value.getBytes();
        }
        StringBuffer out = new StringBuffer(bytes.length * 3);
        for (int i = 0; i < bytes.length; i++) {
            int b = bytes[i] & 0xff;
            if ((b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9')
                    || b == '-' || b == '_' || b == '.' || b == '~') {
                out.append((char) b);
            } else {
                out.append('%');
                out.append("0123456789ABCDEF".charAt(b >> 4));
                out.append("0123456789ABCDEF".charAt(b & 15));
            }
        }
        return out.toString();
    }
}
