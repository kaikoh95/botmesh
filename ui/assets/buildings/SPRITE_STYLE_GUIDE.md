# Building Sprite Style Guide

All building sprites MUST conform to this spec. No exceptions.

## Canvas

- **Size: 512 × 512 px** (square, always)
- **Padding: minimum 24px transparent margin on ALL sides**
- Building art occupies the center — never touching the edges
- RGBA PNG, transparent background

## Perspective

- **Isometric 3D** — standard 2:1 pixel ratio (26.57° angle)
- Camera looks down-right (south-east facing)
- Two visible faces: left wall (darker) + right wall (lighter) + top/roof
- Base of building forms a clean isometric diamond at the bottom of the art

## Scale Within Canvas

- Building base diamond should span roughly **60% of canvas width** (≈307px wide)
- Tall buildings (pagodas, towers) can fill up to **80% of canvas height**
- Short buildings (cottages, wells) fill roughly **50–60% of canvas height**
- The building's ground-level base should sit at roughly **y=400** (80% down the canvas)

## Art Rules

- **No baked-in shadows** — no drop shadows, no ground planes, no ambient occlusion halos
- **No guide lines, editor paths, or selection artifacts**
- **No checkerboard transparency** baked as pixels
- **Clean isometric base** — the bottom edge of the building must be a clean isometric diamond line, not irregular or soft
- Pixel art style — hard edges preferred, minimal anti-aliasing on structural lines
- Snow accumulation on rooftops is fine and encouraged

## Palette Anchors

| Element | Hex |
|---------|-----|
| Dark stone / foundation | `#2a2a3a` |
| Wood / beams | `#5c3d2e` |
| Snow on roofs | `#dce8f0` |
| Amber window glow | `#f0a030` |
| Roof tile (dark) | `#1a2a4a` |
| Roof tile (highlight) | `#2a4a6a` |

## Levels

- **Lv1** — base building, modest size
- **Lv2** — expanded, additional floor or wing
- **Lv3** — imposing, dominant presence (towers, extra tiers, ornamentation)

All levels share the same 512×512 canvas. Lv3 simply fills more of it.

## Non-Compliant Sprites (needs regen)

All previously non-compliant sprites have been regenerated as of 2026-03-09. ✅

## Compliant Sprites (keep)

| File | Notes |
|------|-------|
| keep-l1.png | 1024×1024, clean art, good base |
| townhall-l3.png | 1024×1024, pagoda, clean |
| library-l1.png | 1024×1024 |
| market-l1/l2.png | 1024×1024 |
| sanctum-l1.png | 1024×1024 |
| torii-l1.png | 1024×1024 |
| workshop-l2.png | 1024×1024 |
| postoffice-l2/l3.png | ~1024, close enough |
