#!/usr/bin/env python3
"""1200×630 share card: sleeve wall + extruded VprGrid.SYS lockup."""
from __future__ import annotations

import io
import json
import random
import ssl
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

# macOS system Python often lacks a cert bundle; these are public album sleeves.
_SSL = ssl._create_unverified_context()

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "og.jpg"
GOLD = ROOT / "src" / "lib" / "catalog" / "gold-2026.json"
W, H = 1200, 630
BG = (6, 10, 7)
FACE = (214, 236, 220)
TOP_LIT = (236, 248, 238)
SIDE_1 = (0, 92, 48)
SIDE_2 = (0, 58, 30)
SIDE_3 = (0, 32, 16)
DROP = (0, 0, 0, 120)
ACCENT = (0, 230, 110)

COLS, ROWS = 8, 4
CELL = 158


def font(path: str, size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(path, size, index=index)
    except OSError:
        return ImageFont.load_default()


def pic_urls(n: int) -> list[str]:
    raw = json.loads(GOLD.read_text())
    pics = [str(r.get("pic") or "").strip() for r in raw if r.get("pic")]
    step = max(1, len(pics) // n)
    picked = [pics[(i * step) % len(pics)] for i in range(n)]
    out = []
    for pic in picked:
        if "music.126.net" in pic:
            out.append(f"{pic.split('?')[0]}?param=240y240")
        else:
            out.append(pic)
    return out


def fetch_cover(url: str) -> Image.Image | None:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "VprGrid.SYS/1.0 (share card)",
            "Referer": "https://music.163.com/",
            "Accept": "image/*",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=8, context=_SSL) as res:
            img = Image.open(io.BytesIO(res.read())).convert("RGB")
        return img.resize((CELL, CELL), Image.Resampling.LANCZOS)
    except Exception:
        return None


def fallback(i: int) -> Image.Image:
    hues = ((22, 48, 32), (48, 28, 22), (20, 32, 48), (42, 36, 18), (30, 22, 40), (18, 40, 36))
    img = Image.new("RGB", (CELL, CELL), hues[i % len(hues)])
    d = ImageDraw.Draw(img)
    d.rectangle((8, 8, CELL - 9, CELL - 9), outline=(0, 90, 48))
    return img


def draw_spaced(draw: ImageDraw.ImageDraw, x: float, y: float, text: str, fill, fnt, tracking: float) -> None:
    cx = x
    for ch in text:
        draw.text((cx, y), ch, fill=fill, font=fnt)
        box = fnt.getbbox(ch)
        cx += (box[2] - box[0]) + tracking


def text_width(text: str, fnt, tracking: float) -> float:
    w = 0.0
    for ch in text:
        box = fnt.getbbox(ch)
        w += box[2] - box[0]
    return w + tracking * max(0, len(text) - 1)


def extruded(draw: ImageDraw.ImageDraw, x: float, y: float, text: str, fnt, tracking: float, em: float) -> None:
    """In-app brandmark: top light, stepped phosphor sides, drop shadow."""
    draw_spaced(draw, x + 0.19 * em, y + 0.23 * em, text, (0, 0, 0, 140), fnt, tracking)
    for ox, oy, col in (
        (0.14 * em, 0.14 * em, SIDE_3),
        (0.095 * em, 0.095 * em, SIDE_2),
        (0.05 * em, 0.05 * em, SIDE_1),
    ):
        draw_spaced(draw, x + ox, y + oy, text, col, fnt, tracking)
    draw_spaced(draw, x, y - 0.03 * em, text, TOP_LIT, fnt, tracking)
    draw_spaced(draw, x, y, text, FACE, fnt, tracking)


def film_grain(img: Image.Image, amount: int = 22) -> Image.Image:
    rng = random.Random(2026)
    grain = Image.new("L", img.size, 128)
    px = grain.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            px[x, y] = 128 + rng.randint(-amount, amount)
    grain = grain.filter(ImageFilter.GaussianBlur(0.35))
    overlay = Image.merge("RGB", (grain, grain, grain))
    return Image.blend(img, overlay, 0.14)


def scanlines(img: Image.Image) -> Image.Image:
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for y in range(0, img.size[1], 3):
        d.line((0, y, img.size[0], y), fill=(0, 0, 0, 28))
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def main() -> None:
    gw, gh = COLS * CELL, ROWS * CELL
    wall = Image.new("RGB", (gw, gh), BG)
    urls = pic_urls(COLS * ROWS)
    for i, url in enumerate(urls):
        tile = fetch_cover(url) or fallback(i)
        wall.paste(tile, ((i % COLS) * CELL, (i // COLS) * CELL))

    left = (gw - W) // 2
    top = (gh - H) // 2
    img = wall.crop((left, top, left + W, top + H))
    img = ImageEnhance.Contrast(img).enhance(1.08)

    img = img.convert("RGBA")
    plate = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pd = ImageDraw.Draw(plate)
    box = (178, 222, W - 178, 398)
    pd.rounded_rectangle((box[0] + 6, box[1] + 8, box[2] + 6, box[3] + 10), radius=20, fill=(0, 0, 0, 90))
    pd.rounded_rectangle(box, radius=18, fill=(8, 16, 10, 226))
    # glass: top sheen + inner rim
    pd.rounded_rectangle((box[0] + 1, box[1] + 1, box[2] - 1, box[1] + 54), radius=17, fill=(255, 255, 255, 18))
    pd.rounded_rectangle(box, radius=18, outline=(0, 230, 110, 46), width=2)
    pd.rounded_rectangle((box[0] + 2, box[1] + 2, box[2] - 2, box[3] - 2), radius=16, outline=(255, 255, 255, 16), width=1)
    img = Image.alpha_composite(img, plate).convert("RGB")

    img = scanlines(img)
    img = film_grain(img)

    draw = ImageDraw.Draw(img)
    title = font("/System/Library/Fonts/Supplemental/HelveticaNeue.ttc", 62, 9)  # Condensed Black
    word = "VprGrid.SYS"
    tracking = 9
    em = 62
    tw = text_width(word, title, tracking)
    tx = (W - tw) / 2
    extruded(draw, tx, 256, word, title, tracking, em)

    bar_w = 88
    draw.rectangle(((W - bar_w) // 2, 348, (W + bar_w) // 2, 351), fill=ACCENT)

    img.save(OUT, "JPEG", quality=90, optimize=True)
    print(OUT, img.size, OUT.stat().st_size)


if __name__ == "__main__":
    main()
