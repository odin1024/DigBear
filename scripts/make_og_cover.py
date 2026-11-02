# -*- coding: utf-8 -*-
"""生成社交分享封面。

产出三种：
- og-cover-square.png  1200x1200 正方形 —— 微信/微博的小卡片是方形的，
                                        用方图才不会被压变形
- og-cover-wide.png     1200x630  横版   —— Twitter 的大图卡片
- og-cover.png          1200x630  （与 wide 同内容，保留旧名避免引用失效）

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


def draw_wide(w, h):
    """横版：给 Twitter 这类大图卡片用。"""
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

    draw.text((int(w * 0.16), int(h * 0.08)), "掘掘熊", font=font(int(h * 0.17), "display"), fill=INK + (255,))
    draw.text((int(w * 0.34), int(h * 0.13)), "DigBear", font=font(int(h * 0.08), "bold"), fill=MUTED + (255,))
    draw.text((int(w * 0.06), int(h * 0.38)), "把网页里的宝贝，", font=font(int(h * 0.15), "display"), fill=INK + (255,))
    draw.text((int(w * 0.06), int(h * 0.56)), "收进采集袋。", font=font(int(h * 0.15), "display"), fill=INK + (255,))
    draw.text((int(w * 0.06), int(h * 0.78)), "图片 · 视频 · 音乐 · 字体，一个网址全部找出来",
               font=font(int(h * 0.06), "body"), fill=INK_SOFT + (255,))
    draw.text((int(w * 0.06), int(h * 0.88)), "Windows 开源免费 · 只读本机 · 不上传",
               font=font(int(h * 0.05), "body"), fill=MUTED + (255,))
    return canvas


def draw_square(size):
    """正方形：微信小卡片专用。

    主体用 bear-crawl（抱着放大镜调校齿轮的熊）—— 比例接近方形，
    不会裁到主体，语义上也最贴合「翻找素材」这件事。
    """
    canvas = Image.new("RGBA", (size, size), PAPER + (255,))
    draw = ImageDraw.Draw(canvas)

    # 背景：两个淡色圆 + 一圈虚线边，呼应贴纸风
    draw.ellipse([size * 0.06, size * 0.05, size * 0.99, size * 0.98], fill=(246, 239, 226, 255))
    draw.ellipse([size * 0.55, -size * 0.16, size * 1.12, size * 0.41], fill=(243, 233, 245, 255))

    # 主体吉祥物
    mascot_path = os.path.join(BRAND, "bear-crawl.webp")
    if os.path.exists(mascot_path):
        m = Image.open(mascot_path).convert("RGBA")
        target_h = size * 0.58
        scale = target_h / m.height
        m = m.resize((int(m.width * scale), int(target_h)), Image.LANCZOS)
        canvas.paste(m, (int((size - m.width) / 2), int(size * 0.10)), m)

    # 底部品牌区
    logo_path = os.path.join(BRAND, "bear-logo.webp")
    logo_size = int(size * 0.115)
    if os.path.exists(logo_path):
        logo = Image.open(logo_path).convert("RGBA").resize((logo_size, logo_size), Image.LANCZOS)
        mask = Image.new("L", logo.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, logo_size - 1, logo_size - 1],
                                               radius=int(logo_size * 0.26), fill=255)
        canvas.paste(logo, (int(size * 0.5 - logo_size / 2), int(size * 0.735)), mask)

    draw.text((size * 0.5, size * 0.745), "掘掘熊", font=font(int(size * 0.085), "display"),
              fill=INK + (255,), anchor="mt")
    draw.text((size * 0.5, size * 0.845), "DigBear", font=font(int(size * 0.042), "bold"),
              fill=MUTED + (255,), anchor="mt")
    draw.text((size * 0.5, size * 0.905), "网页媒体翻找工具 · Windows 开源免费",
              font=font(int(size * 0.032), "body"), fill=INK_SOFT + (255,), anchor="mt")
    return canvas


def main():
    wide = draw_wide(1200, 630)
    wide.convert("RGB").save(os.path.join(OUT, "og-cover-wide.png"), "PNG", optimize=True)
    wide.convert("RGB").save(os.path.join(OUT, "og-cover.png"), "PNG", optimize=True)

    square = draw_square(1200)
    square.convert("RGB").save(os.path.join(OUT, "og-cover-square.png"), "PNG", optimize=True)

    for name in ["og-cover.png", "og-cover-wide.png", "og-cover-square.png"]:
        path = os.path.join(OUT, name)
        print("已生成", name, round(os.path.getsize(path) / 1024), "KB")


if __name__ == "__main__":
    main()
