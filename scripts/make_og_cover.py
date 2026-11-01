# -*- coding: utf-8 -*-
"""生成社交分享封面 og-cover.webp（1200x630）。"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRAND = os.path.join(ROOT, "apps", "website", "public", "assets", "brand")

W, H = 1200, 630
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


canvas = Image.new("RGBA", (W, H), PAPER + (255,))
draw = ImageDraw.Draw(canvas)
draw.ellipse([W - 420, -260, W + 180, 340], fill=(247, 240, 228, 255))

logo_path = os.path.join(BRAND, "bear-logo.webp")
if os.path.exists(logo_path):
    logo = Image.open(logo_path).convert("RGBA").resize((108, 108), Image.LANCZOS)
    mask = Image.new("L", logo.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, 107, 107], radius=30, fill=255)
    canvas.paste(logo, (76, 72), mask)

mascot_path = os.path.join(BRAND, "bear-happy.webp")
if os.path.exists(mascot_path):
    m = Image.open(mascot_path).convert("RGBA")
    scale = 470 / m.height
    m = m.resize((int(m.width * scale), 470), Image.LANCZOS)
    canvas.paste(m, (W - m.width - 70, 120), m)

draw.text((206, 82), "掘掘熊", font=font(68, "display"), fill=INK + (255,))
draw.text((410, 112), "DigBear", font=font(34, "bold"), fill=MUTED + (255,))
draw.text((80, 240), "把网页里的宝贝，", font=font(62, "display"), fill=INK + (255,))
draw.text((80, 318), "收进采集袋。", font=font(62, "display"), fill=INK + (255,))
draw.text(
    (84, 420),
    "图片 · 视频 · 音乐 · 字体，一个网址全部找出来",
    font=font(26, "body"), fill=INK_SOFT + (255,),
)
draw.text(
    (84, 522),
    "Windows 开源免费 · 只读本机 · 不上传",
    font=font(22, "body"), fill=MUTED + (255,),
)

out = os.path.join(ROOT, "apps", "website", "public", "assets", "og-cover.webp")
canvas.convert("RGB").save(out, "WEBP", quality=92, method=6)
print("已生成", out, canvas.size, round(os.path.getsize(out) / 1024), "KB")
