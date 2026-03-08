# Visual PRD — Match World UI to OG Image

## Completion Criteria
The world at kurokimachi.com looks like the OG image:
- Dense packed buildings (1-2 tile gaps)
- Buildings tall/imposing vs the ground
- Warm amber window glow on all key buildings
- Dark midnight blue sky, no green bleeding
- Clean alpha on all sprites (no halos, no boxes)
- Ground shows snow/stone clearly

## Tasks (RALPH loop — pick next PENDING, complete, mark done)

- [ ] DONE: Camera bg green→#0d1520
- [ ] DONE: Sprite scale 1x→2.5x footprint width  
- [ ] DONE: Sanctum flashing removed
- [ ] DONE: Cottage magenta pixels removed (purple pillars)
- [ ] DONE: Townhall dark bg box — regenerated l1/l2/l3 clean alpha, shadows reduced
- [ ] DONE: Pack buildings tighter in seed.json — residential 1-tile gaps, commercial strip packed
- [ ] DONE: Amber window glow audit — all sprites have 9k–63k amber pixels (already solid)
- [x] DONE: Sakura sprite is summer red/orange — regen as winter (snow-covered or bare branches)
- [x] DONE: Ground tiles too checkerboard-stark — darken the light tile to reduce contrast
- [x] DONE: Building labels too small/hard to read — bumped 9px→11px, stroke 2→3, brighter color
- [x] DONE: Visual QA snapshot — Scarlet ran full checklist 2026-03-09 (see QA findings below)
- [ ] PENDING: Purple sky bleed — upper-left and behind pagoda reads magenta/purple, not pure midnight blue; shift sky bg toward #0a0e1a or deeper blue
- [ ] PENDING: Window glow too cool/blue — building interior glow is blue-tinted not amber; re-audit shoji window pixel colors or add warm overlay layer
- [ ] PENDING: Label truncation + overlap — "The Teahouse L..." cut off; building labels stack with agent names in dense left cluster; consider shorter building names or label fade-out past zoom threshold

## QA Findings (2026-03-09)
✅ Dense packed buildings — tight left cluster, small gaps  
✅ Buildings tall/imposing — pagoda dominates, excellent vertical scale  
✅ Ground snow/stone — clean checkerboard + snow transition  
✅ Clean alpha — sprites compositing well, no white halos  
✅ Building labels readable — 11px fix working, Iron's Keep / Town Plaza / Kenzo's Study all clear  
⚠️ Purple sky bleed — upper areas lean magenta, not pure midnight blue  
⚠️ Window glow too cool — interior light reads blue-white not warm amber  
⚠️ Label truncation — "The Teahouse L..." cut off; label/agent name overlap in left cluster  
ℹ️ Lower-right plaza sparse — open courtyard area vs dense upper-left; aesthetic choice, low priority  

## Progress Log
- 2026-03-09: Started RALPH visual loop. Camera bg, scale, sanctum, cottage pixels fixed.
- 2026-03-09: Building labels 9px→11px, stroke +1, brighter color. Visual QA run — 3 new PENDING tasks identified.

## How to run next RALPH iteration
1. Find next PENDING task above
2. Fix it
3. Mark as DONE
4. Run `pm2 restart ui` + check visually
5. Commit
6. Return to step 1
