# -*- coding: utf-8 -*-
"""把即梦生成的吉祥物原图处理成前端可用的透明 WebP。

输入: build-preview/mascot-test/<mood>.png
输出: apps/desktop/public/assets/bear-<mood>.webp (+ .png 兜底)

步骤: floodfill 抠白底 -> 裁切到内容 -> 缩放 -> 存 WebP/PNG
"""
import argparse, os, sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "apps", "desktop", "public", "assets")


def cutout(im, thresh=42, feather=1.6):
    im = im.convert("RGB")
    w, h = im.size
    bg = im.copy()
    for corner in ((1, 1), (w - 2, 1), (1, h - 2), (w - 2, h - 2)):
        try:
            ImageDraw.floodfill(bg, corner, (255, 255, 255), thresh=thresh)
        except Exception:
            pass
    mask = bg.convert("L").point(lambda v: 255 if v >= 250 else 0)

    # 模型偶尔会把描边碎片画在背景上，形成孤立小色块。
    # 先把背景膨胀让碎片与背景连成一片，再用中值滤波抹掉孤点，最后收缩回来。
    mask = mask.filter(ImageFilter.MaxFilter(9))
    mask = mask.filter(ImageFilter.MedianFilter(9))
    mask = mask.filter(ImageFilter.MinFilter(9))

    mask = mask.filter(ImageFilter.GaussianBlur(feather))
    out = im.convert("RGBA")
    out.putalpha(ImageChops.invert(mask))
    return out


def process(src, max_size=1024, pad_ratio=0.03, mirror=False):
    im = cutout(Image.open(src))
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    if mirror:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    w, h = im.size
    side = max(w, h)
    pad = int(side * pad_ratio)
    canvas = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    canvas.paste(im, (pad, pad), im)
    if canvas.size[0] > max_size:
        canvas = canvas.resize(
            (max_size, int(canvas.size[1] * max_size / canvas.size[0])), Image.LANCZOS)
    return canvas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src-dir", required=True)
    ap.add_argument("--moods", default="hero,crawl,empty,happy,error,login")
    ap.add_argument("--max-size", type=int, default=1024)
    ap.add_argument("--mirror", default="", help="逗号分隔，需要水平翻转的情绪名")
    args = ap.parse_args()

    os.makedirs(ASSETS, exist_ok=True)
    mirror_set = {m.strip() for m in args.mirror.split(",") if m.strip()}
    for mood in [m.strip() for m in args.moods.split(",") if m.strip()]:
        src = os.path.join(args.src_dir, "%s.png" % mood)
        if not os.path.exists(src):
            print("跳过(缺图): %s" % src)
            continue
        out = process(src, args.max_size, mirror=mood in mirror_set)
        webp = os.path.join(ASSETS, "bear-%s.webp" % mood)
        png = os.path.join(ASSETS, "bear-%s.png" % mood)
        out.save(webp, format="WEBP", quality=90, method=6)
        out.save(png, format="PNG")
        print("%-8s %s  %d bytes" % (mood, os.path.basename(webp), os.path.getsize(webp)))


if __name__ == "__main__":
    main()