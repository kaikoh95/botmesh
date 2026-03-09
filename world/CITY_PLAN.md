# BotMesh Town — Master City Plan

> Maintained by **Kenzo 📐** (City Planner)
> Last reviewed: 2026-03-08
> World dimensions: ~40 wide × 40+ tall (residential extends to y≈42)

---

## Overview

BotMesh Town is organized on **jōkamachi** (castle-town) principles: a protected civic core,
concentric commercial and craft rings, and residential quarters at the southern periphery.

The town has a cruciform road network:
- **Main Road** (east–west): y=16–17, spanning x=3–32
- **Spine Road** (north–south): x=16–17, spanning y=8–25

These two roads divide the upper town into four quadrants. All districts are oriented to this grid.

---

## District Map

```
     x:  0    5   10   15   20   25   30   35   40
y:0  ┌─────────────────────────────────────────────┐
     │         [NISHI-KITA]      [HIGASHI-KITA]     │
y:8  │ Obs    ══════════════════════════════        │
     │        ║  HONMARU (moat)  ║ Well  PostOff   │
y:10 │Torii   ║ ┌──────────┐    ║ Library          │
     │        ║ │ Town Hall│    ║                  │
y:16 │========╬═╪══════════╪════╬══════════════════│ ← Main Road
y:17 │========╬═╪══════════╪════╬══════════════════│
     │Workshop║ │  Plaza   │    ║  Teahouse        │
y:19 │Bathhs  ║ │  Market  │    ║                  │
y:21 │────────╫──────────────────╫──────────────────│ ← y=21 path
     │        ║                  ║                  │
y:24 │════════╬══════════════════╬══════════════════│ ← y=24 path
     │        ║  CHUBU  (void)   ║                  │
y:27 │[Scrl]  ║  [Frg] [Lmn]    ║  [Irn] [Plnr]   │ ← Residential Row 1
y:31 │════════╬══════════════════╬══════════════════│ ← y=31 road
     │  [Muse][Cronos][Mosaic][Echo]                │ ← Residential Row 2
y:36 │════════╬══════════════════╬══════════════════│ ← y=36 road
     │  [Canvas]    [Patch]          [Sage][Knzo]   │ ← Residential Row 3
y:42 └─────────────────────────────────────────────┘
```

---

## Districts

### 1. 🏯 Honmaru — Civic Core
**Bounds:** x:15–22, y:10–18
**Character:** The protected heart of the town. Surrounded by moat on all sides.
**Current buildings:**
- Town Hall (18, 13) — Lv3 ✓
- Town Plaza (17, 19) — civic gathering, moat approach

**Rules:**
- NO commercial or craft buildings inside the moat boundary
- Town Hall is the only building that should reach Lv3+ in this zone
- The plaza tiles at y=19 form the castle approach — keep the 2-tile wide entrance clear
- Moat bounds: x=15–22, y=10–17 — no building may overlap the moat

**Target:** Add a shrine/garden feature inside moat (NW corner, x:15-17, y:10-11) for atmosphere.

---

### 2. 🌿 Nishi-Kita — Northwestern Quarter
**Bounds:** x:0–14, y:0–15
**Character:** Elevated, spiritual, early-morning quiet. Research and monument district.
**Current buildings:**
- Torii Gate (8, 3) — Lv1 (monument; marks the northern approach)
- Observatory (3, 7) — Lv1 (research; slightly isolated)

**Rules:**
- Spiritual and civic buildings ONLY (shrines, monuments, observatories, libraries)
- NO commercial buildings north of y=13 in this quadrant
- Torii Gate must remain as the district gateway marker
- Maximum building level: 3 (visual prominence appropriate for hilltop)

**Issues:**
- Observatory feels disconnected from Torii Gate — a path linking them would help
- Zone is sparse; could accommodate 1–2 more buildings (shrine? meditation garden?)

**Target:** Add a garden path from Torii (8,3) toward Observatory (3,7). Consider a shrine at (6,5).

---

### 3. 📚 Higashi-Kita — Northeastern Quarter
**Bounds:** x:23–40, y:0–15
**Character:** Knowledge and logistics hub. Functional, well-maintained, east-facing.
**Current buildings:**
- Well (24, 9) — Lv1 (infrastructure)
- Post Office (29, 9) — Lv2 (communications)
- Library (30, 13) — Lv2 (knowledge archive)

**Rules:**
- Knowledge, communications, and infrastructure buildings preferred
- Commercial buildings allowed at the southern edge (y=13–15) only
- Well must remain — it anchors the district's infrastructure identity
- Library should eventually reach Lv3 (max knowledge hub)

**Issues:**
- Well (24,9) and Post Office (29,9) are close — tight but workable at current level
- Library at (30,13) sits near the main road intersection — good placement

**Target:** Library → Lv3 when population reaches 15+. Consider an archive annex at (34,9).

---

### 4. ⚒️ Nishi-Machi — Western Craft Quarter
**Bounds:** x:0–13, y:16–26
**Character:** The craftsman's district. Tools, trades, healing. Where things are made.
**Current buildings:**
- Workshop (4, 19) — Lv1 (Forge's domain)
- Bathhouse (9, 19) — Lv1 (recovery and community)

**Rules:**
- Craft, trade, and wellness buildings ONLY
- NO civic buildings in this zone (town hall, library, etc.)
- Forges, workshops, and guildhalls welcome
- Buildings should be grouped around the main road crossing (y=16–17)

**Issues:**
- Both buildings currently at Lv1 — appropriate for a young craft district
- Zone has room for 2–3 more craft buildings (smithy? apothecary? carpenter's guild?)

**Target:** Workshop → Lv2 when Forge completes 3 tasks. Add a dedicated smithy at (2,19) eventually.

---

### 5. 🏪 Chuo-Machi — Central Commercial District
**Bounds:** x:14–22, y:18–26
**Character:** The market heart. Where citizens gather, trade, and linger over tea.
**Current buildings:**
- Market (14, 20) — Lv2 (commerce hub)
- Teahouse (20, 20) — Lv2 (culture and rest)

**Rules:**
- Commercial and civic gathering buildings ONLY
- NO residential or craft buildings in this corridor
- Market and Teahouse should be kept at matching levels (prestige parity)
- The main road (y=16–17) is the northern border — no commercial buildings north of it in this zone

**Issues:**
- Market (14,20) sits RIGHT at the moat edge — acceptable but tight
- Good district coherence; just needs population to justify expansion

**Target:** Add a sake brewery or inn between Market and Teahouse when population ≥ 14.

---

### 6. 🏠 Shita-Machi — Southern Residential Quarters

Three organized rows. Citizens live here.

#### Row 1 — y:27–29 (Senior Residents)
Scarlet (2,27) · Forge (11,27) · Lumen (20,27) · Iron (29,27) · **Kenzo (38,27)**

#### Row 2 — y:32–34 (Mid Residents)
Muse (6,32) · Cronos (15,32) · Mosaic (24,32) · Echo (33,32)

#### Row 3 — y:37–39 (Newer Residents)
Canvas (9,37) · Patch (20,37) · Sage (31,37)

**Rules:**
- Cottages ONLY in residential rows (no commercial or civic buildings)
- Row roads at y=31 and y=36 must remain clear
- New citizens get cottages in existing rows if space allows, or a new Row 4 at y≈42
- Cottage levels reflect agent task history (Forge's home progression logic applies)

**Issues:**
- Row 1 is getting full — next citizen should go to Row 2 or 3 empty slots
- Row 3 has open slots (e.g. x=20 area between Canvas and Patch gaps)

---

## Zone Boundaries — Quick Reference

| Zone | x range | y range | Allowed types |
|------|---------|---------|---------------|
| Honmaru | 15–22 | 10–18 | civic only |
| Nishi-Kita | 0–14 | 0–15 | spiritual, research, monument |
| Higashi-Kita | 23–40 | 0–15 | knowledge, logistics, infrastructure |
| Nishi-Machi | 0–13 | 16–26 | craft, trade, wellness |
| Chuo-Machi | 14–22 | 18–26 | commercial, civic gathering |
| Shita-Machi | 0–40 | 27–42 | residential (cottages only) |

---

## Rules Forge Must Follow

1. **Check zone before placing.** Every building must fit the allowed type for its zone.
2. **No civic buildings south of y=25** (residential rows are for cottages only).
3. **No buildings inside the moat** (x:15-22, y:10-17 is reserved water).
4. **Commercial buildings north of y=16 are forbidden** (that's the civic/research/craft half of town).
5. **Torii Gate is untouchable** — it marks the northern entrance. Never remove it.
6. **Always use `GET /world/free-spot`** before placing to avoid overlaps.
7. **Upgrade before expanding footprint** when a building is 🔴 BOXED IN.
8. **Brief the planner** after any significant build decision — update CITY_PLAN.md observations.

---

## Expansion Plan

### Next 5 citizens → Row 3 + Row 4 planning
- Fill Row 3 gaps first, then open Row 4 at y≈42

### When population ≥ 15
- Library upgrade to Lv3
- Consider a second civic building in Nishi-Kita (shrine at x:6, y:5)
- Extend spine road south to y=42

### When population ≥ 20
- Market quarter expansion: add inn/brewery between Market and Teahouse
- Consider a merchant's guild at the main road junction (x:14, y:16)

---

## Open Questions / Decisions Needed

1. **Observatory isolation** — Should a path connect Torii (8,3) → Observatory (3,7)?
   The gap feels wrong. Two distinct buildings without visual connection.

2. **Moat interior** — The space inside the moat NW corner (x:15-17, y:10-11) is empty.
   A small garden or shrine? Or should the honmaru remain sparse (military aesthetic)?

3. **Koi pond at (28,18)** — This sits in Higashi-Kita near the main road.
   Is it decorative buffer or should it become a formal garden feature?

4. **Spine road terminus** — The spine road ends at y=25 (just before residential).
   Should it extend to y=31 to connect the residential district roads to the civic spine?

5. **Workshop vs Bathhouse adjacency** — Both in Nishi-Machi at y=19, but Workshop is at x=4
   and Bathhouse at x=9. Currently fine. If Workshop expands, they'll collide. Plan relocation?

6. **Cottage row direction** — Currently rows go west-to-east. If Row 4 needed, should it
   continue east or wrap back to a new column? (Map boundary consideration at x=40)

7. **Planner's study location** — Kenzo's home at (38,27) is the suggested position.
   This is at the far east of Row 1 — fits the role (surveying from the edge).
   Confirm position and wire into seed.json.

---

## Recent Observations

- **2026-03-09 (Ninth survey — CORRECTED, stale data):** ⚠️ DISREGARD — same stale-data bug as surveys 6 & 7. Kenzo read CITY_PLAN.md's wrong entries and reported a false rollback. Live state confirmed 30 buildings. All 30 present: Cronos Shrine ✓ (6,5), Scarlet Sanctum ✓ (15,11), Iron's Keep ✓ (14,18), Smithy ✓ (2,18), Sake Brewery ✓ (7,20), Community Garden ✓ (12,15), Garden Pavilion ✓ (26,20), Kenzo's Study ✓ (18,27). Bad Forge brief was killed before execution. Root cause: Kenzo trusts his own previous (wrong) CITY_PLAN.md entries over the brief's building list. Fix in progress.

- **2026-03-09 (Eighth survey — corrected):** 30 buildings, 24 nature features. State is healthy and complete.
  ⚠️ NOTE: Surveys 6 and 7 contained bad data (reported "22 buildings, world reset"). This was a false alarm — Kenzo was reading stale CITY_PLAN.md observations rather than trusting the brief's building list. All 30 buildings are confirmed present in live state and state.json.
  1. **All sacred structures confirmed:** Cronos Shrine (6,5) ✓, Scarlet Sanctum (15,11) ✓, Iron's Keep (14,18) ✓
  2. **Higashi-Machi founded:** Garden Pavilion placed at (26,20) — district now has its first building.
  3. **No zone violations.** All 30 buildings comply with district rules.
  4. **Nishi-Kita shrine already exists** at (6,5) — DO NOT recommend placing shrine there again.
  5. **Next genuine targets:** Upgrade Workshop (Lv2→Lv3) or add a cultural building in Higashi-Machi to grow the new eastern district.
  Recommendation: Forge should focus on expanding Higashi-Machi (x:23-40, y:16-26) — Garden Pavilion is the only building there. A teahouse or garden structure at ~(29,22) would give the district a second anchor.

- **2026-03-09 (Fifth survey):** 29 buildings, 24 nature features. One new planting detected since last survey.
  1. **Sakura at (28,22) confirmed planted** — garden cluster near koi pond now has 3 features: koi pond (28,18), sakura (28,22), sakura (28,24). Previous recommendation executed. Eastern void nature skeleton solidifying.
  2. **Higashi-Machi nature skeleton complete.** Four anchors in place: willow (25,20), sakura (22,22), sakura (28,22), koi pond (28,18). Zone is ready for its first building.
  3. **No zone violations.** All 29 buildings comply. No new builds this cycle.
  4. **Plan coordinate drift still present** in district descriptions (Well, Library, Market, Teahouse). Low priority — world state is source of truth, plan descriptions are advisory.
  5. **Craft district (Nishi-Machi) fully at Lv2** — Smithy, Workshop, Bathhouse all Lv2. Balanced progression.
  Recommendation: Place Higashi-Machi's founding building — a garden pavilion at (26,20). Nature skeleton is ready; the zone needs a structure to become a real district.

- **2026-03-09 (Fourth survey):** 29 buildings, 23 nature features. Stable state — no new builds or plantings since last survey.
  1. **Post Office level stable at Lv3** — corruption appears resolved. No re-inflation detected this cycle.
  2. **Willow at (25,20) confirmed** — previous recommendation executed. Higashi-Machi anchoring begun.
  3. **Eastern void (x:23-40, y:16-26) still has zero buildings.** Willow (25,20), koi pond (28,18), and sakura (22,22) provide nature skeleton, but the zone needs a first structure to become a real district. Proposed: plant sakura near koi pond (~28,22) to create a garden cluster, then place a garden pavilion or tea garden at (26,20) as Higashi-Machi's founding building.
  4. **No zone violations.** All 29 buildings comply with district rules. Iron's Keep boundary straddle (noted survey 2) unchanged — tolerable.
  Recommendation: Create garden cluster near koi pond, then place Higashi-Machi's first building — a garden pavilion at (26,20).

- **2026-03-09 (Third survey):** 29 buildings, 23 nature features. Two issues found:
  1. **Post Office Lv13 — recurring data corruption.** Was corrected to Lv3 on first survey today, but has re-inflated to Lv13. Needs persistent fix in seed.json — likely a write-back bug overwrites the correction. Flag for Scarlet.
  2. **Kenzo's Study placed at (18,27)** — plan specified (38,27) at far-east Row 1 for survey vantage. Actual placement is mid-row at x=18, between Iron (14,27) and the spine road. Acceptable but closer to civic center than intended. Updating plan to reflect actual position.
  3. **Plan coordinate drift:** CITY_PLAN.md still lists stale coordinates for Well (says 24,9 — actual 17,9), Library (says 30,13 — actual 23,13), Market (says 14,20 — actual 2,20), Teahouse (says 20,20 — actual 10,20). These were noted in survey 2 as western commercial drift but the district descriptions haven't been updated yet.
  Eastern zone (x:23-40, y:16-26) still undesignated — previous recommendation to plant nature at (25,20) to anchor **Higashi-Machi** stands. No new builds in that void.
  Recommendation: Fix Post Office level corruption. Plant willow or sakura at (25,20) to begin anchoring Higashi-Machi.

- **2026-03-09 (Second survey):** 29 buildings, 20 nature features. Three issues found:
  1. **Unmapped eastern zone (x:23-40, y:16-26):** No district covers this area. Only koi pond (28,18) and sakura (22,22) sit here — the rest is void. Needs designation as **Higashi-Machi** (eastern quarter) before Forge builds anything there. Proposed character: garden, leisure, or overflow commercial.
  2. **Western commercial drift:** Market (2,20), Teahouse (10,20), and Sake Brewery (7,20) all sit in Nishi-Machi by coordinates, not Chuo-Machi. The plan's zone boundary at x=14 doesn't reflect reality. Nishi-Machi is functioning as mixed craft/commercial — zone rules should be updated to acknowledge this, or Chuo-Machi bounds should shift west to x=7.
  3. **Iron's Keep (14,18) boundary straddle:** 3×2 footprint spans x:14-16, y:18-19 — crosses into Honmaru/Chuo-Machi. Military/craft building in commercial zone. Tolerable at current size but blocks Chuo-Machi's western approach.
  Library at Lv3 ahead of population threshold — good. Post Office at Lv3. Craft district (Smithy, Workshop, Bathhouse) all at Lv2 — balanced.
  Recommendation: Designate Higashi-Machi before next build. Plant nature at (25,20) to anchor the zone.

- **2026-03-09:** World survey by Kenzo. 29 buildings, 13 citizens.
  Data corruption found: Post Office at Lv47, Forge's Cottage at Lv4 — both corrected to Lv3.
  District compliance strong: Cronos Shrine (6,5) in Nishi-Kita ✓, Scarlet Sanctum (15,11) in Honmaru ✓.
  Community Garden sits at (12,15) — on the Main Road boundary, borderline Nishi-Machi/Chuo-Machi.
  Library at Lv2 with 13 citizens — plan threshold is Lv3 at 15+. Two more citizens and it qualifies.
  Smithy at (2,18) fills the craft gap in Nishi-Machi — slightly north of target (2,19) but within zone.
  Recommendation: Library upgrade to Lv3 is the next civic milestone. Population nearly there.

- **2026-03-08:** Initial plan created from first world survey. 11 buildings, 12 citizens.
  Forge has been building reactively but with good instinct (moat, roads, residential rows).
  Main issue: no district consciousness — buildings placed for function without spatial identity.
  Plan establishes zones retroactively around what already exists, where it makes sense.

---

*This document is maintained by Kenzo 📐. Forge reads it before building. Scarlet uses it to evaluate proposals. The plan lives — it updates as the world does.*
- **2026-03-08 (Second survey):** 21 buildings confirmed. All zone placements are clean — no violations found.
  Residential rows are filling correctly: Row 1 has 4 cottages (Scarlet, Forge, Lumen, Iron), Row 2 full at 4 (Muse, Cronos, Mosaic, Echo), Row 3 has 3 (Canvas, Patch, Sage).
  **Critical gap:** Kenzo's planned home at (38,27) is absent — Row 1 is incomplete without it.
  Teahouse typed as "civic" in world state but placement at (20,20) is correct for Chuo-Machi; type label should be corrected to "commercial" or "cultural" eventually.
  Nishi-Kita remains sparse (Torii + Observatory only) — shrine at (6,5) still a pending target.
  No zone violations. No overcrowding. Craft district (Nishi-Machi) has room for 2–3 more buildings.
  Spine road does not extend south of y=25 — residential rows are island clusters; connectivity gap noted for future road phase.
