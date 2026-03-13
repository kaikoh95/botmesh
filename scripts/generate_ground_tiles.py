#!/usr/bin/env python3
"""Generate pixel-art isometric CUBE ground tiles for Kurokimachi districts.
Each tile is 64×48: 64×32 top diamond + 16px tall side faces.

Tile types per Kenzo + Forge zone plan:
  snow        — sacred district (pure white-blue, Shinto aesthetic)
  stone       — castle district (dark grey fortress stone)
  soil        — craft + residential (warm earth tones)
  cobblestone — communal/market + roads (grey-warm merchant energy)
  water       — moat ring (dark teal-black ice)
  wood        — shrine platforms, pavilion decks (warm cedar planks)
"""
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
    if px >= W // 2 or py < H_TOP // 2 or py >= H:
        return False
    top_y = H_TOP // 2 + px * (H_TOP // 2) / (W // 2)
    bot_y = top_y + SIDE_H
    return top_y <= py < bot_y

def in_right_face(px, py):
    if px < W // 2 or py < H_TOP // 2 or py >= H:
        return False
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

def lerp_color(c1, c2, t):
    return tuple(clamp(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))

# ─── Snow tile — sacred district ─────────────────────────────────────

def generate_snow_tile():
    """Pure white-blue snow. Shinto karesansui aesthetic — pristine, reverent."""
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))

    for y in range(H):
        for x in range(W):
            if in_diamond(x + 0.5, y + 0.5):
                n1 = smooth_noise(x * 0.12, y * 0.12)
                n2 = smooth_noise(x * 0.35 + 10, y * 0.35 + 10)
                n3 = smooth_noise(x * 0.08 + 20, y * 0.08 + 20)
                blend = n1 * 0.4 + n2 * 0.3 + n3 * 0.3

                # Blue-white snow palette
                r = clamp(0xd6 + blend * (0xf0 - 0xd6))
                g = clamp(0xde + blend * (0xf4 - 0xde))
                b = clamp(0xee + blend * (0xfc - 0xee))

                # Subtle drift shadows (low-frequency dark patches)
                drift = smooth_noise(x * 0.06 + 50, y * 0.06 + 50)
                if drift < 0.35:
                    shadow = (0.35 - drift) / 0.35 * 0.12
                    r = clamp(r - shadow * 30)
                    g = clamp(g - shadow * 20)
                    b = clamp(b - shadow * 10)

                # Sparkle crystals
                sparkle = _hash(x * 7 + 3, y * 13 + 7)
                if sparkle > 0.95:
                    r = min(255, r + 30)
                    g = min(255, g + 28)
                    b = min(255, b + 22)

                # Subtle blue tint in recesses
                recess = _hash(x * 19 + 11, y * 23 + 13)
                if recess > 0.88:
                    b = min(255, b + 6)
                    r = max(0, r - 4)

                img.putpixel((x, y), (int(r), int(g), int(b), 255))

            elif in_left_face(x + 0.5, y + 0.5):
                tex = _hash(x * 11 + 1, y * 17 + 3)
                n = smooth_noise(x * 0.2, y * 0.2)
                r = clamp(0x7e + (tex - 0.5) * 6 + n * 4)
                g = clamp(0x8e + (tex - 0.5) * 6 + n * 4)
                b = clamp(0xa8 + (tex - 0.5) * 5 + n * 3)
                img.putpixel((x, y), (int(r), int(g), int(b), 255))

            elif in_right_face(x + 0.5, y + 0.5):
                tex = _hash(x * 13 + 2, y * 19 + 5)
                n = smooth_noise(x * 0.2, y * 0.2)
                r = clamp(0x5e + (tex - 0.5) * 5 + n * 3)
                g = clamp(0x66 + (tex - 0.5) * 5 + n * 3)
                b = clamp(0x78 + (tex - 0.5) * 4 + n * 3)
                img.putpixel((x, y), (int(r), int(g), int(b), 255))

    img.save(os.path.join(OUT, 'snow-tile.png'))
    print('Generated snow-tile.png')

# ─── Stone tile — castle district ────────────────────────────────────

def generate_stone_tile():
    """Dark grey fortress stone. Cut stone blocks with mortar lines.
    Cool-neutral palette — authority and permanence."""
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))

    # Cut stone block pattern
    block_w, block_h = 10, 7
    stone_bases = [
        (0x3a, 0x3c, 0x42), (0x3e, 0x40, 0x46), (0x36, 0x38, 0x3e),
        (0x42, 0x44, 0x4a), (0x34, 0x36, 0x3c), (0x40, 0x42, 0x48),
    ]
    mortar = (0x28, 0x2a, 0x30)

    for y in range(H):
        for x in range(W):
            if in_diamond(x + 0.5, y + 0.5):
                row = y // block_h
                offset = (row % 2) * (block_w // 2)
                col = (x + offset) // block_w
                local_x = (x + offset) % block_w
                local_y = y % block_h

                if local_x == 0 or local_y == 0:
                    # Mortar with slight variation
                    tex = _hash(x * 11, y * 17)
                    r = clamp(mortar[0] + (tex - 0.5) * 4)
                    g = clamp(mortar[1] + (tex - 0.5) * 4)
                    b = clamp(mortar[2] + (tex - 0.5) * 3)
                else:
                    base = stone_bases[(row * 5 + col * 3) % len(stone_bases)]
                    # Per-pixel noise for stone texture
                    tex = _hash(x * 11 + 1, y * 17 + 3)
                    n = smooth_noise(x * 0.25 + 7, y * 0.25 + 7)
                    r = clamp(base[0] + (tex - 0.5) * 8 + n * 6)
                    g = clamp(base[1] + (tex - 0.5) * 8 + n * 6)
                    b = clamp(base[2] + (tex - 0.5) * 6 + n * 5)

                    # Edge highlight on blocks (chisel marks)
                    if local_x == 1 or local_y == 1:
                        r = min(255, r + 5)
                        g = min(255, g + 5)
                        b = min(255, b + 4)
                    # Inner shadow near mortar
                    if local_x == block_w - 1 or local_y == block_h - 1:
                        r = max(0, r - 4)
                        g = max(0, g - 4)
                        b = max(0, b - 3)

                    # Rare crack detail
                    crack = _hash(x * 37 + 5, y * 41 + 9)
                    if crack > 0.97:
                        r = max(0, r - 10)
                        g = max(0, g - 10)
                        b = max(0, b - 8)

                img.putpixel((x, y), (int(r), int(g), int(b), 255))

            elif in_left_face(x + 0.5, y + 0.5):
                tex = _hash(x * 11 + 1, y * 17 + 3)
                r = clamp(0x28 + (tex - 0.5) * 5)
                g = clamp(0x2a + (tex - 0.5) * 5)
                b = clamp(0x30 + (tex - 0.5) * 4)
                # Block lines on side face
                if y % block_h == 0:
                    r = max(0, r - 6)
                    g = max(0, g - 6)
                    b = max(0, b - 5)
                img.putpixel((x, y), (int(r), int(g), int(b), 255))

            elif in_right_face(x + 0.5, y + 0.5):
                tex = _hash(x * 13 + 2, y * 19 + 5)
                r = clamp(0x1e + (tex - 0.5) * 4)
                g = clamp(0x20 + (tex - 0.5) * 4)
                b = clamp(0x26 + (tex - 0.5) * 3)
                if y % block_h == 0:
                    r = max(0, r - 5)
                    g = max(0, g - 5)
                    b = max(0, b - 4)
                img.putpixel((x, y), (int(r), int(g), int(b), 255))

    img.save(os.path.join(OUT, 'stone-tile.png'))
    print('Generated stone-tile.png')

# ─── Soil tile — craft + residential ─────────────────────────────────

def generate_soil_tile():
    """Warm brown earth. Packed dirt with pebbles and grass tufts.
    Honest labor, grounded — no snow patches (pure earth)."""
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))

    for y in range(H):
        for x in range(W):
            if in_diamond(x + 0.5, y + 0.5):
                n1 = smooth_noise(x * 0.12, y * 0.12)
                n2 = smooth_noise(x * 0.3 + 5, y * 0.3 + 5)
                n3 = smooth_noise(x * 0.06 + 15, y * 0.06 + 15)
                blend = n1 * 0.4 + n2 * 0.35 + n3 * 0.25

                # Warm earth base
                base_r = clamp(0x5e + blend * 16)
                base_g = clamp(0x4a + blend * 12)
                base_b = clamp(0x36 + blend * 8)

                # Darker packed dirt patches
                dark = smooth_noise(x * 0.18 + 30, y * 0.18 + 30)
                if dark < 0.3:
                    amt = (0.3 - dark) / 0.3 * 0.15
                    base_r = clamp(base_r - amt * 20)
                    base_g = clamp(base_g - amt * 18)
                    base_b = clamp(base_b - amt * 14)

                # Lighter dry earth patches
                light = smooth_noise(x * 0.15 + 40, y * 0.15 + 40)
                if light > 0.7:
                    amt = (light - 0.7) / 0.3 * 0.2
                    base_r = clamp(base_r + amt * 18)
                    base_g = clamp(base_g + amt * 14)
                    base_b = clamp(base_b + amt * 8)

                # Pebble dots
                peb = _hash(x * 23 + 7, y * 31 + 11)
                if peb > 0.93:
                    base_r = clamp(base_r - 14)
                    base_g = clamp(base_g - 12)
                    base_b = clamp(base_b - 10)
                elif peb > 0.90:
                    base_r = clamp(base_r + 8)
                    base_g = clamp(base_g + 6)
                    base_b = clamp(base_b + 4)

                # Tiny grass tufts (rare green specks)
                grass = _hash(x * 43 + 17, y * 47 + 19)
                if grass > 0.96:
                    base_r = clamp(base_r - 12)
                    base_g = clamp(base_g + 8)
                    base_b = clamp(base_b - 10)

                # Per-pixel grain
                tex = _hash(x * 11 + 1, y * 17 + 3)
                r = clamp(base_r + (tex - 0.5) * 6)
                g = clamp(base_g + (tex - 0.5) * 5)
                b = clamp(base_b + (tex - 0.5) * 4)
                img.putpixel((x, y), (int(r), int(g), int(b), 255))

            elif in_left_face(x + 0.5, y + 0.5):
                tex = _hash(x * 11 + 1, y * 17 + 3)
                n = smooth_noise(x * 0.2, y * 0.2)
                r = clamp(0x3e + (tex - 0.5) * 5 + n * 3)
                g = clamp(0x32 + (tex - 0.5) * 5 + n * 3)
                b = clamp(0x26 + (tex - 0.5) * 4 + n * 2)
                img.putpixel((x, y), (int(r), int(g), int(b), 255))

            elif in_right_face(x + 0.5, y + 0.5):
                tex = _hash(x * 13 + 2, y * 19 + 5)
                n = smooth_noise(x * 0.2, y * 0.2)
                r = clamp(0x2e + (tex - 0.5) * 4 + n * 2)
                g = clamp(0x24 + (tex - 0.5) * 4 + n * 2)
                b = clamp(0x1a + (tex - 0.5) * 3 + n * 2)
                img.putpixel((x, y), (int(r), int(g), int(b), 255))

    img.save(os.path.join(OUT, 'soil-tile.png'))
    print('Generated soil-tile.png')

# ─── Cobblestone tile — communal/market + roads ──────────────────────

def generate_cobblestone_tile():
    """Grey-warm cobblestone. Worn smooth by foot traffic.
    Rounded stones with mortar — merchant district warmth."""
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))

    # Warmer cobblestone palette than old path tile
    stone_colors = [
        (0x52, 0x4e, 0x4a), (0x56, 0x52, 0x4e), (0x4e, 0x4a, 0x46),
        (0x5a, 0x56, 0x50), (0x50, 0x4c, 0x48), (0x54, 0x50, 0x4c),
    ]
    mortar = (0x32, 0x30, 0x2c)
    stone_w, stone_h = 8, 6

    for y in range(H):
        for x in range(W):
            if in_diamond(x + 0.5, y + 0.5):
                row = y // stone_h
                offset = (row % 2) * (stone_w // 2)
                col = (x + offset) // stone_w
                local_x = (x + offset) % stone_w
                local_y = y % stone_h

                if local_x == 0 or local_y == 0:
                    # Mortar gaps
                    tex = _hash(x * 11, y * 17)
                    r = clamp(mortar[0] + (tex - 0.5) * 5)
                    g = clamp(mortar[1] + (tex - 0.5) * 5)
                    b = clamp(mortar[2] + (tex - 0.5) * 4)
                else:
                    base = stone_colors[(row * 3 + col * 7) % len(stone_colors)]
                    noise = _hash(x * 11 + 1, y * 17 + 3)
                    n = smooth_noise(x * 0.3 + 3, y * 0.3 + 3)

                    r = clamp(base[0] + (noise - 0.5) * 10 + n * 6)
                    g = clamp(base[1] + (noise - 0.5) * 10 + n * 6)
                    b = clamp(base[2] + (noise - 0.5) * 8 + n * 5)

                    # Rounded stone highlight (center brighter)
                    cx = stone_w / 2
                    cy = stone_h / 2
                    dx = abs(local_x - cx) / cx
                    dy = abs(local_y - cy) / cy
                    dist = (dx * dx + dy * dy) ** 0.5
                    if dist < 0.6:
                        bright = (0.6 - dist) / 0.6 * 6
                        r = min(255, r + int(bright))
                        g = min(255, g + int(bright))
                        b = min(255, b + int(bright))

                    # Wear marks (lighter smooth patches)
                    wear = smooth_noise(x * 0.4 + 20, y * 0.4 + 20)
                    if wear > 0.72:
                        w = (wear - 0.72) / 0.28 * 8
                        r = min(255, r + int(w))
                        g = min(255, g + int(w))
                        b = min(255, b + int(w))

                img.putpixel((x, y), (int(r), int(g), int(b), 255))

            elif in_left_face(x + 0.5, y + 0.5):
                tex = _hash(x * 11 + 1, y * 17 + 3)
                r = clamp(0x32 + (tex - 0.5) * 5)
                g = clamp(0x30 + (tex - 0.5) * 5)
                b = clamp(0x2c + (tex - 0.5) * 4)
                if y % stone_h == 0:
                    r = max(0, r - 4)
                    g = max(0, g - 4)
                    b = max(0, b - 3)
                img.putpixel((x, y), (int(r), int(g), int(b), 255))

            elif in_right_face(x + 0.5, y + 0.5):
                tex = _hash(x * 13 + 2, y * 19 + 5)
                r = clamp(0x26 + (tex - 0.5) * 4)
                g = clamp(0x24 + (tex - 0.5) * 4)
                b = clamp(0x22 + (tex - 0.5) * 3)
                if y % stone_h == 0:
                    r = max(0, r - 3)
                    g = max(0, g - 3)
                    b = max(0, b - 3)
                img.putpixel((x, y), (int(r), int(g), int(b), 255))

    img.save(os.path.join(OUT, 'cobblestone-tile.png'))
    print('Generated cobblestone-tile.png')

# ─── Water tile — moat ring ──────────────────────────────────────────

def generate_water_tile():
    """Dark teal-black ice. Frozen moat with subtle shimmer lines
    and ice crack detail. Protective, serene boundary."""
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))

    for y in range(H):
        for x in range(W):
            if in_diamond(x + 0.5, y + 0.5):
                n1 = smooth_noise(x * 0.15, y * 0.15)
                n2 = smooth_noise(x * 0.08 + 25, y * 0.08 + 25)
                base_r = clamp(0x18 + n1 * 4 + n2 * 3)
                base_g = clamp(0x26 + n1 * 6 + n2 * 4)
                base_b = clamp(0x30 + n1 * 8 + n2 * 6)

                # Diagonal shimmer lines (ice reflection)
                shimmer = smooth_noise(x * 0.5 + 30, y * 0.08 + 30)
                if shimmer > 0.6:
                    s = (shimmer - 0.6) / 0.4
                    base_r = clamp(base_r + s * 6)
                    base_g = clamp(base_g + s * 10)
                    base_b = clamp(base_b + s * 14)

                # Deep dark patches
                deep = smooth_noise(x * 0.1 + 50, y * 0.1 + 50)
                if deep < 0.3:
                    d = (0.3 - deep) / 0.3 * 0.15
                    base_r = clamp(base_r - d * 8)
                    base_g = clamp(base_g - d * 8)
                    base_b = clamp(base_b - d * 6)

                # Ice crack lines (rare bright specks)
                crack = _hash(x * 53 + 3, y * 59 + 7)
                if crack > 0.97:
                    base_r = min(255, base_r + 12)
                    base_g = min(255, base_g + 16)
                    base_b = min(255, base_b + 20)

                tex = _hash(x * 11 + 1, y * 17 + 3)
                r = clamp(base_r + (tex - 0.5) * 3)
                g = clamp(base_g + (tex - 0.5) * 3)
                b = clamp(base_b + (tex - 0.5) * 3)
                img.putpixel((x, y), (int(r), int(g), int(b), 230))

            elif in_left_face(x + 0.5, y + 0.5):
                tex = _hash(x * 11 + 1, y * 17 + 3)
                n = smooth_noise(x * 0.2, y * 0.2)
                r = clamp(0x0e + (tex - 0.5) * 3 + n * 2)
                g = clamp(0x18 + (tex - 0.5) * 3 + n * 2)
                b = clamp(0x20 + (tex - 0.5) * 3 + n * 2)
                img.putpixel((x, y), (int(r), int(g), int(b), 230))

            elif in_right_face(x + 0.5, y + 0.5):
                tex = _hash(x * 13 + 2, y * 19 + 5)
                n = smooth_noise(x * 0.2, y * 0.2)
                r = clamp(0x0a + (tex - 0.5) * 3 + n * 2)
                g = clamp(0x10 + (tex - 0.5) * 3 + n * 2)
                b = clamp(0x18 + (tex - 0.5) * 3 + n * 2)
                img.putpixel((x, y), (int(r), int(g), int(b), 230))

    img.save(os.path.join(OUT, 'water-tile.png'))
    print('Generated water-tile.png')

# ─── Wood tile — shrine platforms, pavilion decks ────────────────────

def generate_wood_tile():
    """Warm cedar planks. Amber-brown with visible grain lines.
    Engawa-style raised platforms — 'stop and sit' surfaces."""
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))

    # Plank parameters
    plank_w = 10  # isometric plank width

    for y in range(H):
        for x in range(W):
            if in_diamond(x + 0.5, y + 0.5):
                # Planks run along the isometric x-axis (diagonal)
                # Use iso-projected plank index
                plank_idx = x // plank_w
                local_x = x % plank_w

                # Per-plank base color (warm cedar variations)
                plank_hash = _hash(plank_idx * 17, 42)
                base_r = clamp(0x6e + plank_hash * 14)
                base_g = clamp(0x52 + plank_hash * 10)
                base_b = clamp(0x36 + plank_hash * 6)

                # Wood grain — horizontal streaks
                grain1 = smooth_noise(x * 0.08 + plank_idx * 7, y * 0.6)
                grain2 = smooth_noise(x * 0.04 + plank_idx * 13, y * 1.2 + 5)
                grain = grain1 * 0.6 + grain2 * 0.4

                r = clamp(base_r + (grain - 0.5) * 16)
                g = clamp(base_g + (grain - 0.5) * 12)
                b = clamp(base_b + (grain - 0.5) * 8)

                # Plank edge gaps
                if local_x == 0:
                    r = clamp(r - 20)
                    g = clamp(g - 18)
                    b = clamp(b - 14)
                elif local_x == 1:
                    # Highlight edge
                    r = min(255, r + 6)
                    g = min(255, g + 5)
                    b = min(255, b + 3)

                # Knot detail (rare dark circles)
                knot = _hash(x * 29 + 3, y * 37 + 11)
                if knot > 0.97:
                    r = max(0, r - 16)
                    g = max(0, g - 14)
                    b = max(0, b - 10)

                # Per-pixel texture
                tex = _hash(x * 11 + 1, y * 17 + 3)
                r = clamp(r + (tex - 0.5) * 4)
                g = clamp(g + (tex - 0.5) * 4)
                b = clamp(b + (tex - 0.5) * 3)
                img.putpixel((x, y), (int(r), int(g), int(b), 255))

            elif in_left_face(x + 0.5, y + 0.5):
                tex = _hash(x * 11 + 1, y * 17 + 3)
                grain = smooth_noise(x * 0.1, y * 0.5)
                r = clamp(0x48 + (tex - 0.5) * 5 + grain * 4)
                g = clamp(0x38 + (tex - 0.5) * 5 + grain * 3)
                b = clamp(0x28 + (tex - 0.5) * 4 + grain * 2)
                # Plank lines on side
                plank_idx = x // plank_w
                local_x = x % plank_w
                if local_x == 0:
                    r = max(0, r - 10)
                    g = max(0, g - 9)
                    b = max(0, b - 7)
                img.putpixel((x, y), (int(r), int(g), int(b), 255))

            elif in_right_face(x + 0.5, y + 0.5):
                tex = _hash(x * 13 + 2, y * 19 + 5)
                grain = smooth_noise(x * 0.1, y * 0.5)
                r = clamp(0x38 + (tex - 0.5) * 4 + grain * 3)
                g = clamp(0x2a + (tex - 0.5) * 4 + grain * 2)
                b = clamp(0x1e + (tex - 0.5) * 3 + grain * 2)
                plank_idx = x // plank_w
                local_x = x % plank_w
                if local_x == 0:
                    r = max(0, r - 8)
                    g = max(0, g - 7)
                    b = max(0, b - 5)
                img.putpixel((x, y), (int(r), int(g), int(b), 255))

    img.save(os.path.join(OUT, 'wood-tile.png'))
    print('Generated wood-tile.png')

# ──────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    generate_snow_tile()
    generate_stone_tile()
    generate_soil_tile()
    generate_cobblestone_tile()
    generate_water_tile()
    generate_wood_tile()
    print('Done! All 6 district ground tiles generated.')
