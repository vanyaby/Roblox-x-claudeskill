#!/usr/bin/env node
// Find saved Roblox files (.rbxl/.rbxlx/.rbxm/.rbxmx) in common locations.
// usage: node find_places.js [extraRoot ...]
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXT = new Set(['.rbxl', '.rbxlx', '.rbxm', '.rbxmx']);
const SKIP = new Set(['node_modules', '.git', 'Versions', 'versions', '$Recycle.Bin']);
const MAX_DEPTH = 6;
const home = os.homedir();
const localApp = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');

const roots = [
  process.cwd(),
  path.join(localApp, 'Roblox', 'RobloxStudio', 'AutoSaves'),
  path.join(home, 'Documents'),
  path.join(home, 'OneDrive', 'Documents'),
  path.join(home, 'Desktop'),
  path.join(home, 'OneDrive', 'Desktop'),
  ...process.argv.slice(2),
];

const found = new Map();
function walk(dir, depth) {
  if (depth > MAX_DEPTH) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP.has(e.name)) continue;
      walk(full, depth + 1);
    } else if (EXT.has(path.extname(e.name).toLowerCase())) {
      if (!found.has(full)) { try { found.set(full, fs.statSync(full)); } catch {} }
    }
  }
}
for (const r of roots) { try { if (fs.existsSync(r)) walk(r, 0); } catch {} }

const rows = [...found.entries()].sort((a, b) => b[1].mtimeMs - a[1].mtimeMs);
if (!rows.length) {
  console.log('No Roblox files found in common locations.');
  console.log('Pass a folder explicitly:  node find_places.js <dir>');
  process.exit(0);
}
console.log(`Found ${rows.length} Roblox file(s) (newest first):\n`);
for (const [p, st] of rows) {
  const kb = (st.size / 1024).toFixed(0).padStart(6);
  const when = st.mtime.toISOString().slice(0, 16).replace('T', ' ');
  const lock = fs.existsSync(p + '.lock') ? '  [open in Studio]' : '';
  console.log(`${when}  ${kb} KB  ${p}${lock}`);
}
