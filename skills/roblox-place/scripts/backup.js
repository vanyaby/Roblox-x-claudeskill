#!/usr/bin/env node
// Make a timestamped backup of a file, next to it. Prints the backup path (last line).
// usage: node backup.js <file>
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error('usage: node backup.js <existing-file>');
  process.exit(1);
}

const d = new Date();
const p = (n) => String(n).padStart(2, '0');
const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;

const ext = path.extname(file);
const dest = file.slice(0, file.length - ext.length) + `.backup-${ts}${ext}`;
fs.copyFileSync(file, dest);
console.log(dest);
