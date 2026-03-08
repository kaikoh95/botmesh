# Sprite Reference — Visual Style Guide

Place local reference photos here to steer pixel art generation. This folder is gitignored — photos stay local only.

## Aesthetic: Edo-period / Onsen Town / Shirakawa-go Rural Japan

---

## Reference Photos (local only, gitignored)

### `asakusa-gate.jpg` — Senso-ji, Tokyo
Torii/temple gate. **Bold vermillion red lacquered pillars** (not orange — pure crimson-red). Dark heavy kawara tile roof, wide and slightly upturned at corners. Open gateway — you can see through to the other side. Flanked by manicured pine trees. Stone sando (approach path) wide and clean. Very imposing proportions — width dominates, not height.
→ Use for: torii gate building sprite

### `sakura-real.jpg` — Cherry Blossoms in Bloom
Real sakura. **Pale blush pink, almost white**. Dark bare brown/grey branches clearly visible through the airy blossom clusters. NOT a solid pink mass — the branch structure shows through. Blossoms droop in dense cloud-like clusters. Large tree scale — branches spread wide.
→ Use for: sakura nature sprite

### `fuji.jpg` — Mount Fuji from Shinkansen
Perfect snow-capped cone. Distant. **Soft purple-blue atmospheric haze** at the base. Clean triangular silhouette above treeline. Wide panoramic framing.
→ Use for: background mountain / Fuji silhouette layer

### `onsen-town-canal.jpg` — Onsen Town Promenade
Flagstone promenade alongside a river channel. **Irregular polygon flagstones** (not uniform bricks) in warm grey-brown. Iron railing fence between path and water. Benches along path. **Pagoda-cap cast iron street lamps** at intervals. Bare willow trees with wispy tendrils. Mountain backdrop. Water rushing through stone-walled channel below.
→ Use for: path tiles (flagstone texture), street lamp ambient sprite, moat/canal tile

### `kanazawa-ryokan.jpg` — Grand Ryokan / Government Building (likely Kanazawa)
Large two-story traditional building. **Dark timber pillars and horizontal nuki beams** with white shikkui plaster fill between — classic Edo merchant/administrative style. Very wide, low dark kawara tile roof. Pine trees with yukitsuri rope supports (radiating ropes from top pole to support winter branches). Covered entrance gate (nagayamon). Iron decorative fence along front.
→ Use for: library, post office, or town hall facade reference. The timber/plaster contrast is key.

### `onsen-promenade-canal.jpg` — Canal Promenade from Above
Wide path alongside fast-moving river in stone-walled channel. Iron railing with dark round rail. Benches. Closed market umbrella. Bare willow trees lining the path. Mountains. Flagstone path surface clearly shows the **irregular polygon stone pattern**.
→ Use for: main boulevard texture, bench ambient details, canal water rendering

### `mountain-town-river.jpg` — Mountain Town Aerial at Dusk
River valley overview. Railway bridge with dark steel columns spanning wide rocky riverbed. Town buildings dense on hillside above. Misty forested mountains. Shows how towns organically cluster along river valleys, not on grids.
→ Use for: layout inspiration, background mountain layers

### `japanese-garden-koi.jpg` — Traditional Inn Koi Pond Garden
A true kaiyūshiki (strolling garden). Key elements visible:
- **Rounded karikomi shrubs** — densely clipped dark green mounds, rust-orange in winter
- **Stone pagoda lantern** (ishidoro) — tall, multi-tiered, carved stone
- **Koi pond** — dark water, natural irregular shoreline with large stones
- **Wooden arched bridge** — simple cedar plank bridge over pond
- **Raked white gravel** sections between shrubs and rocks
- **Large natural boulders** placed carefully at water's edge
- Background shows a green-roofed pavilion and pine trees
→ Use for: koi pond sprite (NOT a square pool — organic edge + stone lantern + bridge + shrubs), zen garden

### `shirakawa-snow.jpg` — Shirakawa-go Gassho-zukuri in Snow
THE reference for cottage architecture. **Gassho-zukuri** (合掌造り) farmhouse:
- Massive steep A-frame thatched roof — **the roof IS the building**, ~60% of total height
- Very steep pitch, almost triangular from front view
- Heavy snow accumulation on roof (thick thatch holds the shape under load)
- Small shoji windows in upper gable triangle
- Dark weathered cedar timber walls — very dark brown, almost black
- Simple rectangular lower floor, grand roof above
- Hedgerow/shrub at base
→ Use for: cottage-l1.png — MUST regenerate using this reference. Current cottages are too generic.

### `shirakawa-aerial.jpg` — Shirakawa-go Village from Viewpoint
Aerial overview of the whole village. Key observations:
- Houses **NOT on a grid** — organic placement, slight angle variations, varying sizes
- River runs through the valley, houses cluster along it
- Rice paddies/snow-covered fields between house clusters
- Main road runs through center, houses face it but irregularly
- Mountains, mist, forest surround the village completely
- Darker traditional buildings mixed with lighter modern ones
→ Use for: residential district layout inspiration — organic, not rigid rows

### `shirakawa-canal-street.jpg` — Street-level Water Channel, Shirakawa-go
The most important water reference. A narrow water channel (~1.5m wide) running between buildings:
- **Stone-edged channel walls** — rounded river stones mortared together, not cut stone
- Dark flowing water level with stone edge
- Path/road immediately alongside — cobblestone
- Gassho-zukuri building directly on the left edge of the channel (building wall meets water edge)
- Bare tree and snow patches
- Small garden elements at far end — bamboo stakes, pot plants, stones
→ Use for: moat tile / water channel rendering. Water runs RIGHT alongside buildings, not in a wide open moat. Stone-edged, intimate, urban.

### `stone-lantern-garden.jpg` — Stone Lantern and Garden Detail
Close-up of a traditional garden corner:
- **Yukimi-dōrō stone lantern** (snow-viewing lantern) — wide hexagonal cap with upturned edges, moss-covered top, carved stone body, four legs
- **Tsukubai** water basin — square carved stone basin, roughly hewn
- **Yotsumedake bamboo fence** — criss-cross bamboo lattice in background
- Large natural boulders with moss
- Bare branches of ume/plum tree
- Gravel ground surface
→ Use for: ambient cottage yard detail sprites — stone lantern, water basin. The lantern shape is very specific: wide hexagonal cap > body with carved window opening > pedestal.

---

## Priority Sprite Queue (based on these references)

1. 🏠 **cottage-l1.png** — CRITICAL regen — gassho-zukuri style (steep A-frame thatched roof, dark cedar walls)
2. 🌊 **moat/water tiles** — stone-rounded-edge channel, not open blue water
3. 🏮 **street-lamp.png** — pagoda-cap cast iron lamp post, ambient sprite
4. 🪨 **stone-lantern.png** — yukimi-dōrō style, for cottage yard ambience
5. 🌿 **koipond-l1.png** — organic shoreline + karikomi shrubs + wooden bridge + stone lantern
6. 🌳 **willow.png** — bare winter willow, wispy branches, for canal-side placement
7. 🏛️ **library / post-office** — timber + white plaster contrast (kanazawa-ryokan reference)

## Sprite Rules

- **Background**: cyan `#00FFFF` for alpha cleaning
- **Padding**: 30px transparent on all sides  
- **Alpha**: binary — below 160 threshold → fully transparent
- **Scale**: isometric top-down, proportional to 64×32 tile grid
- **Describe exactly what you see in these photos** — not "Japanese style"
