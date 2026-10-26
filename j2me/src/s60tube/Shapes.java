package s60tube;

import java.util.Hashtable;

import javax.microedition.lcdui.Image;

/**
 * Bieu tuong va goc bo duoc dung thanh anh co do trong suot, lay mau 4x4 lan
 * moi diem cho mep muot. fillTriangle/fillArc cua LCDUI khong khu rang cua,
 * nen tren man E6 (325 diem moi inch) mep nao xien cung ro hat.
 *
 * Moi hinh tinh mot lan cho moi co + mau roi giu lai.
 */
final class Shapes {

    static final int DISC = 100;
    static final int LOGO_FRAME = 101;
    static final int LOGO_MARK = 102;
    /** Phan ngoai hinh tron — phu len goc anh cho anh co goc bo. */
    static final int OUTSIDE_DISC = 103;

    private static final int SS = 4;
    private static final Hashtable CACHE = new Hashtable();

    private Shapes() {
    }

    static Image icon(int kind, int size, int color) {
        return get(kind, size, size, color);
    }

    /** Hinh tron duong kinh 2r — cat tu tu goc ra lam goc bo. */
    static Image disc(int r, int color) {
        return get(DISC, r * 2, r * 2, color);
    }

    static Image outsideDisc(int r, int color) {
        return get(OUTSIDE_DISC, r * 2, r * 2, color);
    }

    static Image logo(int kind, int h, int color) {
        return get(kind, Ui.logoWidth(h), h, color);
    }

    private static Image get(int kind, int w, int h, int color) {
        String key = kind + "/" + w + "/" + h + "/" + color;
        Image image = (Image) CACHE.get(key);
        if (image == null) {
            if (CACHE.size() > 200) {
                CACHE.clear();
            }
            image = render(kind, w, h, color & 0xffffff);
            CACHE.put(key, image);
        }
        return image;
    }

    private static Image render(int kind, int w, int h, int rgb) {
        int[] px = new int[w * h];
        float unit = h;
        int samples = SS * SS;
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int hits = 0;
                for (int sy = 0; sy < SS; sy++) {
                    float v = (y + (sy + 0.5f) / SS) / unit;
                    for (int sx = 0; sx < SS; sx++) {
                        float u = (x + (sx + 0.5f) / SS) / unit;
                        if (inside(kind, u, v)) {
                            hits++;
                        }
                    }
                }
                if (hits > 0) {
                    px[y * w + x] = ((hits * 255 / samples) << 24) | rgb;
                }
            }
        }
        return Image.createRGBImage(px, w, h, true);
    }

    // ---------- hinh hoc trong o vuong don vi (v tu 0 den 1, u theo ty le) ----------

    private static boolean circle(float u, float v, float cx, float cy, float r) {
        float dx = u - cx;
        float dy = v - cy;
        return dx * dx + dy * dy <= r * r;
    }

    private static boolean rect(float u, float v, float x0, float y0, float x1, float y1) {
        return u >= x0 && u <= x1 && v >= y0 && v <= y1;
    }

    private static boolean tri(float u, float v, float ax, float ay, float bx, float by, float cx, float cy) {
        float d1 = (u - bx) * (ay - by) - (ax - bx) * (v - by);
        float d2 = (u - cx) * (by - cy) - (bx - cx) * (v - cy);
        float d3 = (u - ax) * (cy - ay) - (cx - ax) * (v - ay);
        boolean neg = d1 < 0 || d2 < 0 || d3 < 0;
        boolean pos = d1 > 0 || d2 > 0 || d3 > 0;
        return !(neg && pos);
    }

    /** Doan thang day w, hai dau bo tron. */
    private static boolean capsule(float u, float v, float x0, float y0, float x1, float y1, float w) {
        float dx = x1 - x0;
        float dy = y1 - y0;
        float t = ((u - x0) * dx + (v - y0) * dy) / (dx * dx + dy * dy);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        float px = x0 + t * dx - u;
        float py = y0 + t * dy - v;
        return px * px + py * py <= w * w / 4;
    }

    /** Khung bo goc cua logo: rong 1.43, cao 1, ban kinh goc 0.225. */
    private static boolean logoFrame(float u, float v) {
        float w = 1.43f;
        float r = 0.225f;
        if (u < 0 || u > w || v < 0 || v > 1) {
            return false;
        }
        float cx = u < r ? r : u > w - r ? w - r : u;
        float cy = v < r ? r : v > 1 - r ? 1 - r : v;
        return circle(u, v, cx, cy, r);
    }

    private static boolean logoMark(float u, float v) {
        float tw = 0.435f;
        float cx = 0.715f + tw / 12;
        return tri(u, v, cx - tw / 2, 0.25f, cx - tw / 2, 0.75f, cx + tw / 2, 0.5f);
    }

    private static final float[] COS8 = {1f, 0.7071f, 0f, -0.7071f, -1f, -0.7071f, 0f, 0.7071f};
    private static final float[] SIN8 = {0f, 0.7071f, 1f, 0.7071f, 0f, -0.7071f, -1f, -0.7071f};

    private static boolean inside(int kind, float u, float v) {
        switch (kind) {
            case DISC:
                return circle(u, v, 0.5f, 0.5f, 0.5f);
            case OUTSIDE_DISC:
                return !circle(u, v, 0.5f, 0.5f, 0.5f);
            case LOGO_FRAME:
                return logoFrame(u, v) && !logoMark(u, v);
            case LOGO_MARK:
                return logoMark(u, v);
            case Ui.ICON_PLAY:
                return tri(u, v, 0.16f, 0.06f, 0.16f, 0.94f, 0.94f, 0.5f);
            case Ui.ICON_NEXT:
                return tri(u, v, 0.26f, 0.12f, 0.26f, 0.88f, 0.86f, 0.5f);
            case Ui.ICON_NOTE:
                return circle(u, v, 0.33f, 0.76f, 0.2f)
                        || rect(u, v, 0.43f, 0.1f, 0.53f, 0.76f)
                        || tri(u, v, 0.48f, 0.08f, 0.9f, 0.3f, 0.48f, 0.44f);
            case Ui.ICON_GEAR: {
                float dx = u - 0.5f;
                float dy = v - 0.5f;
                float d2 = dx * dx + dy * dy;
                if (d2 < 0.15f * 0.15f) {
                    return false;
                }
                if (d2 <= 0.35f * 0.35f) {
                    return true;
                }
                for (int k = 0; k < 8; k++) {
                    float along = dx * COS8[k] + dy * SIN8[k];
                    float across = -dx * SIN8[k] + dy * COS8[k];
                    if (along > 0.2f && along < 0.49f && across > -0.085f && across < 0.085f) {
                        return true;
                    }
                }
                return false;
            }
            case Ui.ICON_INFO:
                return circle(u, v, 0.5f, 0.5f, 0.48f)
                        && !rect(u, v, 0.43f, 0.42f, 0.57f, 0.78f)
                        && !circle(u, v, 0.5f, 0.27f, 0.08f);
            case Ui.ICON_SEARCH: {
                boolean ring = circle(u, v, 0.4f, 0.4f, 0.33f) && !circle(u, v, 0.4f, 0.4f, 0.21f);
                return ring || capsule(u, v, 0.64f, 0.64f, 0.9f, 0.9f, 0.17f);
            }
            case Ui.ICON_HOME:
                return tri(u, v, 0.02f, 0.5f, 0.5f, 0.05f, 0.98f, 0.5f)
                        || (rect(u, v, 0.16f, 0.45f, 0.84f, 0.95f) && !rect(u, v, 0.4f, 0.62f, 0.6f, 0.95f));
            case Ui.ICON_USER: {
                boolean head = circle(u, v, 0.5f, 0.28f, 0.21f);
                float dx = (u - 0.5f) / 0.44f;
                float dy = (v - 1.02f) / 0.48f;
                return head || (dx * dx + dy * dy <= 1f && v <= 0.97f);
            }
            case Ui.ICON_EXIT:
                return capsule(u, v, 0.14f, 0.14f, 0.86f, 0.86f, 0.17f)
                        || capsule(u, v, 0.86f, 0.14f, 0.14f, 0.86f, 0.17f);
            case Ui.ICON_MENU:
                return capsule(u, v, 0.14f, 0.22f, 0.86f, 0.22f, 0.14f)
                        || capsule(u, v, 0.14f, 0.5f, 0.86f, 0.5f, 0.14f)
                        || capsule(u, v, 0.14f, 0.78f, 0.86f, 0.78f, 0.14f);
            case Ui.ICON_BACK:
                return capsule(u, v, 0.16f, 0.5f, 0.88f, 0.5f, 0.15f)
                        || capsule(u, v, 0.16f, 0.5f, 0.48f, 0.18f, 0.15f)
                        || capsule(u, v, 0.16f, 0.5f, 0.48f, 0.82f, 0.15f);
            case Ui.ICON_CHECK:
                return capsule(u, v, 0.12f, 0.52f, 0.4f, 0.8f, 0.16f)
                        || capsule(u, v, 0.4f, 0.8f, 0.9f, 0.22f, 0.16f);
            case Ui.ICON_PAUSE:
                return rect(u, v, 0.18f, 0.1f, 0.4f, 0.9f) || rect(u, v, 0.6f, 0.1f, 0.82f, 0.9f);
            case Ui.ICON_REWIND:
                return tri(u, v, 0.5f, 0.18f, 0.5f, 0.82f, 0.08f, 0.5f)
                        || tri(u, v, 0.92f, 0.18f, 0.92f, 0.82f, 0.5f, 0.5f);
            case Ui.ICON_FORWARD:
                return tri(u, v, 0.08f, 0.18f, 0.08f, 0.82f, 0.5f, 0.5f)
                        || tri(u, v, 0.5f, 0.18f, 0.5f, 0.82f, 0.92f, 0.5f);
            case Ui.ICON_BROWSER: {
                // Qua dia cau: vong tron, mot duong xich dao va mot kinh tuyen bau.
                float dx = u - 0.5f;
                float dy = v - 0.5f;
                float d2 = dx * dx + dy * dy;
                if (d2 > 0.46f * 0.46f) {
                    return false;
                }
                if (d2 >= 0.36f * 0.36f) {
                    return true;
                }
                float ex = dx / 0.2f;
                float inner = dx / 0.11f;
                boolean meridian = ex * ex + (dy / 0.4f) * (dy / 0.4f) <= 1f
                        && inner * inner + (dy / 0.36f) * (dy / 0.36f) >= 1f;
                return meridian || (dy > -0.05f && dy < 0.05f) || (dx > -0.04f && dx < 0.04f);
            }
            case Ui.ICON_HISTORY: {
                // Mat dong ho: vong tron va hai kim chi 3 gio kem 10.
                float dx = u - 0.5f;
                float dy = v - 0.5f;
                float d2 = dx * dx + dy * dy;
                boolean ring = d2 <= 0.46f * 0.46f && d2 >= 0.34f * 0.34f;
                return ring || capsule(u, v, 0.5f, 0.5f, 0.5f, 0.24f, 0.11f)
                        || capsule(u, v, 0.5f, 0.5f, 0.7f, 0.58f, 0.11f);
            }
            case Ui.ICON_RELOAD: {
                float dx = u - 0.5f;
                float dy = v - 0.53f;
                float d2 = dx * dx + dy * dy;
                boolean ring = d2 <= 0.38f * 0.38f && d2 >= 0.25f * 0.25f;
                // Chua mot khe o goc tren ben phai, dau mui ten nam o mep khe.
                boolean gap = dx > 0 && dy < 0 && -dy < dx * 1.3f;
                return (ring && !gap) || tri(u, v, 0.58f, 0.04f, 0.98f, 0.2f, 0.66f, 0.42f);
            }
            default:
                return false;
        }
    }
}
