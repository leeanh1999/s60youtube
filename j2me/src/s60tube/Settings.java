package s60tube;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;

import javax.microedition.rms.RecordStore;
import javax.microedition.rms.RecordStoreException;

/** Cai dat cua app, luu trong RMS de giu qua cac lan mo. */
public final class Settings {

    public static final String BUILT_IN_SERVER = "http://s60tube.ddnsfree.com";

    /** Dia chi khi chua tung luu cai dat; file .jad doi duoc qua thuoc tinh S60Tube-Server. */
    public static String defaultServer = BUILT_IN_SERVER;

    private static final String STORE = "s60tube";

    public static String server = BUILT_IN_SERVER;
    /** Ma thiet bi (cookie 'did') may chu phat cho app — ung voi tung may chu. */
    public static String device = "";
    public static boolean thumbs = true;
    /** Khong con dung (trang video co ca hai nut phat); giu de doc dung RMS cu. */
    public static boolean inApp = false;
    /** Co chu: 0 nho, 1 vua, 2 lon — giong muc Co chu cua ban web. */
    public static int textSize = 1;
    /** Am luong da chinh trong app (0-100); -1 la chua chinh, de muc cua may. */
    public static int volume = -1;
    /** Cac lan tim gan day, moi nhat truoc. */
    public static final java.util.Vector history = new java.util.Vector();
    private static final int HISTORY_MAX = 8;

    private Settings() {
    }

    public static void load() {
        RecordStore rs = null;
        server = defaultServer;
        try {
            rs = RecordStore.openRecordStore(STORE, true);
            if (rs.getNumRecords() == 0) {
                return;
            }
            DataInputStream in = new DataInputStream(new ByteArrayInputStream(rs.getRecord(1)));
            server = in.readUTF();
            device = in.readUTF();
            thumbs = in.readBoolean();
            inApp = in.readBoolean();
            textSize = in.readInt();
            volume = in.readInt();
            String saved = in.readUTF();
            history.removeAllElements();
            int start = 0;
            while (start < saved.length()) {
                int nl = saved.indexOf('\n', start);
                int end = nl < 0 ? saved.length() : nl;
                if (end > start) {
                    history.addElement(saved.substring(start, end));
                }
                start = end + 1;
            }
        } catch (RecordStoreException e) {
            // hong thi dung mac dinh
        } catch (IOException e) {
            // ban luu cu thieu truong thi giu phan doc duoc
        } finally {
            close(rs);
        }
    }

    /** Dua lan tim nay len dau lich su (bo ban trung cu). */
    public static void remember(String query) {
        query = query.replace('\n', ' ').trim();
        if (query.length() == 0) {
            return;
        }
        history.removeElement(query);
        history.insertElementAt(query, 0);
        if (history.size() > HISTORY_MAX) {
            history.setSize(HISTORY_MAX);
        }
        save();
    }

    public static void clearHistory() {
        history.removeAllElements();
        save();
    }

    public static void save() {
        RecordStore rs = null;
        try {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            DataOutputStream out = new DataOutputStream(bytes);
            out.writeUTF(server);
            out.writeUTF(device);
            out.writeBoolean(thumbs);
            out.writeBoolean(inApp);
            out.writeInt(textSize);
            out.writeInt(volume);
            StringBuffer saved = new StringBuffer();
            for (int i = 0; i < history.size(); i++) {
                if (i > 0) {
                    saved.append('\n');
                }
                saved.append((String) history.elementAt(i));
            }
            out.writeUTF(saved.toString());
            byte[] data = bytes.toByteArray();
            rs = RecordStore.openRecordStore(STORE, true);
            if (rs.getNumRecords() == 0) {
                rs.addRecord(data, 0, data.length);
            } else {
                rs.setRecord(1, data, 0, data.length);
            }
        } catch (RecordStoreException e) {
            // khong luu duoc thi lan sau hoi lai ma thiet bi
        } catch (IOException e) {
            // ByteArrayOutputStream khong nem
        } finally {
            close(rs);
        }
    }

    /** Bo dau '/' cuoi, them http:// neu thieu. */
    public static String normalize(String url) {
        String value = url.trim();
        if (value.length() == 0) {
            return defaultServer;
        }
        if (value.indexOf("://") < 0) {
            value = "http://" + value;
        }
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        return value;
    }

    private static void close(RecordStore rs) {
        if (rs != null) {
            try {
                rs.closeRecordStore();
            } catch (RecordStoreException ignored) {
            }
        }
    }
}
