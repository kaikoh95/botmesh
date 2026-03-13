#!/usr/bin/env python3
"""Generate pixel-art isometric ground tiles for Kurokimachi snow theme."""
import os
import random
from PIL import Image, ImageDraw

W, H = 64, 32
OUT = os.path.join(os.path.dirname(__file__), '..', 'ui', 'assets', 'ground')
os.makedirs(OUT, exist_ok=True)

# Diamond mask: True if pixel is inside the isometric diamond
def in_diamond(px, py):
    cx, cy = W / 2, H / 2
    # Normalise to unit diamond
    nx = abs(px - cx) / (W / 2)
    ny = abs(py - cy) / (H / 2)
    return (nx + ny) <= 1.0

def make_diamond_mask():
    mask = Image.new('L', (W, H), 0)
    for y in range(H):
        for x in range(W):
            if in_diamond(x + 0.5, y + 0.5):
                mask.putpixel((x, y), 255)
    return mask

# Seeded hash for deterministic noise
def _hash(ix, iy):
    h = ix * 374761393 + iy * 668265263
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h = (h ^ (h >> 16)) & 0x7FFFFFFF
    return h / 0x7FFFFFFF

def smooth_noise(fx, fy):
    ix, iy = int(fx) if fx >= 0 else int(fx) - 1, int(fy) if fy >= 0 else int(fy) - 1
    dx, dy = fx - ix, fy - iy
    sx = dx * dx * (3 - 2 * dx)
    sy = dy * dy * (3 - 2 * dy)
    n00 = _hash(ix, iy)
    n10 = _hash(ix + 1, iy)
    n01 = _hash(ix, iy + 1)
    n11 = _hash(ix + 1, iy + 1)
    nx0 = n00 + (n10 - n00) * sx
    nx1 = n01 + (n11 - n01) * sx
    return nx0 + (nx1 - nx0) * sy

def clamp(v, lo=0, hi=255):
    return max(lo, min(hi, int(v)))

# ─── Snow tile ────────────────────────────────────────────────────────
def generate_snow_tile():
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    mask = make_diamond_mask()
    random.seed(42)

    for y in range(H):
        for x in range(W):
            if mask.getpixel((x, y)) == 0:
                continue

            # Base snow color: cool blue-white
            n1 = smooth_noise(x * 0.15, y * 0.15)
            n2 = smooth_noise(x * 0.4 + 10, y * 0.4 + 10)
            blend = n1 * 0.6 + n2 * 0.4

            # d8dcec to e8ecf4 range
            r = clamp(0xd8 + blend * (0xe8 - 0xd8))
            g = clamp(0xdc + blend * (0xec - 0xdc))
            b = clamp(0xec + blend * (0xf4 - 0xec))

            # Subtle depth: darken bottom-left face of diamond
            cx, cy = W / 2, H / 2
            # Normalised position within diamond
            rel_x = (x - cx) / (W / 2)
            rel_y = (y - cy) / (H / 2)

            # Left face (bottom-left quadrant) gets slightly darker
            if rel_x < 0 and rel_y > 0:
                shade = 0.92
                r = clamp(r * shade)
                g = clamp(g * shade)
                b = clamp(b * shade)
            # Right face (bottom-right quadrant) a touch darker
            elif rel_x > 0 and rel_y > 0:
                shade = 0.88
                r = clamp(r * shade)
                g = clamp(g * shade)
                b = clamp(b * shade)

            # Tiny sparkle crystals — sparse bright pixels
            sparkle = _hash(x * 7 + 3, y * 13 + 7)
            if sparkle > 0.97 and rel_y < 0.2:
                r = min(255, r + 20)
                g = min(255, g + 20)
                b = min(255, b + 15)

            # Edge highlight on top edges
            dist_to_edge = 1.0 - (abs(rel_x) + abs(rel_y))
            if dist_to_edge < 0.08 and rel_y < 0:
                r = min(255, r + 8)
                g = min(255, g + 8)
                b = min(255, b + 6)

            img.putpixel((x, y), (int(r), int(g), int(b), 255))

    img.save(os.path.join(OUT, 'snow-tile.png'))
    print('Generated snow-tile.png')

# ─── Soil tile ────────────────────────────────────────────────────────
def generate_soil_tile():
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    mask = make_diamond_mask()
    random.seed(99)

    for y in range(H):
        for x in range(W):
            if mask.getpixel((x, y)) == 0:
                continue

            n1 = smooth_noise(x * 0.12, y * 0.12)
            n2 = smooth_noise(x * 0.35 + 5, y * 0.35 + 5)
            blend = n1 * 0.6 + n2 * 0.4

            cx, cy = W / 2, H / 2
            rel_x = (x - cx) / (W / 2)
            rel_y = (y - cy) / (H / 2)

            # Base warm grey-brown: 0x4a4438 base
            base_r, base_g, base_b = 0x4a, 0x44, 0x38

            # Top face: slightly lighter with snow patches
            if rel_y < 0:
                # Snow patches on top
                snow_n = smooth_noise(x * 0.3 + 20, y * 0.3 + 20)
                if snow_n > 0.55:
                    # Snow patch
                    snow_amt = (snow_n - 0.55) / 0.45
                    r = clamp(base_r + snow_amt * (0xc8 - base_r))
                    g = clamp(base_g + snow_amt * (0xcc - base_g))
                    b = clamp(base_b + snow_amt * (0xd8 - base_b))
                else:
                    r = clamp(base_r + blend * 8)
                    g = clamp(base_g + blend * 8)
                    b = clamp(base_b + blend * 6)
            # Left face: medium shade
            elif rel_x < 0:
                shade = 0.85
                r = clamp(base_r * shade + blend * 5)
                g = clamp(base_g * shade + blend * 5)
                b = clamp(base_b * shade + blend * 4)
            # Right face: darkest
            else:
                shade = 0.75
                r = clamp(base_r * shade + blend * 4)
                g = clamp(base_g * shade + blend * 4)
                b = clamp(base_b * shade + blend * 3)

            # Subtle texture noise
            tex = _hash(x * 11 + 1, y * 17 + 3)
            r = clamp(r + (tex - 0.5) * 6)
            g = clamp(g + (tex - 0.5) * 6)
            b = clamp(b + (tex - 0.5) * 4)

            # Edge definition
            dist_to_edge = 1.0 - (abs(rel_x) + abs(rel_y))
            if dist_to_edge < 0.06:
                r = clamp(r * 0.85)
                g = clamp(g * 0.85)
                b = clamp(b * 0.85)

            img.putpixel((x, y), (int(r), int(g), int(b), 255))

    img.save(os.path.join(OUT, 'soil-tile.png'))
    print('Generated soil-tile.png')

if __name__ == '__main__':
    generate_snow_tile()
    generate_soil_tile()
    # Copy path-tile from buildings
    import shutil
    src = os.path.join(os.path.dirname(__file__), '..', 'ui', 'assets', 'buildings', 'path-tile.png')
    dst = os.path.join(OUT, 'path-tile.png')
    if os.path.exists(src):
        shutil.copy2(src, dst)
        print('Copied path-tile.png')
    print('Done!')
