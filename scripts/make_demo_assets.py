# -*- coding: utf-8 -*-
"""生成官网演示截图用的配图素材（无版权、无隐私）。

输出到 _test-artifacts/demo-assets/，只用于拍摄官网截图，不进仓库。
"""
import math, os, sys
from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "_test-artifacts", "demo-assets")
os.makedirs(OUT, exist_ok=True)

# 8 组配色：天空上/下、山体、点缀
PALETTES = [
    ((244, 206, 168), (236, 165, 128), (120, 92, 130), (255, 240, 214)),
    ((186, 214, 236), (232, 240, 246), (94, 118, 160), (255, 255, 255)),
    ((206, 226, 214), (240, 246, 232), (86, 122, 108), (250, 250, 240)),
    ((240, 214, 226), (250, 238, 244), (128, 96, 128), (255, 246, 250)),
    ((252, 226, 178), (255, 244, 216), (140, 110, 82), (255, 252, 240)),
    ((198, 206, 236), (232, 236, 250), (92, 96, 140), (248, 248, 255)),
    ((226, 214, 236), (246, 240, 250), (110, 96, 132), (252, 250, 255)),
    ((204, 232, 236), (240, 250, 250), (78, 126, 132), (250, 255, 255)),
]


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def font(size, bold=False):
    name = "msyhbd.ttc" if bold else "msyh.ttc"
    try:
        return ImageFont.truetype("C:/Windows/Fonts/" + name, size)
    except Exception:
        return ImageFont.load_default()


def landscape(index, w, h, palette):
    top, bottom, hill, accent = palette
    img = Image.new("RGB", (w, h), top)
    d = ImageDraw.Draw(img)

    # 天空渐变
    for y in range(h // 2):
        d.line([(0, y), (w, y)], fill=lerp(top, bottom, y / max(1, h // 2 - 1)))

    # 太阳 / 月亮
    cx, cy, r = int(w * (0.72 if index % 2 == 0 else 0.28)), int(h * 0.26), int(h * 0.11)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=accent)

    # 远山
    def hill_shape(base_y, amp, color, offset):
        pts = [(0, h)]
        for x in range(0, w + 1, max(1, w // 60)):
            y = base_y - amp * math.sin((x / w) * math.pi * 2 + offset) - amp * 0.4 * math.sin(
                (x / w) * math.pi * 5 + offset * 1.7
            )
            pts.append((x, int(y)))
        pts.append((w, h))
        d.polygon(pts, fill=color)

    hill_shape(int(h * 0.62), int(h * 0.14), lerp(hill, bottom, 0.55), index)
    hill_shape(int(h * 0.78), int(h * 0.10), hill, index * 1.9)

    # 水面倒影
    d.rectangle([0, int(h * 0.86), w, h], fill=lerp(hill, bottom, 0.35))

    # 编号标签
    label = f"DEMO {index + 1:02d}"
    f = font(int(h * 0.055), True)
    tw = int(d.textlength(label, font=f))
    d.rounded_rectangle([int(w * 0.045), int(h * 0.045), int(w * 0.045) + tw + 28, int(h * 0.045) + int(h * 0.095)],
                        radius=int(h * 0.05), fill=(255, 255, 255))
    d.text((int(w * 0.045) + 14, int(h * 0.068)), label, font=f, fill=(46, 36, 64))
    return img


def main():
    # 8 张图片素材
    for i in range(8):
        w, h = (1200, 900) if i % 3 == 0 else ((1600, 900) if i % 3 == 1 else (1000, 1000))
        img = landscape(i, w, h, PALETTES[i % len(PALETTES)])
        img.save(os.path.join(OUT, f"photo-{i + 1:02d}.jpg"), "JPEG", quality=88)

    # 2 张视频封面（16:9）
    for i, palette in enumerate([PALETTES[2], PALETTES[5]]):
        img = landscape(i + 8, 1280, 720, palette)
        d = ImageDraw.Draw(img)
        cx, cy, r = 640, 360, 74
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255))
        d.polygon([(cx - 22, cy - 34), (cx - 22, cy + 34), (cx + 38, cy)], fill=(46, 36, 64))
        img.save(os.path.join(OUT, f"clip-{i + 1:02d}.jpg"), "JPEG", quality=88)

    print("已生成到", OUT)
    for name in sorted(os.listdir(OUT)):
        print(" ", name, round(os.path.getsize(os.path.join(OUT, name)) / 1024), "KB")


if __name__ == "__main__":
    main()
