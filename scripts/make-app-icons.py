#!/usr/bin/env python3
"""Recolor the floor grid to the V's neon green, then emit every icon size."""
import colorsys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "extension/icons/icon128.png"

# Dock / home-screen icons: inset so the tile matches other apps (full-bleed read as one size larger).
DOCK_SCALE = 0.86
DOCK_RADIUS = 0.26
DOCK_OUT = {
    1024: ROOT / "public/icon-1024.png",
    512: ROOT / "public/icon-512.png",
    192: ROOT / "public/icon-192.png",
}
SQUARE_OUT = {
    180: ROOT / "public/__grok/icon-180.png",
    128: ROOT / "extension/icons/icon128.png",
    48: ROOT / "extension/icons/icon48.png",
    32: ROOT / "extension/icons/icon32.png",
    16: ROOT / "extension/icons/icon16.png",
}
V_HUE = 125 / 360


def recolor_grid(img: Image.Image) -> Image.Image:
    im = img.convert("RGBA")
    pix = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pix[x, y]
            if max(r, g, b) < 16:
                continue
            hue, sat, val = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            deg = hue * 360
            if 80 <= deg <= 165 and sat > 0.35 and val > 0.25:
                continue
            nr, ng, nb = colorsys.hsv_to_rgb(V_HUE, min(1.0, sat * 0.7 + 0.28), val * 0.82)
            pix[x, y] = (int(nr * 255), int(ng * 255), int(nb * 255), a)
    return im


def round_mask(size: int, radius: float) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    r = max(1, round(size * radius))
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=r, fill=255)
    return mask


def dock_tile(master: Image.Image, size: int) -> Image.Image:
    inner = max(8, round(size * DOCK_SCALE))
    if inner % 2 != size % 2:
        inner -= 1
    art = master.resize((inner, inner), Image.Resampling.LANCZOS)
    art.putalpha(round_mask(inner, DOCK_RADIUS))
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    off = (size - inner) // 2
    canvas.paste(art, (off, off), art)
    return canvas


def main() -> None:
    master = recolor_grid(Image.open(SRC).resize((1024, 1024), Image.Resampling.LANCZOS))
    for size, dest in DOCK_OUT.items():
        dest.parent.mkdir(parents=True, exist_ok=True)
        dock_tile(master, size).save(dest, "PNG", optimize=True)
    for size, dest in SQUARE_OUT.items():
        dest.parent.mkdir(parents=True, exist_ok=True)
        master.resize((size, size), Image.Resampling.LANCZOS).save(dest, "PNG", optimize=True)


if __name__ == "__main__":
    main()
