// Roblox binary place file (.rbxl) decoder -> dumps components/tree
// Pure Node, implements LZ4 block decompression + binary chunk parsing.
const fs = require('fs');

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const file = args.find(a => !a.startsWith('--'));
if (!file) { console.error('usage: node rbxl_decode.js <file.rbxl> [--verbose]'); process.exit(1); }
const buf = fs.readFileSync(file);

// ---------- LZ4 block decompression ----------
function lz4Decompress(src, destSize) {
  const dest = Buffer.alloc(destSize);
  let s = 0, d = 0;
  while (s < src.length) {
    const token = src[s++];
    let litLen = token >> 4;
    if (litLen === 15) { let b; do { b = src[s++]; litLen += b; } while (b === 255); }
    for (let i = 0; i < litLen; i++) dest[d++] = src[s++];
    if (s >= src.length) break;
    const offset = src[s] | (src[s + 1] << 8); s += 2;
    let matchLen = token & 0x0F;
    if (matchLen === 15) { let b; do { b = src[s++]; matchLen += b; } while (b === 255); }
    matchLen += 4;
    let p = d - offset;
    for (let i = 0; i < matchLen; i++) dest[d++] = dest[p++];
  }
  return dest;
}

// ---------- helpers ----------
function untransformInt(v) { return (v >>> 1) ^ -(v & 1); } // zigzag
function readReferentArray(data, off, count) {
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    const b0 = data[off + 0 * count + i], b1 = data[off + 1 * count + i];
    const b2 = data[off + 2 * count + i], b3 = data[off + 3 * count + i];
    const raw = ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
    out[i] = untransformInt(raw) | 0;
  }
  for (let i = 1; i < count; i++) out[i] = (out[i] + out[i - 1]) | 0;
  return { arr: out, nextOff: off + 4 * count };
}
function readString(d, o) { const len = d.readUInt32LE(o); return { s: d.toString('utf8', o + 4, o + 4 + len), next: o + 4 + len }; }

// ---------- header ----------
const sig = buf.toString('latin1', 0, 8);
if (sig !== '<roblox!') { console.error('not a binary rbxl'); process.exit(1); }
let pos = 14; // "<roblox!"(8) + magic 89 FF 0D 0A 1A 0A (6)
const version = buf.readUInt16LE(pos); pos += 2;
const classCount = buf.readUInt32LE(pos); pos += 4;
const instanceCount = buf.readUInt32LE(pos); pos += 4;
pos += 8; // reserved

// ---------- state ----------
const classes = {};   // classId -> { name, referents }
const instClass = {}; // ref -> classId
const instName = {};  // ref -> Name
const instSource = {}; // ref -> Source (script code)
const childOf = {};   // ref -> parentRef
const PROPS = {};     // classId -> [propName:typeId]
let META = [], SSTR = null;
const chunkLog = [];

// ---------- chunk loop ----------
while (pos < buf.length) {
  const rawName = buf.toString('latin1', pos, pos + 4); pos += 4;
  const name = rawName.replace(/\0/g, '');
  const compLen = buf.readUInt32LE(pos); pos += 4;
  const uncompLen = buf.readUInt32LE(pos); pos += 4;
  pos += 4; // reserved
  let data;
  if (compLen === 0) { data = buf.slice(pos, pos + uncompLen); pos += uncompLen; }
  else {
    const raw = buf.slice(pos, pos + compLen); pos += compLen;
    if (raw[0] === 0x28 && raw[1] === 0xB5 && raw[2] === 0x2F && raw[3] === 0xFD) {
      chunkLog.push(`${name}\tcomp=${compLen}\tuncomp=${uncompLen}\t[ZSTD-skip]`);
      if (name === 'END') break; else continue;
    }
    data = lz4Decompress(raw, uncompLen);
  }
  chunkLog.push(`${name}\tcomp=${compLen}\tuncomp=${uncompLen}`);

  if (name === 'META') {
    const cnt = data.readUInt32LE(0); let o = 4;
    for (let i = 0; i < cnt; i++) { const k = readString(data, o); o = k.next; const v = readString(data, o); o = v.next; META.push([k.s, v.s]); }
  } else if (name === 'SSTR') {
    SSTR = { ver: data.readUInt32LE(0), cnt: data.readUInt32LE(4) };
  } else if (name === 'INST') {
    const classId = data.readUInt32LE(0); let o = 4;
    const cn = readString(data, o); o = cn.next;
    const objFormat = data[o]; o += 1;
    const cnt = data.readUInt32LE(o); o += 4;
    const { arr } = readReferentArray(data, o, cnt); o += 4 * cnt;
    classes[classId] = { name: cn.s, referents: arr };
    for (const r of arr) instClass[r] = classId;
  } else if (name === 'PROP') {
    const classId = data.readUInt32LE(0); let o = 4;
    const pn = readString(data, o); o = pn.next;
    const typeId = data[o]; o += 1;
    // String type = 0x01 : stored inline, one per instance of the class
    if (typeId === 0x01 && classes[classId] && (pn.s === 'Name' || pn.s === 'Source')) {
      const refs = classes[classId].referents;
      const target = pn.s === 'Name' ? instName : instSource;
      for (let i = 0; i < refs.length; i++) { const st = readString(data, o); o = st.next; target[refs[i]] = st.s; }
    }
    (PROPS[classId] = PROPS[classId] || []).push(`${pn.s}(t${typeId})`);
  } else if (name === 'PRNT') {
    const cnt = data.readUInt32LE(1); let o = 5;
    const c = readReferentArray(data, o, cnt); o = c.nextOff;
    const p = readReferentArray(data, o, cnt);
    for (let i = 0; i < cnt; i++) childOf[c.arr[i]] = p.arr[i];
  } else if (name === 'END') break;
}

// ---------- report ----------
console.log('=== HEADER ===');
console.log('format version :', version);
console.log('class count    :', classCount);
console.log('instance count :', instanceCount);

if (verbose) {
  console.log('\n=== CHUNKS ===');
  for (const c of chunkLog) console.log('  ' + c);
  if (SSTR) console.log(`\n=== SSTR (shared strings) ===\n  version=${SSTR.ver} count=${SSTR.cnt}`);
}

if (META.length) {
  console.log('\n=== META ===');
  for (const [k, v] of META) console.log(`  ${k} = ${v}`);
}

const classRows = Object.entries(classes).map(([id, c]) => [c.name, c.referents.length, id]).sort((a,b)=>b[1]-a[1]);
if (verbose) {
  console.log('\n=== CLASSES (id : name x count) ===');
  for (const [nm, cnt, id] of classRows) console.log(`  [${id}] ${nm} x${cnt}`);
} else {
  const top = classRows.slice(0, 8).map(([nm, cnt]) => `${nm}×${cnt}`).join(', ');
  console.log(`\n=== CLASSES === ${classRows.length} classes  (top: ${top}${classRows.length > 8 ? ', …' : ''})`);
  console.log('   run with --verbose for the full class & chunk tables');
}

// ---------- build tree ----------
const childrenMap = {};
const roots = [];
for (const refStr of Object.keys(instClass)) {
  const ref = parseInt(refStr, 10);
  const par = childOf[ref];
  if (par === undefined || par === -1) roots.push(ref);
  else (childrenMap[par] = childrenMap[par] || []).push(ref);
}
function label(ref) {
  const cid = instClass[ref];
  const cls = cid !== undefined ? classes[cid].name : '?';
  const nm = instName[ref] !== undefined ? instName[ref] : cls;
  return `${nm} [${cls}]`;
}
console.log('\n=== INSTANCE TREE ===');
function printTree(ref, prefix, isLast) {
  console.log(prefix + (isLast ? '└─ ' : '├─ ') + label(ref));
  const kids = (childrenMap[ref] || []).sort((a,b)=>{
    const na = instName[a]||'', nb = instName[b]||''; return na.localeCompare(nb);
  });
  kids.forEach((k, i) => printTree(k, prefix + (isLast ? '   ' : '│  '), i === kids.length - 1));
}
roots.sort((a,b)=>(instName[a]||'').localeCompare(instName[b]||''));
roots.forEach((r, i) => printTree(r, '', i === roots.length - 1));

// ---------- dump script sources ----------
const srcRefs = Object.keys(instSource).map(r => parseInt(r, 10)).filter(r => instSource[r] && instSource[r].length);
if (srcRefs.length) {
  const dir = file + '.scripts';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  console.log(`\n=== SCRIPT SOURCES (${srcRefs.length}) -> ${dir} ===`);
  srcRefs.forEach((r, i) => {
    const cls = classes[instClass[r]].name;
    const nm = (instName[r] || cls).replace(/[^\w.-]/g, '_');
    const fn = `${dir}/${String(i).padStart(2,'0')}_${cls}_${nm}.lua`;
    fs.writeFileSync(fn, instSource[r]);
    console.log(`  ${cls} "${instName[r]||''}"  (${instSource[r].length} chars)`);
  });
}

// dump JSON tree too
function node(ref){ return { name: instName[ref], class: classes[instClass[ref]] && classes[instClass[ref]].name, ref, children: (childrenMap[ref]||[]).map(node) }; }
fs.writeFileSync(file + '.tree.json', JSON.stringify(roots.map(node), null, 2));
console.log(`\n[wrote JSON tree -> ${file}.tree.json]`);
