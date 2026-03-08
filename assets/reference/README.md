# Sprite Reference — Visual Style Guide

Place local reference photos here to steer pixel art generation. This folder is gitignored — photos stay local only.

## Aesthetic: Edo-period Japanese / Onsen Town

### Key references (add your own):
- `asakusa-gate.jpg` — Senso-ji torii gate: bold vermillion red pillars, dark heavy kawara roof, wide stone sando approach, manicured pines flanking
- `sakura-real.jpg` — Real cherry blossoms: pale blush white (not hot pink), dark bare branches VISIBLE through airy blossom clusters, drooping clusters
- `fuji.jpg` — Mount Fuji: snow-capped perfect cone, distant purple-blue atmospheric haze
- `onsen-town-canal.jpg` — Shibu Onsen promenade: stone-cut canal channel with iron railing fence, irregular flagstone path, pagoda-cap iron street lamps at intervals, bare willow trees

## Sprite Rules

- **Background**: cyan `#00FFFF` for alpha cleaning
- **Padding**: 30px transparent on all sides
- **Alpha**: binary — below 160 threshold → fully transparent
- **Scale**: isometric Edo-period, proportional to 64×32 tile grid

## What to Describe in Prompts

Don't say "Japanese style". Say exactly what you see:
- "Vermillion lacquered pillars with a wide dark grey kawara tile roof"
- "Pale blush pink cherry blossoms — almost white — with dark brown bare branches visible through the canopy"
- "Stone-cut canal walls with an iron railing fence, flanked by bare willow trees with wispy thin branches"
