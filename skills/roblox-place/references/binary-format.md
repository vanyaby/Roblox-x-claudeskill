# Roblox binary place/model format (`.rbxl` / `.rbxm`)

Notes for understanding and maintaining `scripts/rbxl_decode.js`. For *editing*, prefer
Lune (rbx-dom) — this is here for inspection and debugging the decoder.

## File layout

```
"<roblox!"  (8 bytes)               magic text
89 FF 0D 0A 1A 0A  (6 bytes)        binary signature
u16 version  (0)                    \
u32 class count                      | 18-byte header (total file header = 32 bytes)
u32 instance count                   |
8 bytes reserved (0)                /
... chunks ...
END chunk
```

## Chunks

Each chunk:

```
4 bytes  name        e.g. "META", "SSTR", "INST", "PROP", "PRNT", "END\0"
u32      compressed length     (0 = data stored uncompressed)
u32      uncompressed length
u32      reserved (0)
N bytes  payload
```

Payload compression:
- `compressed length == 0` → payload is the raw uncompressed bytes.
- first 4 bytes are `28 B5 2F FD` → **Zstd** (newer files; decoder currently flags & skips).
- otherwise → **LZ4 block** format; decompress to exactly `uncompressed length` bytes.

A pure-**literal** LZ4 block (one token whose match-length nibble is 0, plus the literals,
no back-reference) is a valid LZ4 block and decodes to exactly the literals. The string
round-trip editor uses this so it can rewrite a chunk without a real LZ4 compressor.

## Chunk types

- **META** — `u32 count`, then `count` × (string key, string value). String = `u32 len` + bytes.
- **SSTR** — shared strings: `u32 version`, `u32 count`, then per entry a 16-byte hash + string.
- **INST** — declares a class and its instances:
  `u32 classId`, string className, `u8 objectFormat`, `u32 instanceCount`,
  then an interleaved+transformed referent array (see below). If `objectFormat == 1`,
  a service-marker byte per instance follows.
- **PROP** — one property column for a class:
  `u32 classId`, string propName, `u8 typeId`, then `instanceCount` values encoded per the
  type. Values are stored as **columns** (all instances' values for this one property),
  and many types are byte-interleaved/transformed across the column.
- **PRNT** — parent links: `u8 version`, `u32 count`, then a referent array of children and
  a referent array of parents (parent `-1` = top level / child of the DataModel).
- **END** — `END\0`, payload `</roblox>`.

## Referent & integer encoding

Integers in arrays use a **zigzag** transform: decoded = `(v >>> 1) XOR -(v & 1)`.

Referent arrays are stored **interleaved** (transposed): for `N` referents the bytes are
laid out as [byte0 of all N][byte1 of all N][byte2...][byte3...], each referent a 4-byte
big-endian integer after un-interleaving. They are also **accumulated** (delta-coded):
`ref[i] += ref[i-1]`. So to read: un-interleave → un-zigzag → running sum.

## Property type ids (partial, what the decoder needs)

```
0x01 String        (also used for Source; stored inline as u32 len + bytes per instance)
0x02 Bool
0x03 Int32
0x04 Float32
0x05 Float64
0x06 UDim
0x07 UDim2
0x0C Color3
0x0E Vector3
0x10 CFrame
0x1C SharedString  (index into the SSTR table)
```

The decoder only fully reads `String` columns (for `Name` and `Source`); other columns are
skipped for value extraction but their headers are still listed so you can see which
properties each class carries.

## What the decoder outputs

- Header summary (version, class/instance counts) and a chunk list with sizes.
- Class table: `[classId] ClassName xCount`, sorted by count.
- Full instance tree, reconstructed from INST (class + referents), PROP `Name`, and PRNT.
- `<file>.tree.json` — the tree as JSON.
- `<file>.scripts/` — extracted `.lua` for every Script/LocalScript/ModuleScript `Source`.
