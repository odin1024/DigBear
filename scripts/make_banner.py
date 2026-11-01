# -*- coding: utf-8 -*-
"""生成 README 顶部的横幅海报。

用法：python scripts/make_banner.py
输出：docs/assets/banner.png
"""
import io, os, sys
from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

W, H = 1280, 420
PAPER = (250, 245, 236)
INK = (46, 36, 64)
INK_SOFT = (88, 74, 109)
MUTED = (138, 126, 160)
LINE = (46, 36, 64)

BRAND = os.path.join(ROOT, "apps", "website", "public", "assets", "brand")


def font(size, kind="display"):
    """kind: display 用方正舒体（手写感），bold/body 用微软雅黑。"""
    if kind == "display":
        path = r"C:\Windows\Fonts\FZSTK.TTF"
    elif kind == "bold":
        path = r"C:\Windows\Fonts\msyhbd.ttc"
    else:
        path = r"C:\Windows\Fonts\msyh.ttc"
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


def paste_rounded(canvas, image, box, radius, outline=None, width=0):
    """把 RGBA 图片按圆角裁剪后贴到画布上，保留原透明度。"""
    image = image.convert("RGBA")
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, image.width - 1, image.height - 1], radius=radius, fill=255
    )
    if outline:
        ring = Image.new("RGBA", image.size, (0, 0, 0, 0))
        ImageDraw.Draw(ring).rounded_rectangle(
            [0, 0, image.width - 1, image.height - 1], radius=radius, outline=outline, width=width
        )
        image = Image.alpha_composite(image, ring)
    canvas.paste(image, (box[0], box[1]), mask)


def main():
    canvas = Image.new("RGBA", (W, H), PAPER + (255,))
    draw = ImageDraw.Draw(canvas)

    # 右上角浅色圆 + 几枚淡爪印
    draw.ellipse([W - 300, -200, W + 120, 220], fill=(247, 240, 228, 255))
    for cx, cy, r in [(86, 330, 13), (60, 356, 13), (104, 362, 12), (128, 336, 11)]:
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(240, 232, 246, 255))

    # 吉祥物（右侧，带透明通道）
    mascot_path = os.path.join(BRAND, "bear-happy.webp")
    if os.path.exists(mascot_path):
        mascot = Image.open(mascot_path).convert("RGBA")
        scale = 330 / mascot.height
        mascot = mascot.resize((int(mascot.width * scale), 330), Image.LANCZOS)
        canvas.paste(mascot, (W - mascot.width - 66, 48), mascot)

    # Logo：圆角方形贴纸
    logo_path = os.path.join(BRAND, "bear-logo.webp")
    if os.path.exists(logo_path):
        logo = Image.open(logo_path).convert("RGBA").resize((92, 92), Image.LANCZOS)
        paste_rounded(canvas, logo, (72, 62), 26, outline=LINE + (255,), width=4)

    # 标题
    draw.text((188, 58), "掘掘熊", font=font(58, "display"), fill=INK + (255,))
    draw.text((188 + 208, 86), "DigBear", font=font(30, "bold"), fill=MUTED + (255,))

    # 副标题
    draw.text(
        (190, 140),
        "输入一个网址，把网页里的图片、视频、音乐与字体收进本地文件夹",
        font=font(21, "body"),
        fill=INK_SOFT + (255,),
    )

    # 三个小徽章
    badges = ["Windows 10+", "完全开源 · MIT", "只读本机 · 不上传"]
    x = 72
    for text in badges:
        f = font(16, "bold")
        w = int(draw.textlength(text, font=f)) + 40
        draw.rounded_rectangle(
            [x, 208, x + w, 246], radius=19, fill=(255, 253, 248, 255), outline=LINE + (255,), width=3
        )
        draw.text((x + 20, 216), text, font=f, fill=INK + (255,))
        x += w + 14

    # 底部说明
    draw.line([(72, 288), (W - 400, 288)], fill=(222, 212, 230, 255), width=2)
    draw.text(
        (72, 302),
        "挑完再存，支持批量下载 · 需要登录的站点在内置窗口登录一次即可 · 凭据只留在本机",
        font=font(17, "body"),
        fill=MUTED + (255,),
    )
    draw.text(
        (72, 338),
        "Windows 版开源工具 · 下载与更新：github.com/odin1024/DigBear",
        font=font(17, "body"),
        fill=MUTED + (255,),
    )

    out_dir = os.path.join(ROOT, "docs", "assets")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, "banner.png")
    canvas.convert("RGB").save(out, "PNG", optimize=True)
    print("已生成", out, canvas.size)


if __name__ == "__main__":
    main()
