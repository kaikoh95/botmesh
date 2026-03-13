#!/usr/bin/env python3
"""Generate pixel-art isometric CUBE ground tiles for Kurokimachi snow theme.
Each tile is 64×48: 64×32 top diamond + 16px tall side faces."""
import os
import random
from PIL import Image, ImageDraw

W, H_TOP = 64, 32
SIDE_H = 16
H = H_TOP + SIDE_H  # 48
OUT = os.path.join(os.path.dirname(__file__), '..', 'ui', 'assets', 'ground')
os.makedirs(OUT, exist_ok=True)

# ── Geometry helpers ──────────────────────────────────────────────────

def in_diamond(px, py):
    """True if pixel is inside the top-face diamond (64×32, top 32 rows)."""
    cx, cy = W / 2, H_TOP / 2
    nx = abs(px - cx) / (W / 2)
    ny = abs(py - cy) / (H_TOP / 2)
    return (nx + ny) <= 1.0

def in_left_face(px, py):
    """True if pixel is inside the left side face parallelogram.
    Vertices: top-left(0,16) → bottom-center(32,32) → bottom-center(32,48) → left(0,32)"""
    # Left face spans x=[0,32), y=[16,48)
    if px >= W // 2 or py < H_TOP // 2 or py >= H:
        return False
    # Top edge: line from (0, H_TOP//2) to (W//2, H_TOP)
    # y >= H_TOP//2 + px * (H_TOP//2) / (W//2)  → y >= 16 + px/2
    top_y = H_TOP // 2 + px * (H_TOP // 2) / (W // 2)
    # Bottom edge: 16px below top edge
    bot_y = top_y + SIDE_H
    return top_y <= py < bot_y

def in_right_face(px, py):
    """True if pixel is inside the right side face parallelogram.
    Vertices: center(32,32) → right(64,16) → right(64,32) → center(32,48)"""
    if px < W // 2 or py < H_TOP // 2 or py >= H:
        return False
    # Top edge: line from (W//2, H_TOP) to (W, H_TOP//2)
    # y >= H_TOP - (px - W//2) * (H_TOP//2) / (W//2)  → y >= 32 - (px-32)/2
    top_y = H_TOP - (px - W // 2) * (H_TOP // 2) / (W // 2)
    bot_y = top_y + SIDE_H
    return top_y <= py < bot_y

# ── Noise helpers ─────────────────────────────────────────────────────

def _hash(ix, iy):
    h = ix * 374761393 + iy * 668265263
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h = (h ^ (h >> 16)) & 0x7FFFFFFF
    return h / 0x7FFFFFFF

def smooth_noise(fx, fy):
    ix = int(fx) if fx >= 0 else int(fx) - 1
    iy = int(fy) if fy >= 0 else int(fy) - 1
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
    random.seed(42)

    for y in range(H):
        for x in range(W):
            if in_diamond(x + 0.5, y + 0.5):
                # Top face: white/blue-white snow
                n1 = smooth_noise(x * 0.15, y * 0.15)
                n2 = smooth_noise(x * 0.4 + 10, y * 0.4 + 10)
                blend = n1 * 0.6 + n2 * 0.4

                r = clamp(0xd8 + blend * (0xee - 0xd8))
                g = clamp(0xe0 + blend * (0xf2 - 0xe0))
                b = clamp(0xf0 + blend * (0xfc - 0xf0))

                # Sparkle dots
                sparkle = _hash(x * 7 + 3, y * 13 + 7)
                if sparkle > 0.96:
                    r = min(255, r + 25)
                    g = min(255, g + 25)
                    b = min(255, b + 20)

                img.putpixel((x, y), (int(r), int(g), int(b), 255))

            elif in_left_face(x + 0.5, y + 0.5):
                # Left face: mid blue-grey (#8090a8)
                tex = _hash(x * 11 + 1, y * 17 + 3)
                r = clamp(0x80 + (tex - 0.5) * 8)
                g = clamp(0x90 + (tex - 0.5) * 8)
                b = clamp(0xa8 + (tex - 0.5) * 6)
                img.putpixel((x, y), (int(r), int(g), int(b), 255))

            elif in_right_face(x + 0.5, y + 0.5):
                # Right face: darker shadow (#606878)
                tex = _hash(x * 13 + 2, y * 19 + 5)
                r = clamp(0x60 + (tex - 0.5) * 6)
                g = clamp(0x68 + (tex - 0.5) * 6)
                b = clamp(0x78 + (tex - 0.5) * 5)
                img.putpixel((x, y), (int(r), int(g), int(b), 255))

    img.save(os.path.join(OUT, 'snow-tile.png'))
    print('Generated snow-tile.png (64x48 cube)')

# ─── Path tile ────────────────────────────────────────────────────────

def generate_path_tile():
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    random.seed(42)

    # Stone colors for top face
    stone_colors = [
        (0x48, 0x48, 0x50), (0x4c, 0x4c, 0x54), (0x44, 0x44, 0x4e),
        (0x50, 0x50, 0x56), (0x46, 0x46, 0x4f),
    ]
    mortar = (0x2a, 0x2a, 0x30)
    stone_w, stone_h = 8, 6

    for y in range(H):
        for x in range(W):
            if in_diamond(x + 0.5, y + 0.5):
                # Cobblestone pattern on top face
                row = y // stone_h
                col = (x + (row % 2) * (stone_w // 2)) // stone_w
                local_x = (x + (row % 2) * (stone_w // 2)) % stone_w
                local_y = y % stone_h

                if local_x == 0 or local_y == 0:
                    # Mortar line
                    r, g, b = mortar
                else:
                    color = stone_colors[(row * 3 + col * 7) % len(stone_colors)]
                    noise = _hash(x * 11 + 1, y * 17 + 3)
                    r = clamp(color[0] + (noise - 0.5) * 10)
                    g = clamp(color[1] + (noise - 0.5) * 10)
                    b = clamp(color[2] + (noise - 0.5) * 8)
                img.putpixel((x, y), (int(r), int(g), int(b), 255))

            elif in_left_face(x + 0.5, y + 0.5):
                tex = _hash(x * 11 + 1, y * 17 + 3)
                r = clamp(0x2a + (tex - 0.5) * 6)
                g = clamp(0x28 + (tex - 0.5) * 6)
                b = clamp(0x30 + (tex - 0.5) * 5)
                img.putpixel((x, y), (int(r), int(g), int(b), 255))

            elif in_right_face(x + 0.5, y + 0.5):
                tex = _hash(x * 13 + 2, y * 19 + 5)
                r = clamp(0x1e + (tex - 0.5) * 5)
                g = clamp(0x1c + (tex - 0.5) * 5)
                b = clamp(0x24 + (tex - 0.5) * 4)
                img.putpixel((x, y), (int(r), int(g), int(b), 255))

    img.save(os.path.join(OUT, 'path-tile.png'))
    print('Generated path-tile.png (64x48 cube)')

# ─── Soil tile ────────────────────────────────────────────────────────

def generate_soil_tile():
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    random.seed(99)

    for y in range(H):
        for x in range(W):
            if in_diamond(x + 0.5, y + 0.5):
                # Top face: warm brown earth with pebbles and snow patches
                n1 = smooth_noise(x * 0.12, y * 0.12)
                n2 = smooth_noise(x * 0.35 + 5, y * 0.35 + 5)
                blend = n1 * 0.6 + n2 * 0.4

                base_r, base_g, base_b = 0x5c, 0x4a, 0x38

                # Snow patches
                snow_n = smooth_noise(x * 0.3 + 20, y * 0.3 + 20)
                if snow_n > 0.6:
                    snow_amt = (snow_n - 0.6) / 0.4
                    r = clamp(base_r + snow_amt * (0xc8 - base_r))
                    g = clamp(base_g + snow_amt * (0xcc - base_g))
                    b = clamp(base_b + snow_amt * (0xd8 - base_b))
                else:
                    r = clamp(base_r + blend * 8)
                    g = clamp(base_g + blend * 8)
                    b = clamp(base_b + blend * 6)

                # Pebble dots
                peb = _hash(x * 23 + 7, y * 31 + 11)
                if peb > 0.93:
                    r = clamp(r - 12)
                    g = clamp(g - 10)
                    b = clamp(b - 8)

                tex = _hash(x * 11 + 1, y * 17 + 3)
                r = clamp(r + (tex - 0.5) * 6)
                g = clamp(g + (tex - 0.5) * 6)
                b = clamp(b + (tex - 0.5) * 4)
                img.putpixel((x, y), (int(r), int(g), int(b), 255))

            elif in_left_face(x + 0.5, y + 0.5):
                tex = _hash(x * 11 + 1, y * 17 + 3)
                r = clamp(0x3c + (tex - 0.5) * 6)
                g = clamp(0x30 + (tex - 0.5) * 6)
                b = clamp(0x28 + (tex - 0.5) * 5)
                img.putpixel((x, y), (int(r), int(g), int(b), 255))

            elif in_right_face(x + 0.5, y + 0.5):
                tex = _hash(x * 13 + 2, y * 19 + 5)
                r = clamp(0x2c + (tex - 0.5) * 5)
                g = clamp(0x20 + (tex - 0.5) * 5)
                b = clamp(0x18 + (tex - 0.5) * 4)
                img.putpixel((x, y), (int(r), int(g), int(b), 255))

    img.save(os.path.join(OUT, 'soil-tile.png'))
    print('Generated soil-tile.png (64x48 cube)')

# ─── Water tile ───────────────────────────────────────────────────────

def generate_water_tile():
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    random.seed(77)

    for y in range(H):
        for x in range(W):
            if in_diamond(x + 0.5, y + 0.5):
                # Top face: dark teal-black ice
                n1 = smooth_noise(x * 0.2, y * 0.2)
                base_r, base_g, base_b = 0x1a, 0x28, 0x32

                # Subtle shimmer lines
                shimmer = smooth_noise(x * 0.5 + 30, y * 0.1 + 30)
                if shimmer > 0.6:
                    s = (shimmer - 0.6) / 0.4
                    base_r = clamp(base_r + s * (0x1e - base_r))
                    base_g = clamp(base_g + s * (0x30 - base_g))
                    base_b = clamp(base_b + s * (0x40 - base_b))

                tex = _hash(x * 11 + 1, y * 17 + 3)
                r = clamp(base_r + (tex - 0.5) * 4)
                g = clamp(base_g + (tex - 0.5) * 4)
                b = clamp(base_b + (tex - 0.5) * 3)
                img.putpixel((x, y), (int(r), int(g), int(b), 230))

            elif in_left_face(x + 0.5, y + 0.5):
                tex = _hash(x * 11 + 1, y * 17 + 3)
                r = clamp(0x10 + (tex - 0.5) * 4)
                g = clamp(0x18 + (tex - 0.5) * 4)
                b = clamp(0x20 + (tex - 0.5) * 3)
                img.putpixel((x, y), (int(r), int(g), int(b), 230))

            elif in_right_face(x + 0.5, y + 0.5):
                tex = _hash(x * 13 + 2, y * 19 + 5)
                r = clamp(0x0c + (tex - 0.5) * 3)
                g = clamp(0x12 + (tex - 0.5) * 3)
                b = clamp(0x18 + (tex - 0.5) * 3)
                img.putpixel((x, y), (int(r), int(g), int(b), 230))

    img.save(os.path.join(OUT, 'water-tile.png'))
    print('Generated water-tile.png (64x48 cube)')

# ──────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    generate_snow_tile()
    generate_path_tile()
    generate_soil_tile()
    generate_water_tile()
    print('Done! All 64x48 cube tiles generated.')
