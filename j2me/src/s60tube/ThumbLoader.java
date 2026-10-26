package s60tube;

import java.util.Hashtable;
import java.util.Vector;

import javax.microedition.lcdui.Image;

/**
 * Tai anh thu nho tung cai mot tren mot luong rieng, roi gan vao the video va
 * ve lai trang. Giu anh goc (192px tu may chu); moi the tu thu nho theo khung
 * cua no luc ve, nen xoay may hay doi co chu khong phai tai lai.
 */
final class ThumbLoader implements Runnable {

    private static final int CACHE_MAX = 40;

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

    void request(Page page, Item item, String id) {
        Image cached = (Image) cache.get(id);
        if (cached != null) {
            item.setThumb(cached);
            return;
        }
        synchronized (queue) {
            queue.addElement(new Object[] {page, item, id});
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
            Page page = (Page) job[0];
            Item item = (Item) job[1];
            String id = (String) job[2];
            try {
                Image image = (Image) cache.get(id);
                if (image == null) {
                    byte[] data = Api.fetch("/thumb/" + id);
                    image = Image.createImage(data, 0, data.length);
                    if (cache.size() >= CACHE_MAX) {
                        cache.clear();
                    }
                    cache.put(id, image);
                }
                item.setThumb(image);
                if (page.isShown()) {
                    page.repaint();
                }
            } catch (Throwable e) {
                // Thieu anh thi khung chi con nen den — khong dang de bao loi.
            }
        }
    }
}
