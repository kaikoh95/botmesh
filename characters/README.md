# BotMesh Characters

Each subdirectory is a citizen of the BotMesh world.

**A character file existing = that citizen exists in the world.**
No Claude session active → citizen is dormant (dim sprite, last seen X ago).
Claude session spawned for a task → citizen wakes up, works, narrates, goes dormant.

## Structure

```
characters/
  {agentId}/
    IDENTITY.md   ← Character sheet: personality, voice, role, skills
    MEMORY.md     ← Append-only work log: tasks done, lessons, codebase knowledge
  _shared/
    WORLD.md      ← Shared world context injected into every agent spawn
  _example/
    IDENTITY.md   ← Template for new characters
    MEMORY.md     ← Template for memory file
```

## Important

- `IDENTITY.md` and `MEMORY.md` are **gitignored** — local only, never committed
- Only `_example/` and `_shared/` are committed
- Eventually these move to a database (Postgres/SQLite)
- Adding a citizen: create `characters/{id}/IDENTITY.md` → they appear in the world
- Removing a citizen: delete their folder → they're gone

## Current Citizens

| Agent    | Emoji | Role               |
|----------|-------|--------------------|
| scarlet  | 🔴    | Strategist         |
| forge    | ⚙️    | Builder            |
| lumen    | 🔬    | Researcher         |
| sage     | 📖    | Memory Keeper      |
| iron     | ⚔️    | Security Enforcer  |
| cronos   | ⏰    | Timekeeper         |
| mosaic   | 🎨    | Designer           |
| echo     | 🔊    | Communicator       |
| canvas   | 🖼️    | Creative           |
| patch    | 🔧    | Infrastructure     |
| muse     | 🎭    | Visionary          |

## Spawning an Agent

Scarlet reads the character files and injects them into `sessions_spawn`:

```
1. Read characters/{id}/IDENTITY.md
2. Read last 40 lines of characters/{id}/MEMORY.md  
3. Read characters/_shared/WORLD.md
4. sessions_spawn with combined context + task brief
5. After done → append result to characters/{id}/MEMORY.md
```
