# -*- coding: utf-8 -*-
"""生成社交分享封面。

产出两种尺寸：
- og-cover.png   1200x630，微信 / 微博 / Twitter 的大图卡片
- og-cover-square.png 200x200，部分平台的小方图

**必须是 PNG**：WebP 在微信、微博等平台普遍不被识别，分享卡片会没有缩略图。

用法：python scripts/make_og_cover.py
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRAND = os.path.join(ROOT, "apps", "website", "public", "assets", "brand")
OUT = os.path.join(ROOT, "apps", "website", "public", "assets")

PAPER = (250, 245, 236)
INK = (46, 36, 64)
INK_SOFT = (88, 74, 109)
MUTED = (138, 126, 160)
LINE = (46, 36, 64)


def font(size, kind="display"):
    path = r"C:\Windows\Fonts\FZSTK.TTF" if kind == "display" else (
        r"C:\Windows\Fonts\msyhbd.ttc" if kind == "bold" else r"C:\Windows\Fonts\msyh.ttc")
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


def draw_cover(w, h, square=False):
    canvas = Image.new("RGBA", (w, h), PAPER + (255,))
    draw = ImageDraw.Draw(canvas)
    draw.ellipse([w - int(w * 0.42), -int(h * 0.46), w + int(w * 0.2), int(h * 0.54)],
                 fill=(247, 240, 228, 255))

    logo_path = os.path.join(BRAND, "bear-logo.webp")
    if os.path.exists(logo_path):
        logo = Image.open(logo_path).convert("RGBA").resize((int(h * 0.24), int(h * 0.24)), Image.LANCZOS)
        mask = Image.new("L", logo.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, logo.width - 1, logo.height - 1],
                                               radius=int(h * 0.07), fill=255)
        canvas.paste(logo, (int(w * 0.06), int(h * 0.1)), mask)

    mascot_path = os.path.join(BRAND, "bear-happy.webp")
    if os.path.exists(mascot_path):
        m = Image.open(mascot_path).convert("RGBA")
        scale = (h * 0.62) / m.height
        m = m.resize((int(m.width * scale), int(h * 0.62)), Image.LANCZOS)
        canvas.paste(m, (w - m.width - int(w * 0.05), int(h * 0.28)), m)

    if square:
        # 方形版单独排：长句会挤在一起，只留标题和一句短的
        draw.text((int(w * 0.08), int(h * 0.14)), "掘掘熊", font=font(int(h * 0.13), "display"), fill=INK + (255,))
        draw.text((int(w * 0.08), int(h * 0.3)), "DigBear", font=font(int(h * 0.075), "bold"), fill=MUTED + (255,))
        draw.text((int(w * 0.08), int(h * 0.56)), "把网页里的宝贝，", font=font(int(h * 0.1), "display"), fill=INK + (255,))
        draw.text((int(w * 0.08), int(h * 0.68)), "收进采集袋。", font=font(int(h * 0.1), "display"), fill=INK + (255,))
        draw.text((int(w * 0.08), int(h * 0.85)), "Windows 开源免费", font=font(int(h * 0.055), "body"), fill=MUTED + (255,))
        return canvas

    draw.text((int(w * 0.16), int(h * 0.08)), "掘掘熊", font=font(int(h * 0.17), "display"), fill=INK + (255,))
    draw.text((int(w * 0.34), int(h * 0.13)), "DigBear", font=font(int(h * 0.08), "bold"), fill=MUTED + (255,))
    draw.text((int(w * 0.06), int(h * 0.38)), "把网页里的宝贝，", font=font(int(h * 0.15), "display"), fill=INK + (255,))
    draw.text((int(w * 0.06), int(h * 0.56)), "收进采集袋。", font=font(int(h * 0.15), "display"), fill=INK + (255,))
    draw.text((int(w * 0.06), int(h * 0.78)), "图片 · 视频 · 音乐 · 字体，一个网址全部找出来",
               font=font(int(h * 0.06), "body"), fill=INK_SOFT + (255,))
    draw.text((int(w * 0.06), int(h * 0.88)), "Windows 开源免费 · 只读本机 · 不上传",
               font=font(int(h * 0.05), "body"), fill=MUTED + (255,))
    return canvas


def main():
    big = draw_cover(1200, 630)
    big.convert("RGB").save(os.path.join(OUT, "og-cover.png"), "PNG", optimize=True)

    # 方形小图：部分平台的小卡片只认这个尺寸
    square = draw_cover(400, 400, square=True)
    square.convert("RGB").save(os.path.join(OUT, "og-cover-square.png"), "PNG", optimize=True)

    for name in ["og-cover.png", "og-cover-square.png"]:
        path = os.path.join(OUT, name)
        print("已生成", path, round(os.path.getsize(path) / 1024), "KB")


if __name__ == "__main__":
    main()
