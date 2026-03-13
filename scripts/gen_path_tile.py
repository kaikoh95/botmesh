#!/usr/bin/env python3
"""Generate isometric cobblestone path tile and moat water tile."""
from PIL import Image, ImageDraw
import random
import os

TILE_W, TILE_H = 64, 32
random.seed(42)

def iso_diamond():
    """Return polygon points for isometric diamond (rhombus)."""
    cx, cy = TILE_W // 2, TILE_H // 2
    return [(cx, 0), (TILE_W - 1, cy), (cx, TILE_H - 1), (0, cy)]

def is_inside_diamond(x, y):
    """Check if pixel is inside the isometric diamond."""
    cx, cy = TILE_W / 2, TILE_H / 2
    # Diamond defined by |x-cx|/cx + |y-cy|/cy <= 1
    return abs(x - cx) / cx + abs(y - cy) / cy <= 1.0

def make_path_tile():
    img = Image.new('RGBA', (TILE_W, TILE_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Fill diamond with base cobblestone color
    diamond = iso_diamond()
    draw.polygon(diamond, fill=(120, 110, 100, 255))

    # Stone colors: worn grey-brown shades
    stone_colors = [
        (115, 105, 95),
        (125, 115, 105),
        (108, 100, 90),
        (130, 120, 108),
        (118, 108, 98),
    ]

    # Mortar color (dark gaps between stones)
    mortar = (70, 65, 58, 255)

    # Draw cobblestone pattern - irregular rectangular stones
    # Define stone grid with slight offsets for natural look
    stone_w, stone_h = 8, 6
    for row in range(-1, TILE_H // stone_h + 2):
        for col in range(-1, TILE_W // stone_w + 2):
            # Offset every other row
            ox = (row % 2) * (stone_w // 2)
            sx = col * stone_w + ox + random.randint(-1, 1)
            sy = row * stone_h + random.randint(-1, 1)

            color = random.choice(stone_colors)
            # Draw individual stone
            for py in range(sy + 1, sy + stone_h - 1):
                for px in range(sx + 1, sx + stone_w - 1):
                    if 0 <= px < TILE_W and 0 <= py < TILE_H and is_inside_diamond(px, py):
                        # Add per-pixel noise for texture
                        noise = random.randint(-5, 5)
                        r = max(0, min(255, color[0] + noise))
                        g = max(0, min(255, color[1] + noise))
                        b = max(0, min(255, color[2] + noise))
                        img.putpixel((px, py), (r, g, b, 255))

            # Draw mortar lines (horizontal)
            for px in range(sx, sx + stone_w):
                if 0 <= px < TILE_W and 0 <= sy < TILE_H and is_inside_diamond(px, sy):
                    img.putpixel((px, sy), mortar)
            # Draw mortar lines (vertical)
            for py in range(sy, sy + stone_h):
                if 0 <= sx < TILE_W and 0 <= py < TILE_H and is_inside_diamond(sx, py):
                    img.putpixel((sx, py), mortar)

    # Snow dusting on upper edges of stones
    for x in range(TILE_W):
        for y in range(TILE_H):
            if not is_inside_diamond(x, y):
                img.putpixel((x, y), (0, 0, 0, 0))
                continue
            # Snow on upper portion of diamond
            dist_from_top = y / (TILE_H / 2)  # 0 at top, 1 at middle
            if dist_from_top < 1.0:
                # Check if this is a mortar line (top edge of stone)
                row = y % stone_h
                if row <= 1 and random.random() < 0.3 * (1 - dist_from_top):
                    r, g, b, a = img.getpixel((x, y))
                    # Lighten towards white for snow
                    snow_amt = random.uniform(0.3, 0.6)
                    r = int(r + (235 - r) * snow_amt)
                    g = int(g + (235 - g) * snow_amt)
                    b = int(b + (240 - b) * snow_amt)
                    img.putpixel((x, y), (r, g, b, 255))

    # Clear outside diamond
    for x in range(TILE_W):
        for y in range(TILE_H):
            if not is_inside_diamond(x, y):
                img.putpixel((x, y), (0, 0, 0, 0))

    return img

def make_moat_tile():
    img = Image.new('RGBA', (TILE_W, TILE_H), (0, 0, 0, 0))

    # Icy blue water colors
    base_colors = [
        (80, 120, 160),   # deep icy blue
        (90, 130, 170),   # slightly lighter
        (70, 110, 150),   # darker
    ]
    ice_highlight = (180, 200, 220)  # frozen surface glint

    for x in range(TILE_W):
        for y in range(TILE_H):
            if not is_inside_diamond(x, y):
                continue

            # Base water color with wave pattern
            wave = ((x + y * 2) % 7)
            color = base_colors[wave % len(base_colors)]

            # Add subtle wave lines
            noise = random.randint(-8, 8)
            r = max(0, min(255, color[0] + noise))
            g = max(0, min(255, color[1] + noise))
            b = max(0, min(255, color[2] + noise))

            # Semi-frozen: ice patches
            if (x + y) % 11 == 0 or (x * 3 + y * 5) % 17 == 0:
                # Ice crystal highlight
                blend = random.uniform(0.3, 0.5)
                r = int(r + (ice_highlight[0] - r) * blend)
                g = int(g + (ice_highlight[1] - g) * blend)
                b = int(b + (ice_highlight[2] - b) * blend)

            # Horizontal wave lines for water texture
            if y % 5 == 0:
                r = max(0, r - 15)
                g = max(0, g - 10)
                b = max(0, b - 5)

            # Snow/frost on upper edge
            dist_top = abs(y - TILE_H / 2) / (TILE_H / 2)
            edge_dist = abs(x - TILE_W / 2) / (TILE_W / 2)
            if dist_top > 0.7 and y < TILE_H / 2:
                frost = random.uniform(0.2, 0.5)
                r = int(r + (220 - r) * frost)
                g = int(g + (225 - g) * frost)
                b = int(b + (235 - b) * frost)

            img.putpixel((x, y), (r, g, b, 230))  # slightly translucent

    return img

if __name__ == '__main__':
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    path_tile = make_path_tile()
    out_path = os.path.join(base, 'ui', 'assets', 'buildings', 'path-tile.png')
    path_tile.save(out_path)
    print(f"Saved path tile: {out_path} ({os.path.getsize(out_path)} bytes)")

    moat_tile = make_moat_tile()
    out_moat = os.path.join(base, 'ui', 'assets', 'sprites', 'life', 'moat.png')
    moat_tile.save(out_moat)
    print(f"Saved moat tile: {out_moat} ({os.path.getsize(out_moat)} bytes)")
