# -*- coding: utf-8 -*-
"""用即梦生成的熊头原图派生全部品牌图标。

输入: build-preview/brand-test/mark.png   (即梦输出，1024x1024，白底)
输出: src-tauri/icons/{32x32,128x128,128x128@2x}.png / icon.ico / icon.icns
      public/assets/bear-logo.webp / .png   (顶栏品牌图标)

用法:
    python scripts/make_icon_ai.py --mark build-preview/brand-test/mark.png
"""
import argparse, io, os, struct, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
import _imgutil as U

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, "apps", "desktop", "src-tauri", "icons")
ASSETS = os.path.join(ROOT, "apps", "desktop", "public", "assets")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mark", required=True, help="即梦生成的熊头原图")
    ap.add_argument("--ratio", type=float, default=0.86, help="熊头占画布比例")
    args = ap.parse_args()

    os.makedirs(ICONS, exist_ok=True)
    os.makedirs(ASSETS, exist_ok=True)

    bear = U.trim(U.cutout(Image.open(args.mark)))
    print("抠图后内容尺寸:", bear.size)

    def tile(size):
        return U.tile(size, bear, ratio=args.ratio)

    tile(32).save(os.path.join(ICONS, "32x32.png"))
    tile(128).save(os.path.join(ICONS, "128x128.png"))
    tile(256).save(os.path.join(ICONS, "128x128@2x.png"))

    ico = tile(256)
    ico.save(os.path.join(ICONS, "icon.ico"), format="ICO",
             sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

    # ICNS：PNG 类型块
    blocks = [(b"ic11", 32), (b"ic12", 64), (b"ic07", 128), (b"ic13", 256), (b"ic09", 512)]
    data = b""
    for tag, size in blocks:
        buf = io.BytesIO()
        tile(size).save(buf, format="PNG")
        raw = buf.getvalue()
        data += tag + struct.pack(">I", len(raw) + 8) + raw
    with open(os.path.join(ICONS, "icon.icns"), "wb") as f:
        f.write(b"icns" + struct.pack(">I", len(data) + 8) + data)

    logo = tile(512)
    logo.save(os.path.join(ASSETS, "bear-logo.webp"), format="WEBP", quality=92, method=6)
    logo.save(os.path.join(ASSETS, "bear-logo.png"), format="PNG")

    preview = os.path.join(ROOT, "build-preview", "icon-ai-preview.png")
    sheet = Image.new("RGBA", (256 + 32 + 128 + 32 + 48, 256), (0xFA, 0xF4, 0xEA, 255))
    sheet.alpha_composite(tile(256), (0, 0))
    sheet.alpha_composite(tile(128), (288, 64))
    sheet.alpha_composite(tile(48), (448, 104))
    sheet.save(preview)

    for f in ["32x32.png", "128x128.png", "128x128@2x.png", "icon.ico", "icon.icns"]:
        p = os.path.join(ICONS, f)
        print("  %-16s %7d bytes" % (f, os.path.getsize(p)))
    for f in ["bear-logo.webp", "bear-logo.png"]:
        p = os.path.join(ASSETS, f)
        print("  %-16s %7d bytes" % (f, os.path.getsize(p)))
    print("预览:", preview)


if __name__ == "__main__":
    main()