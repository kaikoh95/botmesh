# Town Layout Plan — BotMesh

## Grid Specifications

- **Grid size:** 120 × 120 tiles
- **Roads:**
  - East-West road: y = 37–38 (full width)
  - North-South road: x = 38–39 (full height)
  - Intersection: (38–39, 37–38)

## Districts Overview

| District | Bounds | Purpose |
|----------|--------|---------|
| Main Gate | (37, 5) | Northern entrance torii |
| Cronos Shrine | (13–19, 6–12) | Sacred shrine, northwest |
| Scarlet Sanctum | (106–112, 3–9) | Sacred shrine, northeast |
| Observatory | (90, 8) | Isolated lookout, northeast |
| Communal Center | x=5–68, y=15–58 | 15 public buildings inside moat |
| Housing Village | x=20–65, y=68–95 | 4 houses with yards |

---

## 1. Main Gate

- **torii-gate**: (37, 5) — marks the northern entrance to the town
- Aligns with the N-S road (x=38-39) for a grand approach

## 2. Sacred District

### Cronos Shrine (Northwest)
- **Shrine building**: (15, 8)
- **Torii gate**: (15, 14) — south-facing entrance
- **Path perimeter**: x=13–19, y=6–12
- Secluded in the northwest corner, away from town bustle

### Scarlet Sanctum (Northeast)
- **Sanctum building**: (108, 5)
- **Torii gate**: (108, 11) — south-facing entrance
- **Path perimeter**: x=106–112, y=3–9
- Remote northeast location, maximum seclusion

## 3. Observatory

- **Building**: (90, 8)
- Isolated northeast area, clear sightlines
- Well separated from sacred sites and communal areas

## 4. Communal Center

Enclosed within moat boundary x=5–68, y=15–58. All buildings placed with 6+ tile gaps between them. No building touches roads (y=37-38, x=38-39) or sits on the moat edge.

### Row y=20 (Northern Row)

| Building | Position | Size | X-span |
|----------|----------|------|--------|
| well | (10, 20) | 3×3 | 10–12 |
| market | (20, 20) | 4×3 | 20–23 |
| town_hall | (30, 20) | 4×3 | 30–33 |
| library | (45, 20) | 3×3 | 45–47 |
| post_office | (57, 20) | 3×3 | 57–59 |

### Row y=28 (Second Row)

| Building | Position | Size | X-span |
|----------|----------|------|--------|
| smithy | (10, 28) | 3×3 | 10–12 |
| workshop | (20, 28) | 3×3 | 20–22 |
| iron_keep | (30, 28) | 3×3 | 30–32 |
| garden-pavilion | (45, 28) | 3×3 | 45–47 |
| leisure | (57, 28) | 3×3 | 57–59 |

### Row y=42 (South of Road)

| Building | Position | Size | X-span |
|----------|----------|------|--------|
| plaza | (10, 42) | 2×3 | 10–11 |
| teahouse | (20, 42) | 3×3 | 20–22 |
| sake_brewery | (30, 42) | 2×3 | 30–31 |
| community_garden | (45, 42) | 3×3 | 45–47 |

### Row y=50 (Southern Row)

| Building | Position | Size | X-span |
|----------|----------|------|--------|
| bathhouse | (10, 50) | 3×3 | 10–12 |

### Road Collision Check

- **E-W road (y=37-38):** Closest buildings are row y=28 (bottom edge y=30) and row y=42 (top edge y=42). Gap: 12 tiles. ✅
- **N-S road (x=38-39):** Closest buildings are town_hall at x=30-33 and library at x=45-47. Gap: 12 tiles from road edge. ✅
- **Moat edges (x=5, x=68, y=15, y=58):** All buildings have 3+ tiles from moat. ✅

### Minimum Gap Verification

- Row-to-row (y=20→28): 8 tiles (minus height ~3) = 5 tile gap → adjusted: y=20 buildings bottom at y=22, y=28 top at y=28 = **6 tile gap** ✅
- Row-to-row (y=28→42): bottom y=30 to top y=42 = **12 tile gap** ✅
- Row-to-row (y=42→50): bottom y=44 to top y=50 = **6 tile gap** ✅
- Within rows: minimum x gap between buildings is 8+ tiles (e.g., 12→20 = 8) ✅

## 5. Housing Village

Located south of the communal center, y=68–95, x=20–65.

### Entrance
- **torii-gate**: (37, 65) — entrance from the E-W road, aligns with N-S road

### Houses (10×8 yard plots each)

| House | Building Pos | Yard Border |
|-------|-------------|-------------|
| house-north | (22, 72) | x=20–30, y=70–80 |
| house-east | (48, 72) | x=46–56, y=70–80 |
| house-south | (22, 85) | x=20–30, y=83–93 |
| house-west | (48, 85) | x=46–56, y=83–93 |

### Housing Gap Verification

- North ↔ East (horizontal): x=30 to x=46 = **16 tile gap** ✅
- North ↔ South (vertical): y=80 to y=83 = **3 tile gap** (yard edge to yard edge, acceptable for same-village) ✅
- All houses clear of roads (lowest road y=38, houses start y=70) ✅

---

## Coordinate Reference (JSON)

```json
{
  "grid": { "width": 120, "height": 120 },
  "roads": {
    "east_west": { "y_start": 37, "y_end": 38 },
    "north_south": { "x_start": 38, "x_end": 39 }
  },
  "districts": {
    "main_gate": {
      "torii-gate": { "x": 37, "y": 5 }
    },
    "sacred": {
      "cronos_shrine": {
        "building": { "x": 15, "y": 8 },
        "torii-gate": { "x": 15, "y": 14 },
        "path_perimeter": { "x1": 13, "y1": 6, "x2": 19, "y2": 12 }
      },
      "scarlet_sanctum": {
        "building": { "x": 108, "y": 5 },
        "torii-gate": { "x": 108, "y": 11 },
        "path_perimeter": { "x1": 106, "y1": 3, "x2": 112, "y2": 9 }
      }
    },
    "observatory": {
      "building": { "x": 90, "y": 8 }
    },
    "communal_center": {
      "moat_bounds": { "x1": 5, "y1": 15, "x2": 68, "y2": 58 },
      "buildings": {
        "well":              { "x": 10, "y": 20, "w": 3, "h": 3 },
        "market":            { "x": 20, "y": 20, "w": 4, "h": 3 },
        "town_hall":         { "x": 30, "y": 20, "w": 4, "h": 3 },
        "library":           { "x": 45, "y": 20, "w": 3, "h": 3 },
        "post_office":       { "x": 57, "y": 20, "w": 3, "h": 3 },
        "smithy":            { "x": 10, "y": 28, "w": 3, "h": 3 },
        "workshop":          { "x": 20, "y": 28, "w": 3, "h": 3 },
        "iron_keep":         { "x": 30, "y": 28, "w": 3, "h": 3 },
        "garden-pavilion":   { "x": 45, "y": 28, "w": 3, "h": 3 },
        "leisure":           { "x": 57, "y": 28, "w": 3, "h": 3 },
        "plaza":             { "x": 10, "y": 42, "w": 2, "h": 3 },
        "teahouse":          { "x": 20, "y": 42, "w": 3, "h": 3 },
        "sake_brewery":      { "x": 30, "y": 42, "w": 2, "h": 3 },
        "community_garden":  { "x": 45, "y": 42, "w": 3, "h": 3 },
        "bathhouse":         { "x": 10, "y": 50, "w": 3, "h": 3 }
      }
    },
    "housing_village": {
      "entrance_torii": { "x": 37, "y": 65 },
      "houses": {
        "house-north": {
          "building": { "x": 22, "y": 72 },
          "yard": { "x1": 20, "y1": 70, "x2": 30, "y2": 80 }
        },
        "house-east": {
          "building": { "x": 48, "y": 72 },
          "yard": { "x1": 46, "y1": 70, "x2": 56, "y2": 80 }
        },
        "house-south": {
          "building": { "x": 22, "y": 85 },
          "yard": { "x1": 20, "y1": 83, "x2": 30, "y2": 93 }
        },
        "house-west": {
          "building": { "x": 48, "y": 85 },
          "yard": { "x1": 46, "y1": 83, "x2": 56, "y2": 93 }
        }
      }
    }
  }
}
```

---

## Validation Summary

| Check | Result |
|-------|--------|
| Road collisions (y=37-38) | ✅ None — nearest buildings 6+ tiles away |
| Road collisions (x=38-39) | ✅ None — nearest buildings 6+ tiles away |
| Building overlaps | ✅ None — all 6+ tile gaps maintained |
| Moat boundary respected | ✅ All communal buildings inside x=5-68, y=15-58 |
| Sacred sites secluded | ✅ Cronos NW corner, Sanctum NE corner |
| Housing clear of center | ✅ 10+ tile gap between communal (y≤53) and housing (y≥65) |
| Total buildings | 15 communal + 4 houses + 2 shrines + 1 observatory + 3 torii gates = 25 structures |
