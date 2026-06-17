---
description: Start Roblox mode for this session (inspect/edit .rbxl/.rbxm via the roblox-place skill). Guides saving the file, asks for its path, then asks about backups.
---

Start "Roblox mode" for the rest of this session. Go through these steps in order.

**Step 1 — get a file to work on (with a path).**
I can't edit Studio live — I work on a saved file on disk. So first, show the user how to
get one and ask for its path:

> I work on a saved file, not the live Studio session. Point me at it:
> - If you already have a `.rbxl`/`.rbxlx`/`.rbxm`/`.rbxmx` path — just paste it.
> - If not, save one from Studio:
>   1. **File → Save to Roblox** (Ctrl+S) once, so the copy has your latest changes.
>   2. **File → Download a Copy** → choose a folder (e.g. Documents or Desktop) and save.
>      *(Newer Studio has no literal "Save to File" for cloud places — "Download a Copy"
>      is the local-save option.)*
>   3. Paste the full path to that file here.
> - Or say **"найди сам"** and I'll search common locations and let you pick.

If the user says to search, run the skill's `scripts/find_places.js`, show the candidates
newest-first, and let them choose. **Wait for a path (or a pick) before continuing.** If the
chosen file has a `.lock` next to it, warn that Studio has it open and suggest closing Studio
or downloading a fresh copy.

**Step 2 — ask about backups.**
Use AskUserQuestion with one question — "Делать бэкап перед правкой основного файла?" — and
these options:
- **"Да — бэкап, потом правка в основном файле (реком.)"** — before the first edit, run
  `node SKILL/scripts/backup.js <file>` to copy the original to a timestamped
  `*.backup-YYYYMMDD-HHMMSS.rbxl`, then write all edits back to the MAIN file in place.
- **"Нет — править основной без бэкапа"** — edit the main file in place, no backup (riskier).

Remember the choice for the session. Either way we edit the **main file** so the user keeps
opening the same file — no new output files to juggle.

**Step 3 — stay active until I run `/roblox-off` (or write "roblox off").** While active:
- Route any `.rbxl`/`.rbxlx`/`.rbxm`/`.rbxmx` work through the **roblox-place** skill.
- Edit the MAIN file **in place** (same path as input and output); if backups are ON, make
  the timestamped backup first.
- **Refuse to edit while Studio has the file open** (a `<file>.lock` exists) — tell me to
  close Studio first, otherwise the in-place write is lost on Studio's next save.
- Verify each edit afterward with the decoder.

Finally, confirm activation in one short line stating the file and the backup choice.
