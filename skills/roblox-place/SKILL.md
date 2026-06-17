---
name: roblox-place
description: >-
  Inspect and edit saved Roblox files (.rbxl, .rbxlx, .rbxm, .rbxmx) from the command line,
  without Roblox Studio. Use whenever the user mentions a .rbxl/.rbxlx/.rbxm/.rbxmx file or a
  Roblox AutoRecovery/AutoSave, or asks to decode, inspect, dump the tree, extract scripts,
  edit properties, rename, or add/remove objects or scripts in a Roblox place or model.
  Bundles a dependency-free Node decoder for inspection and Lune (Luau + rbx-dom) for safe editing.
---

# Roblox Place & Model Editor

Read and modify saved Roblox files (`.rbxl`, `.rbxlx`, `.rbxm`, `.rbxmx`) outside of
Roblox Studio. These files are normally an opaque, LZ4-compressed binary blob; this skill
turns them into something you can inspect as a tree and edit programmatically, then writes
a valid file back.

In examples below, `SKILL` is this skill's own directory (the folder containing this
SKILL.md). `LUNE` is the path to the Lune binary you get from `ensure_lune.js` (step 2).

## The two engines (use the right one)

- **Node decoder — `scripts/rbxl_decode.js`.** Read-only. Needs nothing but Node.js. Fast.
  Use it to *inspect* a binary `.rbxl` and to *verify* edits afterward. Cannot write.
- **Lune (Luau + rbx-dom) — via `scripts/ensure_lune.js`.** Full read/write. Use it for
  *any* edit, and to inspect `.rbxlx`/`.rbxm`/`.rbxmx` (formats the Node decoder doesn't read).

## Golden rules (read before touching a file)

1. **Back up, then edit in place (default).** The user works in ONE canonical file, so
   write edits back to the SAME path — but first make a timestamped backup beside it with
   `node SKILL/scripts/backup.js <file>` (→ `*.backup-YYYYMMDD-HHMMSS.rbxl`). The backup is
   the safety net; the main file stays the one they keep opening, so they never juggle new
   output files. Make the backup once, before the first edit of the session. (If the user
   explicitly turned backups off, edit in place without one — riskier. Writing to a separate
   output file is still available when they ask.)
2. **Never edit a file Studio has open.** If a `<file>.lock` sits beside it, Studio holds
   the file: an in-place write will be lost when Studio next saves, and won't appear in the
   open session. STOP and tell the user to close Studio (or Download a fresh copy) before
   editing in place. Read-only inspection is fine regardless.
3. **Inspect before you edit.** Run the decoder to confirm the exact tree, names, and
   paths. Guessing an instance path leads to silent no-ops.
4. **Verify after you edit.** Re-run the decoder on the *output* file and confirm the
   change landed and the instance count / tree are still sane. This is how you catch a
   corrupt write before the user does.

## Find the file first

If the user names a file, use it. If not, locate it — don't guess:

```
node SKILL/scripts/find_places.js
```

Lists Roblox files in common spots (Studio **AutoSaves**, Documents, Desktop, the current
folder), newest first, with size and modified time. A `[open in Studio]` tag means a
`.lock` is present — Studio has it open, so warn before editing. Pass extra folders as
arguments to widen the search. Confirm the target with the user before editing.

**If there's no saved file yet**, the user is probably editing live in Studio (only a locked
AutoSave exists). Tell them how to make one and ask for the path: in Studio, **File → Save to
Roblox** (Ctrl+S) to capture latest changes, then **File → Download a Copy** to save a `.rbxl`
to disk (newer Studio has no literal "Save to File" for cloud places). Then ask them to paste
the path, or offer to run `find_places.js` to locate it.

## 1. Inspect (read-only, no setup)

```
node SKILL/scripts/rbxl_decode.js <file.rbxl>
```

Prints a compact summary (format version, class/instance counts, top classes) and the full
instance tree with real names — kept lean on purpose to save tokens. Add `--verbose` only
when you actually need the full class table and chunk list. It also writes:
- `<file>.tree.json` — the tree as JSON, handy for programmatic checks.
- `<file>.scripts/` — every Script/LocalScript/ModuleScript's source as a `.lua` file.

For `.rbxlx`, `.rbxm`, or `.rbxmx`, the Node decoder won't help — use the Lune inspect
template instead (`assets/templates/inspect.luau`, see below).

## 2. Get Lune (only needed for edits)

```
node SKILL/scripts/ensure_lune.js
```

Prints the path to a ready `lune` binary on its last line. It checks, in order: the
`LUNE_BIN` env var, `lune` on PATH, a local cache, and finally downloads a pinned build for
the current OS. Capture that path and use it as `LUNE` below.

## 3. Edit

Lune runs small Luau scripts that manipulate the file with the **same API you'd use inside
Studio** (`Instance.new`, `.Name`, `.Parent`, properties), then serialize back. Bundled
parameterized templates in `assets/templates/` cover the common jobs — run them directly.

**In-place workflow (default):** back up once (`node SKILL/scripts/backup.js <file>`), then
pass the **same path** as both `<in>` and `<out>` so edits land in the main file. (Lune
reads the whole file into memory before writing, so writing back to the same path is safe.)
Run the templates like so:

| Goal | Command |
|------|---------|
| Add an object / script | `LUNE run SKILL/assets/templates/add_instance.luau <in> <out> <ClassName> <Name> <ParentPath> [SourceFile]` |
| Edit a script's code | `LUNE run SKILL/assets/templates/edit_source.luau <in> <out> <ScriptPath> <SourceFile>` |
| Set a property | `LUNE run SKILL/assets/templates/set_property.luau <in> <out> <Path> <Prop> <Value> [type]` |
| Remove an object | `LUNE run SKILL/assets/templates/remove_instance.luau <in> <out> <Path>` |
| Inspect any format | `LUNE run SKILL/assets/templates/inspect.luau <file>` |

**Instance paths** are slash-separated from the place root; the first segment is a service.
Examples: `ServerScriptService/CombatServer`, `Workspace/Model/Part`, `ReplicatedStorage/Modules/Config`.

`set_property` understands `type` values `string` (default), `number`, `bool`, `vector3`
(`"x,y,z"`), and `color3` (`"r,g,b"` as 0–255). For anything richer, write a custom script.

## 4. Custom edits — the canonical pattern

When the templates don't fit (complex datatypes, bulk/conditional changes, reparenting,
cloning), write a tiny Luau script. The shape is always:

```lua
local roblox = require("@lune/roblox")
local fs = require("@lune/fs")

local game = roblox.deserializePlace(fs.readFile("in.rbxl"))

-- manipulate `game` exactly like in Studio:
local part = game:GetService("Workspace"):FindFirstChild("Baseplate")
part.Transparency = 0.5

fs.writeFile("out.rbxl", roblox.serializePlace(game))
```

Read **`references/lune-api.md`** before writing a custom script — it lists the available
API, how to construct datatypes (Vector3, Color3, CFrame, enums), and the common gotchas.

## Limits & honesty

- Lune **edits files; it does not run the game.** To playtest behavior, the user opens the
  result in Studio.
- The Node decoder is a from-scratch reader of the binary format. It's great for inspection
  and verification, but Lune (rbx-dom) is the source of truth for writing.
- Decoded/verified ≠ opened-in-Studio. If a change is high-stakes, suggest the user opens
  the output in Studio once to confirm before relying on it.

## Keep it lean (token-aware)

The decoder's output and extracted files become tokens when you read them back, so default
to the cheapest path that answers the question:

- **Inspect compact first.** The default decoder output (summary + tree) is usually enough.
  Reach for `--verbose` only when you specifically need the chunk/class internals.
- **Don't echo whole files.** After extraction, read just the one `.lua` you need from
  `<file>.scripts/`, or grep it — don't paste every script into the conversation. For the
  structure, prefer `<file>.tree.json` over re-printing the tree.
- **Edit narrowly.** Target a specific instance path and change one thing per run rather
  than dumping or round-tripping the whole place when you don't need to.

## Reference files

- `references/lune-api.md` — the Lune `roblox` library: methods, datatype constructors,
  enums, and gotchas. Load before writing a custom Luau edit.
- `references/binary-format.md` — how the binary `.rbxl` is laid out (chunks, LZ4,
  referent encoding). Load when working on the decoder or debugging a parse.
