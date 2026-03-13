#!/usr/bin/env python3
"""Full town restructure per Kenzo's layout plan."""
import json
import copy

# --- Config ---
HOMES_TO_REMOVE = [
    'scarlet_home', 'forge_home', 'lumen_home', 'iron_home', 'planner_home',
    'muse_home', 'cronos_home', 'mosaic_home', 'echo_home', 'canvas_home',
    'patch_home', 'sage_home'
]

# Also remove old 'torii' building (will be replaced by torii-main etc.)
BUILDINGS_TO_REMOVE = HOMES_TO_REMOVE + ['torii']

NEW_HOUSES = {
    'house-north': {'id': 'house-north', 'name': 'House North', 'type': 'house', 'x': 22, 'y': 72, 'width': 3, 'height': 2, 'level': 1},
    'house-east':  {'id': 'house-east',  'name': 'House East',  'type': 'house', 'x': 48, 'y': 72, 'width': 3, 'height': 2, 'level': 1},
    'house-south': {'id': 'house-south', 'name': 'House South', 'type': 'house', 'x': 22, 'y': 85, 'width': 3, 'height': 2, 'level': 1},
    'house-west':  {'id': 'house-west',  'name': 'House West',  'type': 'house', 'x': 48, 'y': 85, 'width': 3, 'height': 2, 'level': 1},
}

TORII_BUILDINGS = {
    'torii-main':     {'id': 'torii-main',     'name': 'Main Gate',          'type': 'torii-gate', 'x': 37, 'y': 5,  'width': 3, 'height': 2, 'level': 1},
    'torii-housing':  {'id': 'torii-housing',  'name': 'Housing Gate',       'type': 'torii-gate', 'x': 37, 'y': 65, 'width': 3, 'height': 2, 'level': 1},
    'torii-cronos':   {'id': 'torii-cronos',   'name': 'Cronos Shrine Gate', 'type': 'torii-gate', 'x': 15, 'y': 14, 'width': 3, 'height': 2, 'level': 1},
    'torii-scarlet':  {'id': 'torii-scarlet',  'name': 'Scarlet Sanctum Gate','type': 'torii-gate', 'x': 108,'y': 11, 'width': 3, 'height': 2, 'level': 1},
}

COORD_UPDATES = {
    'well':             (10, 20),
    'market':           (20, 20),
    'town_hall':        (30, 20),
    'library':          (45, 20),
    'post_office':      (57, 20),
    'smithy':           (10, 28),
    'workshop':         (20, 28),
    'iron_keep':        (30, 28),
    'garden-pavilion':  (45, 28),
    'leisure':          (57, 28),
    'plaza':            (10, 42),
    'teahouse':         (20, 42),
    'sake_brewery':     (30, 42),
    'community_garden': (45, 42),
    'bathhouse':        (10, 50),
    'cronos_shrine':    (15, 8),
    'scarlet_sanctum':  (108, 5),
    'observatory':      (90, 8),
}

# --- Moat generation ---
def generate_moat_entities():
    """Moat ring at x=5-68, y=15-58 with bridge gaps."""
    entities = []
    idx = 1
    
    # Top edge: y=15, x=5 to 68
    for x in range(5, 69):
        if x in (38, 39):  # bridge gap
            continue
        entities.append({'id': f'moat-{idx:03d}', 'entity': 'life', 'kind': 'moat', 'x': x, 'y': 15})
        idx += 1
    
    # Bottom edge: y=58, x=5 to 68
    for x in range(5, 69):
        if x in (38, 39):  # bridge gap
            continue
        entities.append({'id': f'moat-{idx:03d}', 'entity': 'life', 'kind': 'moat', 'x': x, 'y': 58})
        idx += 1
    
    # Left edge: x=5, y=16 to 57 (corners already done)
    for y in range(16, 58):
        if y in (37, 38):  # bridge gap
            continue
        entities.append({'id': f'moat-{idx:03d}', 'entity': 'life', 'kind': 'moat', 'x': 5, 'y': y})
        idx += 1
    
    # Right edge: x=68, y=16 to 57
    for y in range(16, 58):
        if y in (37, 38):  # bridge gap
            continue
        entities.append({'id': f'moat-{idx:03d}', 'entity': 'life', 'kind': 'moat', 'x': 68, 'y': y})
        idx += 1
    
    return entities

# --- Fence generation ---
def generate_fence_entities():
    """Fence perimeters around each house yard."""
    yards = [
        ('north', 20, 30, 70, 80),
        ('east',  46, 56, 70, 80),
        ('south', 20, 30, 83, 93),
        ('west',  46, 56, 83, 93),
    ]
    entities = []
    idx = 1
    
    for name, x1, x2, y1, y2 in yards:
        # Top edge
        for x in range(x1, x2 + 1):
            entities.append({'id': f'fence-{idx:03d}', 'entity': 'life', 'kind': 'fence', 'x': x, 'y': y1})
            idx += 1
        # Bottom edge
        for x in range(x1, x2 + 1):
            entities.append({'id': f'fence-{idx:03d}', 'entity': 'life', 'kind': 'fence', 'x': x, 'y': y2})
            idx += 1
        # Left edge (excluding corners)
        for y in range(y1 + 1, y2):
            entities.append({'id': f'fence-{idx:03d}', 'entity': 'life', 'kind': 'fence', 'x': x1, 'y': y})
            idx += 1
        # Right edge (excluding corners)
        for y in range(y1 + 1, y2):
            entities.append({'id': f'fence-{idx:03d}', 'entity': 'life', 'kind': 'fence', 'x': x2, 'y': y})
            idx += 1
    
    return entities


def update_buildings(buildings):
    """Remove old homes/torii, add new houses/torii, update coordinates."""
    # Remove old buildings
    for key in BUILDINGS_TO_REMOVE:
        buildings.pop(key, None)
    
    # Update coordinates of existing buildings
    for key, (x, y) in COORD_UPDATES.items():
        if key in buildings:
            buildings[key]['x'] = x
            buildings[key]['y'] = y
    
    # Add new houses
    for key, bld in NEW_HOUSES.items():
        entry = dict(bld)
        entry.setdefault('upgrades', [])
        entry.setdefault('currentWorkers', [])
        entry.setdefault('upgrading', False)
        entry.setdefault('description', '')
        buildings[key] = entry
    
    # Add torii gates as buildings
    for key, bld in TORII_BUILDINGS.items():
        entry = dict(bld)
        entry.setdefault('upgrades', [])
        entry.setdefault('currentWorkers', [])
        entry.setdefault('upgrading', False)
        entry.setdefault('description', '')
        buildings[key] = entry
    
    return buildings


def process_file(filepath, is_state=False):
    with open(filepath) as f:
        data = json.load(f)
    
    data['buildings'] = update_buildings(data['buildings'])
    
    if is_state:
        # Update entities
        entities = data.get('world', {}).get('entities', [])
        
        # Remove old moat and torii entities
        entities = [e for e in entities if e.get('kind') not in ('moat', 'torii')]
        
        # Add new moat
        entities.extend(generate_moat_entities())
        
        # Add fences
        entities.extend(generate_fence_entities())
        
        data['world']['entities'] = entities
    
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)
    
    return data


# Process both files
print("Processing seed.json...")
seed = process_file('/home/kai/projects/botmesh/world/seed.json', is_state=False)
print(f"  Buildings: {len(seed['buildings'])}")

print("Processing state.json...")
state = process_file('/home/kai/projects/botmesh/world/state.json', is_state=True)
print(f"  Buildings: {len(state['buildings'])}")

entities = state['world']['entities']
moat_count = len([e for e in entities if e.get('kind') == 'moat'])
fence_count = len([e for e in entities if e.get('kind') == 'fence'])
print(f"  Moat tiles: {moat_count}")
print(f"  Fence tiles: {fence_count}")

# Verify buildings match between seed and state
seed_keys = set(seed['buildings'].keys())
state_keys = set(state['buildings'].keys())
if seed_keys == state_keys:
    print("  ✅ Building keys match between seed.json and state.json")
else:
    print(f"  ⚠️  Mismatch! Only in seed: {seed_keys - state_keys}, Only in state: {state_keys - seed_keys}")

# Verify coordinates match
for key in seed_keys & state_keys:
    sx, sy = seed['buildings'][key]['x'], seed['buildings'][key]['y']
    tx, ty = state['buildings'][key]['x'], state['buildings'][key]['y']
    if (sx, sy) != (tx, ty):
        print(f"  ⚠️  Coord mismatch for {key}: seed=({sx},{sy}) state=({tx},{ty})")

print("\nBuilding list:")
for k, v in sorted(state['buildings'].items()):
    print(f"  {k}: ({v['x']}, {v['y']}) type={v.get('type','?')}")
