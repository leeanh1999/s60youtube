import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.Path2D;
import java.awt.geom.RoundRectangle2D;
import java.awt.image.BufferedImage;
import java.io.File;

import javax.imageio.ImageIO;

/**
 * Ve bieu tuong app: nut phat cua YouTube — khung bo goc do #FF0000, tam giac
 * trang o giua, theo ty le cua logo goc (khung 1.43:1). Ve luc build nen repo
 * khong phai giu file anh.
 *
 *   java tools/Icon.java <file.png> <canh>
 */
public class Icon {
    public static void main(String[] args) throws Exception {
        int size = args.length > 1 ? Integer.parseInt(args[1]) : 64;
        BufferedImage img = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);

        double w = size * 0.96;
        double h = w / 1.43;
        double x = (size - w) / 2;
        double y = (size - h) / 2;
        g.setColor(new Color(0xFF0000));
        g.fill(new RoundRectangle2D.Double(x, y, w, h, h * 0.45, h * 0.45));

        // Tam giac logo goc: cao ~ 0.5 khung, rong ~ 0.87 chieu cao, lech phai mot chut.
        double th = h * 0.5;
        double tw = th * 0.87;
        double cx = size / 2.0 + tw * 0.08;
        double cy = size / 2.0;
        Path2D.Double play = new Path2D.Double();
        play.moveTo(cx - tw / 2, cy - th / 2);
        play.lineTo(cx + tw / 2, cy);
        play.lineTo(cx - tw / 2, cy + th / 2);
        play.closePath();
        g.setColor(Color.WHITE);
        g.fill(play);
        g.dispose();

        ImageIO.write(img, "png", new File(args[0]));
    }
}
