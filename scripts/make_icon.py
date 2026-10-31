# -*- coding: utf-8 -*-
"""DigBear 应用图标 —— 戴矿工帽、探出地层线的熊。

纯 Pillow 绘制，4x 超采样缩放。
输出 icons/{32x32,128x128,128x128@2x}.png / icon.ico / icon.icns / bear-logo.webp
"""
import math, os, struct, io as _io
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, "apps", "desktop", "src-tauri", "icons")
ASSETS = os.path.join(ROOT, "apps", "desktop", "public", "assets")

S = 4
BASE = 256
C = BASE * S

TOP    = (0x6D, 0x4A, 0xC7)
BOTTOM = (0x3B, 0x2B, 0x6E)
FUR    = (0xF7, 0xDD, 0xAD)
EAR    = (0xE2, 0x93, 0x45)
INK    = (0x33, 0x24, 0x4E)
STRATA = (0xFF, 0xD1, 0x7A)
HAT    = (0xE8, 0xA3, 0x3C)
HAT_D  = (0xC4, 0x7C, 0x28)
LAMP   = (0xFF, 0xF4, 0xD6)


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def vertical_gradient(size, top, bottom):
    g = Image.new("RGB", (1, size))
    px = g.load()
    for y in range(size):
        t = y / max(size - 1, 1)
        px[0, y] = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return g.resize((size, size), Image.BICUBIC)


def draw_bear(with_hat):
    layer = Image.new("RGBA", (C, C), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    cx, cy = C * 0.500, C * 0.440
    head_rx, head_ry = C * 0.228, C * 0.210
    ear_r = C * 0.104

    # --- 地层线（先画，被熊头压住，形成"探出"感）---
    for yy, amp, alpha, w in ((0.668, 0.024, 235, 0.021),
                              (0.788, 0.022, 175, 0.019),
                              (0.908, 0.020, 120, 0.017)):
        pts = []
        for x in range(0, C + 1, 6):
            t = x / C
            y = C * (yy + amp * math.sin(t * math.pi * 2.0 + 0.55))
            pts.append((x, y))
        d.line(pts, fill=STRATA + (alpha,), width=max(int(C * w), 1), joint="curve")

    # --- 耳朵 ---
    for sx in (-1, 1):
        ex = cx + sx * C * 0.158
        ey = cy - head_ry * 0.94
        d.ellipse([ex - ear_r, ey - ear_r, ex + ear_r, ey + ear_r], fill=FUR + (255,))
        ir = ear_r * 0.48
        d.ellipse([ex - ir, ey - ir, ex + ir, ey + ir], fill=EAR + (255,))

    # --- 头 ---
    d.ellipse([cx - head_rx, cy - head_ry, cx + head_rx, cy + head_ry], fill=FUR + (255,))

    # --- 矿工帽 ---
    if with_hat:
        top_y = cy - head_ry - C * 0.118
        brim_y = cy - head_ry + C * 0.010
        half = C * 0.163
        d.polygon([(cx - half, brim_y), (cx - half * 0.62, top_y + C * 0.012),
                   (cx + half * 0.62, top_y + C * 0.012), (cx + half, brim_y)],
                  fill=HAT + (255,))
        # 帽顶圆角
        d.ellipse([cx - half * 0.62, top_y - C * 0.010,
                   cx + half * 0.62, top_y + C * 0.055], fill=HAT + (255,))
        # 帽檐
        bw, bh = C * 0.245, C * 0.043
        d.ellipse([cx - bw, brim_y - bh, cx + bw, brim_y + bh], fill=HAT_D + (255,))
        # 头灯
        lr = C * 0.044
        ly = top_y + C * 0.040
        d.ellipse([cx - lr * 1.25, ly - lr * 1.25, cx + lr * 1.25, ly + lr * 1.25],
                  fill=HAT_D + (255,))
        d.ellipse([cx - lr, ly - lr, cx + lr, ly + lr], fill=LAMP + (255,))
        d.ellipse([cx - lr * 0.42, ly - lr * 0.42, cx + lr * 0.42, ly + lr * 0.42],
                  fill=(255, 255, 255, 235))

    # --- 眼睛 ---
    eye_r = C * 0.030
    for sx in (-1, 1):
        ex = cx + sx * C * 0.080
        ey = cy - C * 0.010
        d.ellipse([ex - eye_r, ey - eye_r, ex + eye_r, ey + eye_r], fill=INK + (255,))

    # --- 鼻子 ---
    nw, nh = C * 0.084, C * 0.058
    ny = cy + C * 0.078
    d.polygon([(cx, ny - nh * 0.55), (cx - nw * 0.5, ny + nh * 0.42),
               (cx + nw * 0.5, ny + nh * 0.42)], fill=INK + (255,))

    # --- 嘴 ---
    mw = max(int(C * 0.015), 2)
    d.arc([cx - C * 0.084, ny - C * 0.004, cx - C * 0.004, ny + C * 0.062],
          0, 110, fill=INK + (255,), width=mw)
    d.arc([cx + C * 0.004, ny - C * 0.004, cx + C * 0.082, ny + C * 0.062],
          70, 180, fill=INK + (255,), width=mw)

    return layer


def compose(with_hat):
    img = Image.new("RGBA", (C, C), (0, 0, 0, 0))
    mask = rounded_mask(C, int(C * 0.215))
    img.paste(vertical_gradient(C, TOP, BOTTOM), (0, 0), mask)
    bear = draw_bear(with_hat)
    img.alpha_composite(bear)
    # 所有内容统一裁到圆角内
    out = Image.new("RGBA", (C, C), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def main():
    os.makedirs(ICONS, exist_ok=True)
    os.makedirs(ASSETS, exist_ok=True)

    full = compose(True)      # 带矿工帽
    simple = compose(False)   # 无帽，小尺寸用

    def sc(im, size):
        return im.resize((size, size), Image.LANCZOS)

    sc(simple, 32).save(os.path.join(ICONS, "32x32.png"))
    sc(full, 128).save(os.path.join(ICONS, "128x128.png"))
    sc(full, 256).save(os.path.join(ICONS, "128x128@2x.png"))

    ico = full.resize((256, 256), Image.LANCZOS)
    ico.save(os.path.join(ICONS, "icon.ico"), format="ICO",
             sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

    blocks = [(b"ic11", 32), (b"ic12", 64), (b"ic07", 128), (b"ic13", 256), (b"ic09", 512)]
    data = b""
    for tag, size in blocks:
        buf = _io.BytesIO()
        full.resize((size, size), Image.LANCZOS).save(buf, format="PNG")
        raw = buf.getvalue()
        data += tag + struct.pack(">I", len(raw) + 8) + raw
    with open(os.path.join(ICONS, "icon.icns"), "wb") as f:
        f.write(b"icns" + struct.pack(">I", len(data) + 8) + data)

    logo = full.resize((512, 512), Image.LANCZOS).convert("RGBA")
    logo.save(os.path.join(ASSETS, "bear-logo.webp"), format="WEBP", quality=92, method=6)
    logo.save(os.path.join(ASSETS, "bear-logo.png"), format="PNG")

    # 预览：512 全尺寸 + 32 放大 + 16 放大
    prev = Image.new("RGBA", (512 + 64 + 64 + 64 + 64, 512), (250, 246, 236, 255))
    prev.paste(full.resize((512, 512), Image.LANCZOS), (0, 0))
    x = 528
    for size, up in ((32, 1), (48, 1), (128, 1)):
        p = sc(simple if size <= 32 else full, size).resize((size, size), Image.LANCZOS)
        prev.paste(p, (x, 120), p)
        x += size + 32
    prev.save(os.path.join(ROOT, "build-preview", "icon-preview.png"))
    print("OK")


if __name__ == "__main__":
    main()