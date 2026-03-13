# Housing District Redesign Brief

## Current State
- 12 individual cottages (one per agent) scattered across y=70-94
- No visual perimeter or yard boundaries
- Torii gates exist in data but render as tiny 128px sprites (invisible next to 512px buildings)

## Target
- 3-4 larger shared houses with distinct character (not identical)
- Each house has a fenced/bordered yard
- Housing district has a torii gate at entrance (building-scale, not life-entity scale)
- Japanese village aesthetic — think rural Edo-period settlement

## Houses Needed
1. **North House** — larger, 2-story, accommodates ~4 agents (Scarlet, Forge, Iron, Planner)
2. **East House** — medium, traditional style, ~3 agents (Lumen, Sage, Canvas)
3. **South House** — medium, artistic flair, ~3 agents (Mosaic, Muse, Echo)
4. **West House** — small, cozy, ~3 agents (Patch, Cronos, QA)

## Sprites Required (from Mosaic)
- `house-north-l1.png` (512×512, isometric, transparent bg)
- `house-east-l1.png`
- `house-south-l1.png`
- `house-west-l1.png`
- `torii-gate-l1.png` (512×512, building-scale red torii gate)
- `yard-fence.png` (128×128, repeatable fence/wall segment for yard borders)

## Style Requirements
- Isometric pixel art, 32-bit, clean edges
- Snow-covered roofs (winter theme consistent with town)
- Japanese Edo-period residential architecture
- Each house slightly different (varying roof shapes, sizes, details)
- Warm interior glow (lantern light from windows)
- Transparent background
