#!/usr/bin/env python3
"""1200×630 share card: VprGrid.SYS on the Matrix phosphor ground."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "og.jpg"
W, H = 1200, 630
BG, FG, DIM, LINE = (2, 7, 3), (167, 255, 185), (51, 128, 74), (0, 255, 102)


def font(path, size, index=0):
    try:
        return ImageFont.truetype(path, size, index=index)
    except OSError:
        return ImageFont.load_default()


def main():
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    # scanlines
    for y in range(0, H, 4):
        draw.line((0, y, W, y), fill=(0, 18, 8), width=1)
    # phosphor bloom
    for r, a in ((420, 18), (280, 28), (160, 40)):
        overlay = Image.new("RGB", (W, H), BG)
        od = ImageDraw.Draw(overlay)
        od.ellipse((W // 2 - r, H // 2 - r + 20, W // 2 + r, H // 2 + r + 20), fill=(0, 40 + a, 16))
        img = Image.blend(img, overlay, 0.18)
    draw = ImageDraw.Draw(img)
    # sleeve stack
    for i, (x, y, s) in enumerate(((86, 198, 168), (118, 230, 168), (150, 262, 168))):
        c = (8 + i * 6, 36 + i * 10, 16 + i * 6)
        draw.rounded_rectangle((x, y, x + s, y + s), radius=6, fill=c, outline=LINE, width=2)
    title = font("/System/Library/Fonts/Supplemental/Courier New Bold.ttf", 86)
    zh = font("/System/Library/Fonts/Hiragino Sans GB.ttc", 30)
    en = font("/System/Library/Fonts/Supplemental/Courier New.ttf", 22)
    mark = font("/System/Library/Fonts/Supplemental/Courier New.ttf", 16)
    draw.text((360, 198), "VprGrid.SYS", fill=FG, font=title)
    draw.text((364, 298), "每周新专雷达", fill=LINE, font=zh)
    draw.text((364, 344), "Weekly radar for experimental & underground albums", fill=DIM, font=en)
    draw.text((364, 400), "TASTE FILTER  ·  NO ACCOUNT  ·  PUBLIC CATALOGS", fill=DIM, font=mark)
    draw.rectangle((0, 0, W - 1, H - 1), outline=(0, 80, 32))
    img.save(OUT, "JPEG", quality=90, optimize=True)
    print(OUT, img.size)


if __name__ == "__main__":
    main()
