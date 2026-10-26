package s60tube;

import java.util.Hashtable;
import java.util.Vector;

import javax.microedition.lcdui.Image;
import javax.microedition.lcdui.List;

/**
 * Tai anh thu nho tung cai mot tren mot luong rieng, roi gan vao dong cua List.
 * Anh may chu tra ve rong 192px; thu nho lai con 96px cho vua dong danh sach.
 */
final class ThumbLoader implements Runnable {

    private static final int WIDTH = 96;
    private static final int CACHE_MAX = 60;

    private final Vector queue = new Vector();
    private final Hashtable cache = new Hashtable();
    private volatile boolean running = true;

    void start() {
        new Thread(this).start();
    }

    void stop() {
        running = false;
        synchronized (queue) {
            queue.notify();
        }
    }

    void request(List list, int index, String id) {
        Image cached = (Image) cache.get(id);
        if (cached != null) {
            list.set(index, list.getString(index), cached);
            return;
        }
        synchronized (queue) {
            queue.addElement(new Object[] {list, new Integer(index), id});
            queue.notify();
        }
    }

    public void run() {
        while (running) {
            Object[] job;
            synchronized (queue) {
                while (running && queue.isEmpty()) {
                    try {
                        queue.wait();
                    } catch (InterruptedException e) {
                        return;
                    }
                }
                if (!running) {
                    return;
                }
                job = (Object[]) queue.elementAt(0);
                queue.removeElementAt(0);
            }
            List list = (List) job[0];
            int index = ((Integer) job[1]).intValue();
            String id = (String) job[2];
            try {
                Image image = (Image) cache.get(id);
                if (image == null) {
                    byte[] data = Api.fetch("/thumb/" + id);
                    image = shrink(Image.createImage(data, 0, data.length));
                    if (cache.size() >= CACHE_MAX) {
                        cache.clear();
                    }
                    cache.put(id, image);
                }
                if (index < list.size()) {
                    list.set(index, list.getString(index), image);
                }
            } catch (Throwable e) {
                // Thieu anh thi dong do chi con chu — khong dang de bao loi.
            }
        }
    }

    /** Thu nho kieu lay diem gan nhat — MIDP 2.0 khong co ham co anh. */
    private static Image shrink(Image src) {
        int w = src.getWidth();
        int h = src.getHeight();
        if (w <= WIDTH) {
            return src;
        }
        int nh = h * WIDTH / w;
        int[] in = new int[w * h];
        src.getRGB(in, 0, w, 0, 0, w, h);
        int[] out = new int[WIDTH * nh];
        for (int y = 0; y < nh; y++) {
            int row = (y * h / nh) * w;
            for (int x = 0; x < WIDTH; x++) {
                out[y * WIDTH + x] = in[row + x * w / WIDTH];
            }
        }
        return Image.createRGBImage(out, WIDTH, nh, false);
    }
}
