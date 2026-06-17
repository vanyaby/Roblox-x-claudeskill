#!/usr/bin/env node
// Locate a usable `lune` binary, downloading a pinned build if necessary.
// Prints the resolved path on the final stdout line. Progress goes to stderr.
//
// Resolution order: LUNE_BIN env var -> `lune` on PATH -> local cache -> download.
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { spawnSync, execSync } = require('child_process');

const LUNE_VERSION = '0.10.4'; // pinned for reproducibility; bump deliberately
const EXE = process.platform === 'win32' ? 'lune.exe' : 'lune';

function works(cmd) {
  const r = spawnSync(cmd, ['--version'], { stdio: ['ignore', 'ignore', 'ignore'] });
  return r.status === 0;
}

function cacheDir() {
  const base = process.env.ROBLOX_PLACE_CACHE ||
    path.join(os.homedir(), '.cache', 'roblox-place-skill');
  fs.mkdirSync(base, { recursive: true });
  return base;
}

function assetName() {
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  const osName = process.platform === 'win32' ? 'windows'
    : process.platform === 'darwin' ? 'macos' : 'linux';
  return `lune-${LUNE_VERSION}-${osName}-${arch}.zip`;
}

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 6) return reject(new Error('too many redirects'));
    https.get(url, { headers: { 'User-Agent': 'roblox-place-skill' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(download(res.headers.location, dest, redirects + 1));
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
      const f = fs.createWriteStream(dest);
      res.pipe(f);
      f.on('finish', () => f.close(() => resolve(dest)));
      f.on('error', reject);
    }).on('error', reject);
  });
}

function extract(zip, dir) {
  if (process.platform === 'win32') {
    execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dir}' -Force"`, { stdio: 'ignore' });
  } else {
    execSync(`unzip -o "${zip}" -d "${dir}"`, { stdio: 'ignore' });
  }
}

async function main() {
  // 1) explicit override
  if (process.env.LUNE_BIN && fs.existsSync(process.env.LUNE_BIN)) {
    return console.log(process.env.LUNE_BIN);
  }
  // 2) already on PATH
  if (works('lune')) return console.log('lune');
  // 3) previously cached
  const cached = path.join(cacheDir(), EXE);
  if (fs.existsSync(cached)) return console.log(cached);
  // 4) download a pinned build
  const dir = cacheDir();
  const zip = path.join(dir, 'lune.zip');
  const url = `https://github.com/lune-org/lune/releases/download/v${LUNE_VERSION}/${assetName()}`;
  process.stderr.write(`[ensure_lune] downloading Lune ${LUNE_VERSION} for ${process.platform}/${process.arch} ...\n`);
  await download(url, zip);
  extract(zip, dir);
  if (process.platform !== 'win32') { try { fs.chmodSync(cached, 0o755); } catch (_) {} }
  if (!fs.existsSync(cached)) throw new Error('extraction did not produce ' + cached);
  process.stderr.write('[ensure_lune] ready\n');
  console.log(cached);
}

main().catch((e) => { console.error('[ensure_lune] failed:', e.message); process.exit(1); });
