# -*- coding: utf-8 -*-
"""品牌图像处理的共用工具：抠白底、圆角遮罩、渐变底。"""
import math
from PIL import Image, ImageChops, ImageDraw, ImageFilter


def cutout(im, thresh=42, feather=1.6):
    """把白底插画转成透明背景。

    用 floodfill 从四角扩散，只抠掉"与边缘连通"的背景；
    插画内部的白色高光被深色描边隔开，不会被误抠。
    模型偶尔把描边碎片画在背景上，形成孤立小色块，
    先膨胀背景让碎片并入背景，再用中值滤波抹掉孤点。
    """
    im = im.convert("RGB")
    w, h = im.size
    bg = im.copy()
    for corner in ((1, 1), (w - 2, 1), (1, h - 2), (w - 2, h - 2)):
        try:
            ImageDraw.floodfill(bg, corner, (255, 255, 255), thresh=thresh)
        except Exception:
            pass
    mask = bg.convert("L").point(lambda v: 255 if v >= 250 else 0)
    mask = mask.filter(ImageFilter.MaxFilter(9))
    mask = mask.filter(ImageFilter.MedianFilter(9))
    mask = mask.filter(ImageFilter.MinFilter(9))
    mask = mask.filter(ImageFilter.GaussianBlur(feather))
    out = im.convert("RGBA")
    out.putalpha(ImageChops.invert(mask))
    return out


def trim(im):
    """裁到实际内容。"""
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def fit_inside(im, box, ratio=0.82):
    """等比缩放到边长 box 的 ratio 比例并居中。"""
    w, h = im.size
    target = int(box * ratio)
    scale = target / max(w, h)
    im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    w, h = im.size
    canvas = Image.new("RGBA", (box, box), (0, 0, 0, 0))
    canvas.paste(im, ((box - w) // 2, (box - h) // 2), im)
    return canvas


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


def tile(size, mark, top=(0x6D, 0x4A, 0xC7), bottom=(0x3B, 0x2B, 0x6E), radius_ratio=0.215, ratio=0.82):
    """品牌紫渐变圆角方块 + 居中吉祥物。"""
    base = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = rounded_mask(size, int(size * radius_ratio))
    base.paste(vertical_gradient(size, top, bottom), (0, 0), mask)
    art = fit_inside(mark, size, ratio)
    base.alpha_composite(art)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(base, (0, 0), mask)
    return out