#!/usr/bin/env python3
"""1200×630 share card: sleeve wall from the catalog + VprGrid.SYS lockup."""
from __future__ import annotations

import io
import json
import ssl
import urllib.request
from pathlib import Path

# macOS system Python often lacks a cert bundle; these are public album sleeves.
_SSL = ssl._create_unverified_context()

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "og.jpg"
GOLD = ROOT / "src" / "lib" / "catalog" / "gold-2026.json"
W, H = 1200, 630
BG = (6, 10, 7)
FG = (226, 255, 232)
MUTED = (168, 206, 178)
ACCENT = (0, 230, 110)

COLS, ROWS = 8, 4
CELL = 158  # paint oversized then crop


def font(path: str, size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(path, size, index=index)
    except OSError:
        return ImageFont.load_default()


def pic_urls(n: int) -> list[str]:
    raw = json.loads(GOLD.read_text())
    pics = [str(r.get("pic") or "").strip() for r in raw if r.get("pic")]
    # stride through the pool so the wall is not 32 near-black sleeves in a row
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


def draw_spaced(draw: ImageDraw.ImageDraw, x: int, y: int, text: str, fill, fnt, tracking: int) -> int:
    for ch in text:
        draw.text((x, y), ch, fill=fill, font=fnt)
        box = fnt.getbbox(ch)
        x += (box[2] - box[0]) + tracking
    return x


def text_width(text: str, fnt, tracking: int) -> int:
    w = 0
    for ch in text:
        box = fnt.getbbox(ch)
        w += box[2] - box[0]
    return w + tracking * max(0, len(text) - 1)


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

    img = img.convert("RGBA")
    plate = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pd = ImageDraw.Draw(plate)
    pd.rounded_rectangle((168, 214, W - 168, 416), radius=18, fill=(6, 12, 8, 210))
    img = Image.alpha_composite(img, plate).convert("RGB")

    draw = ImageDraw.Draw(img)
    title = font("/System/Library/Fonts/Supplemental/HelveticaNeue.ttc", 58, 1)
    sub = font("/System/Library/Fonts/Supplemental/HelveticaNeue.ttc", 21, 10)
    word = "VprGrid.SYS"
    tw = text_width(word, title, 8)
    tx = (W - tw) // 2
    draw_spaced(draw, tx + 3, 248 + 3, word, (0, 48, 22), title, 8)
    draw_spaced(draw, tx, 248, word, FG, title, 8)

    line = "Experimental / underground album radar"
    sw = sub.getbbox(line)[2] - sub.getbbox(line)[0]
    draw.text(((W - sw) // 2, 332), line, fill=MUTED, font=sub)
    bar_w = 72
    draw.rectangle(((W - bar_w) // 2, 378, (W + bar_w) // 2, 380), fill=ACCENT)

    img.save(OUT, "JPEG", quality=90, optimize=True)
    print(OUT, img.size, OUT.stat().st_size)


if __name__ == "__main__":
    main()
