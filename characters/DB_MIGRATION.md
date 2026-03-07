# Character DB Migration Plan

**Status:** Not started — characters currently live as local files  
**Target:** PostgreSQL or SQLite (decide when ready)  
**Trigger:** When we want multi-machine, shared state, or proper querying

---

## Current State (files)

```
characters/{agentId}/IDENTITY.md   ← character sheet
characters/{agentId}/MEMORY.md     ← append-only work log
characters/_shared/WORLD.md        ← injected into every spawn
```

- Gitignored — local only
- Read by Scarlet before each `sessions_spawn`
- Memory appended after each task completes

---

## Target Schema

### `characters` table
```sql
CREATE TABLE characters (
  id           TEXT PRIMARY KEY,          -- 'forge', 'lumen', etc.
  name         TEXT NOT NULL,             -- 'Forge'
  emoji        TEXT,                      -- '⚙️'
  role         TEXT,                      -- 'Builder'
  identity_md  TEXT NOT NULL,             -- full IDENTITY.md content
  sprite_path  TEXT,                      -- 'ui/assets/sprites/forge.png'
  color        TEXT,                      -- '#e67e22'
  active       BOOLEAN DEFAULT true,      -- false = citizen removed from world
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
```

### `agent_memory` table
```sql
CREATE TABLE agent_memory (
  id           SERIAL PRIMARY KEY,
  agent_id     TEXT REFERENCES characters(id),
  task_title   TEXT,
  summary      TEXT NOT NULL,             -- what was done
  lesson       TEXT,                      -- what was learned
  commit_hash  TEXT,                      -- if code was shipped
  task_date    DATE DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

### `world_context` table
```sql
CREATE TABLE world_context (
  key          TEXT PRIMARY KEY,          -- 'shared', 'buildings', etc.
  content      TEXT NOT NULL,             -- markdown content
  updated_at   TIMESTAMPTZ DEFAULT now()
);
```

---

## Migration Steps

### 1. Prep
- [ ] Decide DB: SQLite (simple, local) vs Postgres (scalable, multi-machine)
- [ ] Add DB client to project: `better-sqlite3` or `pg`
- [ ] Create schema + run migrations

### 2. Seed from files
```bash
# Script: agents/migrate-characters-to-db.js
# For each agent dir:
#   - Read IDENTITY.md → insert into characters
#   - Parse MEMORY.md entries → insert into agent_memory
#   - Read _shared/WORLD.md → insert into world_context
```

### 3. Update Scarlet's spawn flow
```
Before:  read file → inject → spawn
After:   SELECT identity_md FROM characters WHERE id = ? → inject → spawn
         SELECT summary, lesson FROM agent_memory WHERE agent_id = ? ORDER BY created_at DESC LIMIT 10
```

### 4. Update memory append
```
Before:  fs.appendFileSync(MEMORY.md, ...)
After:   INSERT INTO agent_memory (agent_id, task_title, summary, lesson, commit_hash)
```

### 5. Update State Layer citizen seeding
```
Before:  scan characters/ directory
After:   SELECT * FROM characters WHERE active = true
```

### 6. Cleanup
- [ ] Remove character files (they're now in DB)
- [ ] Keep `_example/` templates in git for reference
- [ ] Keep `_shared/WORLD.md` as fallback or move fully to DB
- [ ] Update `.gitignore` (remove character file exclusions)

---

## Notes

- **SQLite first** — simpler, no server, single file at `~/projects/botmesh/world/botmesh.db`
- **Postgres later** — when multi-machine or production-grade needed
- `world/state.json` could also migrate to DB (`world_state` table) — same trigger
- Agent memory should stay append-only in DB too — no updates, only inserts
- Consider `agent_relationships` table later: who knows who, last interaction, trust level

---

## Why Not Now

- Files work fine for single-machine local dev
- DB adds operational overhead (backups, migrations, connection management)
- Migrate when: sharing world across machines, or file management becomes painful
