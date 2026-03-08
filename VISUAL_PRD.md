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
- [ ] PENDING: Townhall dark bg box — regenerate l1/l2/l3 on solid magenta (in progress: Mosaic subagent)
- [ ] PENDING: Pack buildings tighter in seed.json — 1-2 tile gaps (in progress: layout subagent)
- [ ] PENDING: Amber window glow audit — check all sprites, regen any with <50 amber pixels
- [ ] PENDING: Sakura sprite is summer red/orange — regen as winter (snow-covered or bare branches)
- [ ] PENDING: Ground tiles too checkerboard-stark — darken the light tile to reduce contrast
- [ ] PENDING: Building labels too small/hard to read — increase font size or make optional
- [ ] PENDING: Visual QA snapshot — Canvas screenshots kurokimachi.com and compares to OG image checklist

## Progress Log
- 2026-03-09: Started RALPH visual loop. Camera bg, scale, sanctum, cottage pixels fixed.

## How to run next RALPH iteration
1. Find next PENDING task above
2. Fix it
3. Mark as DONE
4. Run `pm2 restart ui` + check visually
5. Commit
6. Return to step 1
