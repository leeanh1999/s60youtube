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
    /** true: phat trong app bang MMAPI; false: mo trinh phat cua may. */
    public static boolean inApp = false;
    /** Co chu: 0 nho, 1 vua, 2 lon — giong muc Co chu cua ban web. */
    public static int textSize = 1;

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
        } catch (RecordStoreException e) {
            // hong thi dung mac dinh
        } catch (IOException e) {
            // ban luu cu thieu truong thi giu phan doc duoc
        } finally {
            close(rs);
        }
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
