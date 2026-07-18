#!/usr/bin/env python3
"""
Generate _locked.png variants: annular bg-color ring over the text region,
with a soft feathered inner edge so the figure centre bleeds through naturally.

Output: public/nodeimages/node_N_locked.png  (340×340 RGBA)

Usage:
    python dev/make_locked.py
"""

from PIL import Image, ImageDraw, ImageFilter
import os, pathlib

SRC  = pathlib.Path('public/nodeimages')
BG   = (250, 248, 245, 255)   # #faf8f5 paper colour
CX   = CY = 170                # image centre
R    = 170                     # outer radius (full image)
RING_INNER  = 108              # hard inner edge of the ring
FEATHER     = 18               # blend zone width (pixels)

def make_ring_mask(size=340):
    """RGBA mask: white = apply bg colour, black = leave original."""
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    # Solid outer ring
    draw.ellipse([CX - R, CY - R, CX + R, CY + R], fill=255)
    # Hard punch-out of centre
    inner = RING_INNER - FEATHER
    draw.ellipse([CX - inner, CY - inner, CX + inner, CY + inner], fill=0)
    # Feather the inner edge by blurring the whole mask then restoring the outer hard edge
    mask = mask.filter(ImageFilter.GaussianBlur(radius=FEATHER * 0.6))
    draw = ImageDraw.Draw(mask)
    # Re-stamp outer ring as fully opaque (undo blur bleed beyond circle)
    draw.ellipse([CX - R, CY - R, CX + R, CY + R], outline=None)
    return mask

ring_mask = make_ring_mask()
bg_layer  = Image.new('RGBA', (340, 340), BG)

done = 0
for src in sorted(SRC.glob('node_[0-9]*.png')):
    if '_locked' in src.name:
        continue
    img    = Image.open(src).convert('RGBA')
    result = img.copy()
    result.paste(bg_layer, mask=ring_mask)
    dst = src.with_stem(src.stem + '_locked')
    result.save(dst, compress_level=6)
    done += 1

print(f'  wrote {done} locked variants → {SRC}/')
