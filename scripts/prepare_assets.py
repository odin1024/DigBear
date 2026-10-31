#!/usr/bin/env python3
"""Turn the generated source art in design-assets/ into web assets.

- Bear illustrations: trimmed transparent PNG -> resized WebP (alpha preserved).
- paper-pattern.png: exported as one cover-sized sheet (paper-pattern.webp).
  The layout never tiles it, so no seams can appear.
- bear-app-icon.png is used separately via `npx tauri icon`.

Run from the repo root:  python3 scripts/prepare_assets.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "design-assets"
OUT = ROOT / "apps" / "desktop" / "public" / "assets"

BEAR_MOODS = ["hero", "crawl", "empty", "happy", "error", "login"]
BEAR_MAX = 960


def prepare_bear(mood: str) -> Path:
    src = SRC / f"bear-{mood}.png"
    image = Image.open(src).convert("RGBA")
    # Trim fully transparent margins so the artwork sits tightly in layout.
    bbox = image.getchannel("A").getbbox()
    if bbox:
        image = image.crop(bbox)
    image.thumbnail((BEAR_MAX, BEAR_MAX), Image.LANCZOS)
    dst = OUT / f"bear-{mood}.webp"
    image.save(dst, "WEBP", quality=90, method=6)
    return dst


def strip_background(image: Image.Image, threshold: int = 34) -> Image.Image:
    """Flood-fill the paper background to transparent from all four corners."""
    rgb = image.convert("RGB")
    sentinel = (255, 0, 255)
    width, height = rgb.size
    for seed in ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)):
        ImageDraw.floodfill(rgb, seed, sentinel, thresh=threshold)
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    bg = rgb.load()
    for y in range(height):
        for x in range(width):
            if bg[x, y] == sentinel:
                r, g, b, _ = pixels[x, y]
                pixels[x, y] = (r, g, b, 0)
    return rgba


def prepare_pattern() -> Path:
    """The paper art is used as one fixed, cover-sized sheet — never tiled.

    Tiling a sparse, hand-drawn sheet always exposes seams (or mirror artifacts
    if you fake it), so the layout paints it once behind the viewport instead.
    """
    src = SRC / "paper-pattern.png"
    image = Image.open(src).convert("RGB")
    # A hair of Lanczos upscale keeps the doodles soft on Retina screens.
    target = max(image.size) * 5 // 4
    image = image.resize((target, target), Image.LANCZOS)
    dst = OUT / "paper-pattern.webp"
    image.save(dst, "WEBP", quality=88, method=6)
    return dst


def prepare_logo() -> Path:
    """Small rounded brand mark for the masthead."""
    src = SRC / "bear-app-icon.png"
    image = Image.open(src).convert("RGBA").resize((1024, 1024), Image.LANCZOS)
    inner = image.resize((944, 944), Image.LANCZOS)
    mask = Image.new("L", (944, 944), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, 943, 943), radius=210, fill=255)
    canvas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    canvas.paste(inner, (40, 40), mask)
    logo = canvas.resize((256, 256), Image.LANCZOS)
    dst = OUT / "bear-logo.webp"
    logo.save(dst, "WEBP", quality=92, method=6)
    return dst


def prepare_app_icon() -> Path:
    """Round-corner the generated icon to the macOS Big Sur icon grid."""
    src = SRC / "bear-app-icon.png"
    image = Image.open(src).convert("RGBA").resize((1024, 1024), Image.LANCZOS)
    inner = image.resize((824, 824), Image.LANCZOS)
    mask = Image.new("L", (824, 824), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, 823, 823), radius=185, fill=255)
    canvas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    canvas.paste(inner, (100, 100), mask)
    dst = SRC / "app-icon-rounded.png"
    canvas.save(dst)
    return dst


WEBSITE = ROOT / "apps" / "website"
WEBSITE_BRAND = WEBSITE / "public" / "assets" / "brand"
WEBSITE_SHOTS = WEBSITE / "public" / "assets" / "shots"


def sync_website(files: list[Path]) -> None:
    """Keep the marketing site's copies of the brand assets in sync."""
    if not WEBSITE.exists():
        return
    import shutil

    WEBSITE_BRAND.mkdir(parents=True, exist_ok=True)
    for file in files:
        shutil.copy2(file, WEBSITE_BRAND / file.name)
    readme = ROOT / "assets" / "readme"
    shots = ["home.webp", "results.webp", "settings.webp", "progress.webp"]
    if any((readme / shot).exists() for shot in shots):
        WEBSITE_SHOTS.mkdir(parents=True, exist_ok=True)
        for shot in shots:
            if (readme / shot).exists():
                shutil.copy2(readme / shot, WEBSITE_SHOTS / shot)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for mood in BEAR_MOODS:
        src = SRC / f"bear-{mood}.png"
        if not src.exists():
            print(f"skip {mood}: missing {src}", file=sys.stderr)
            continue
        dst = prepare_bear(mood)
        size = dst.stat().st_size
        total += size
        print(f"{dst.relative_to(ROOT)}  {size // 1024} KB")
    pattern = prepare_pattern()
    total += pattern.stat().st_size
    print(f"{pattern.relative_to(ROOT)}  {pattern.stat().st_size // 1024} KB")
    logo = prepare_logo()
    total += logo.stat().st_size
    print(f"{logo.relative_to(ROOT)}  {logo.stat().st_size // 1024} KB")
    sync_website([OUT / f"bear-{mood}.webp" for mood in BEAR_MOODS] + [pattern, logo])
    icon = prepare_app_icon()
    print(f"{icon.relative_to(ROOT)} (run: npx tauri icon {icon.relative_to(ROOT)})")
    print(f"total web assets: {total // 1024} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
