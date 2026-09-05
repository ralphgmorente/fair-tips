#!/usr/bin/env python3
"""
Generates the PWA icon and iOS splash-screen images.

Run after changing the brand mark:  python3 scripts/generate-pwa-assets.py
Outputs land in public/icons and public/splash and are committed, so the build
needs no image tooling.
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

BRAND = (15, 124, 103)      # --accent
BRAND_DARK = (6, 72, 61)    # --accent-dark
WHITE = (255, 255, 255)
ROOT = Path(__file__).resolve().parent.parent
FONT_PATH = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def load_font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_PATH, size)


def draw_mark(size: int, padding_ratio: float, radius_ratio: float, bg=None) -> Image.Image:
    """A rounded teal tile with the SF monogram, matching the sidebar mark."""
    img = Image.new("RGBA", (size, size), bg or (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    pad = int(size * padding_ratio)
    box = (pad, pad, size - pad, size - pad)
    tile = box[2] - box[0]
    draw.rounded_rectangle(box, radius=int(tile * radius_ratio), fill=BRAND)

    font = load_font(int(tile * 0.42))
    text = "SF"
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    draw.text(
        (box[0] + (tile - (right - left)) / 2 - left,
         box[1] + (tile - (bottom - top)) / 2 - top),
        text, font=font, fill=WHITE,
    )
    return img


def write(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG", optimize=True)
    print(f"  {path.relative_to(ROOT)}  {img.size[0]}x{img.size[1]}")


print("icons:")
# Standard icons: the mark fills the canvas.
for size in (192, 512):
    write(draw_mark(size, 0.0, 0.22), ROOT / f"public/icons/icon-{size}.png")

# Maskable: Android crops to a circle, so keep the mark inside the 80% safe zone
# and paint the full canvas so no transparent corners show through.
for size in (192, 512):
    img = Image.new("RGBA", (size, size), BRAND_DARK + (255,))
    img.alpha_composite(draw_mark(size, 0.14, 0.26))
    write(img, ROOT / f"public/icons/icon-maskable-{size}.png")

# Apple touch icon is composited on white if transparent, so give it a solid tile.
write(draw_mark(180, 0.0, 0.0, bg=BRAND + (255,)), ROOT / "public/icons/apple-touch-icon.png")
write(draw_mark(32, 0.0, 0.18), ROOT / "public/icons/favicon-32.png")

# iOS launch images. Portrait only: the app is a phone-width dashboard.
IPHONES = [
    (1179, 2556), (1290, 2796), (1170, 2532),
    (1284, 2778), (1125, 2436), (828, 1792), (750, 1334),
]
print("splash:")
for w, h in IPHONES:
    canvas = Image.new("RGBA", (w, h), (250, 251, 250, 255))  # --surface-0
    mark = draw_mark(int(min(w, h) * 0.32), 0.0, 0.22)
    canvas.alpha_composite(mark, ((w - mark.width) // 2, (h - mark.height) // 2))
    write(canvas, ROOT / f"public/splash/launch-{w}x{h}.png")
