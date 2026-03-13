# Sprite Quality Upgrade Plan

> Improve building and character sprite quality using modern AI image generation, and add walk cycle animations for agent characters.

## Current Pipeline

### Buildings
- **Generator**: Mosaic agent, using Gemini image generation API
- **Output**: Individual PNG files saved to `ui/assets/buildings/`
- **Naming convention**: `{building-type}-l{level}.png` (e.g., `library-l1.png`, `library-l2.png`, `library-l3.png`)
- **Style**: Isometric pixel art, Japanese Edo-period winter village aesthetic
- **Style guide**: `ui/assets/buildings/SPRITE_STYLE_GUIDE.md`
- **Levels**: Each building has 1-3 level variants showing progression (bigger, more ornate)
- **Current count**: ~35 building sprites across all levels
- **Issues**: Some inconsistency in style/quality, occasional alpha artifacts, varying detail levels

### Agent Characters
- **Current**: Static PNG sprites at `ui/assets/sprites/{agent-id}.png`
- **13 agents**: scarlet, lumen, canvas, forge, sage, echo, iron, cronos, mosaic, patch, muse, planner, qa
- **Display**: Scaled to 36px tall with nearest-neighbor filtering
- **No animation**: Agents are static sprites that slide between positions

## Proposed Upgrade — Static Sprites

### Model Options

| Model | Strengths | Weaknesses | Cost |
|-------|-----------|------------|------|
| **GPT 5.4 + Image 1.5** (Chong-U's technique) | Excellent pixel art, good style consistency | Requires OpenAI API access | ~$0.04-0.08/image |
| **Gemini 2.0 Flash** (current) | Fast, cheap, decent quality | Less consistent pixel art style | ~$0.01/image |
| **DALL-E 3** | Good composition, follows prompts well | Less pixel-art-native | ~$0.04/image |
| **Stable Diffusion 3 + LoRA** | Fine-tunable for exact style, self-hosted | Setup overhead, training needed | Self-hosted cost |

### Recommended: GPT 5.4 Image 1.5 (primary) + Gemini (fallback)

Reasoning: Chong-U demonstrated this produces the best spritesheet results. Use GPT 5.4 for quality-critical sprites (buildings, characters), keep Gemini as fast/cheap fallback for experiments.

### Prompt Engineering for Consistent Isometric Japanese Pixel Art

**Base prompt template for buildings:**
```
Isometric pixel art building sprite on transparent background.
Japanese Edo-period {building_type}, winter setting with snow on roof.
{level_description}
Style: 32-bit pixel art, warm amber window glow, dark wood and stone materials.
Viewing angle: classic isometric (2:1 ratio), facing south-east.
No background, clean alpha channel, single building only.
Resolution: 256x384 pixels.
```

**Level descriptions:**
- L1: "Small, simple structure. Basic wooden construction, 1-2 stories."
- L2: "Medium, more detailed. Stone foundation, decorated eaves, 2-3 stories."
- L3: "Grand, impressive. Multi-tiered roof, ornate details, lanterns, 3+ stories."

**Consistency tips:**
1. **Seed locking**: Use the same seed for all levels of one building to maintain structural consistency
2. **Reference image**: Include L1 as reference when generating L2/L3 ("same building but upgraded")
3. **Color palette pinning**: Specify exact hex colors: dark wood (#3a2a1a), snow (#e8e8f0), amber glow (#f4a460), stone (#6b6b6b)
4. **Batch generation**: Generate all 3 levels in one session to maintain style coherence
5. **Post-processing**: Always run alpha cleanup (existing `clean.py` script) after generation

**Base prompt template for agent characters:**
```
Pixel art character sprite, front-facing, standing pose.
{character_description}
Style: 16-bit JRPG character, chibi proportions (2-3 head tall).
Japanese-inspired clothing, {color_accent} as primary color.
Transparent background, clean edges.
Resolution: 64x64 pixels.
```

**Character-specific details:**
| Agent | Color | Clothing Notes |
|-------|-------|----------------|
| Scarlet | #e74c3c red | Red haori jacket, strategic/commanding presence |
| Forge | #7f8c8d grey | Blacksmith apron, tools, sturdy build |
| Lumen | #3498db blue | Scholar robes, telescope/book accessory |
| Canvas | #9b59b6 purple | Artist's garb, paint-stained, creative |
| Sage | #27ae60 green | Librarian robes, scroll, calm demeanor |
| Iron | #e67e22 orange | Armor, enforcer stance, sword |
| Cronos | #f1c40f gold | Timekeeper robes, hourglass accessory |
| Echo | #1abc9c teal | Light flowing clothing, listener posture |
| Mosaic | #e91e63 pink | Artist/crafter, mosaic patterns on clothing |
| Patch | #795548 brown | Workman's clothes, tool belt, fixer |

## Walk Cycle Animation Plan

### The Problem
Direct AI image generation can't produce consistent multi-frame walk cycles. Frames don't align, proportions shift, animation looks janky.

### Chong-U's Solution: Video → Frame Extraction

**Pipeline:**
1. Generate a short video of the character walking using **Sora 2** (or equivalent video model)
2. Extract frames at regular intervals
3. Select best 4-8 frames for the walk cycle
4. Stitch into a horizontal spritesheet
5. Clean up individual frames (alpha, alignment, palette consistency)

### Implementation Steps

#### Step 1: Generate Walk Video
```
Prompt for Sora 2:
"Pixel art character walking cycle, side view, {character_description}.
Walking on flat ground, transparent/solid color background.
Smooth 8-frame walk cycle, chibi proportions.
Style: 16-bit JRPG. Duration: 2 seconds, looping."
```

#### Step 2: Frame Extraction
```bash
# Extract frames from video at target framerate
ffmpeg -i walk_video.mp4 -vf "fps=8" frame_%02d.png

# Or for a 2-second video targeting 8 frames:
ffmpeg -i walk_video.mp4 -vf "select='eq(n\,0)+eq(n\,3)+eq(n\,6)+eq(n\,9)+eq(n\,12)+eq(n\,15)+eq(n\,18)+eq(n\,21)'" -vsync vfr frame_%02d.png
```

#### Step 3: Spritesheet Assembly
```bash
# Stitch frames horizontally into spritesheet
# Using ImageMagick:
convert frame_*.png +append walk-spritesheet.png
```

#### Step 4: Integration with Phaser

Current `Agent.js` uses a static `scene.add.image()`. To support animation:

```javascript
// In TownScene.preload():
this.load.spritesheet(`agent-${id}-walk`, `assets/sprites/${id}-walk.png`, {
  frameWidth: 64,
  frameHeight: 64,
});

// In TownScene.create() — define animations:
this.anims.create({
  key: `${id}-walk-right`,
  frames: this.anims.generateFrameNumbers(`agent-${id}-walk`, { start: 0, end: 7 }),
  frameRate: 8,
  repeat: -1
});

// In Agent.moveTo() — play walk animation during tween:
this.body.play(`${this.id}-walk-right`);
// On tween complete:
this.body.stop();
this.body.setFrame(0); // idle frame
```

### Spritesheet Format Requirements

**Agent walk spritesheets:**
- Filename: `{agent-id}-walk.png` (e.g., `scarlet-walk.png`)
- Frame size: 64×64 pixels per frame
- Layout: Horizontal strip, 8 frames
- Directions: Start with right-facing only (flip horizontally for left)
- Location: `ui/assets/sprites/`

**Building sprites (unchanged):**
- Filename: `{building-type}-l{level}.png`
- Location: `ui/assets/buildings/`
- Single frame, no animation (for now)

### Future: Animated Building Effects

Same video→frame technique could add:
- Smoke from smithy chimney
- Flickering lanterns
- Steam from bathhouse
- Snow falling from roofs

These would be small overlay spritesheets composited on top of the static building sprite.

## Cost Estimates

### One-time sprite regeneration
| Item | Count | Cost/each | Total |
|------|-------|-----------|-------|
| Building sprites (all levels) | ~35 | ~$0.06 | ~$2.10 |
| Agent character sprites | 13 | ~$0.06 | ~$0.78 |
| Walk cycle videos (Sora 2) | 13 | ~$0.20 | ~$2.60 |
| Re-generation attempts (2x) | — | — | ~$5.48 |
| **Total** | | | **~$11** |

### Ongoing (new buildings/agents)
- New building (3 levels): ~$0.18 + cleanup time
- New agent (static + walk): ~$0.26 + cleanup time
- Negligible ongoing cost

## Migration Plan

1. **Phase 1**: Regenerate agent character sprites with GPT 5.4 Image 1.5 (quick win, most visible)
2. **Phase 2**: Generate walk cycle spritesheets, update Agent.js to support animation
3. **Phase 3**: Regenerate building sprites level-by-level (can do incrementally)
4. **Phase 4**: Add animated building effects (smoke, lights)

Each phase is independent and can ship separately.

## Risks

- **Style drift**: AI models may produce slightly different styles across sessions. Mitigate with detailed prompts, seed locking, and reference images.
- **Sora 2 access**: May need API access or waitlist. Alternative: Runway Gen-3, Pika Labs, or manually animating static sprites in Aseprite.
- **Frame alignment**: Extracted video frames may need manual alignment. Budget 5-10 min per character for cleanup.
- **Phaser migration**: Switching from `image` to `sprite` in Agent.js is straightforward but needs testing for depth sorting and container positioning.
