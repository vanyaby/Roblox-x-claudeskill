# Lune `roblox` API cheatsheet

Lune is a standalone Luau runtime. Its `@lune/roblox` library embeds **rbx-dom**, so it
reads and writes real Roblox files and exposes the familiar Studio-like instance API.
Run a script with `lune run script.luau [args...]`.

## Built-in libraries you'll use

```lua
local roblox  = require("@lune/roblox")  -- the DOM + datatypes
local fs      = require("@lune/fs")      -- readFile / writeFile (binary-safe)
local process = require("@lune/process") -- process.args (CLI arguments array)
```

`fs.readFile(path)` returns the raw bytes as a Luau string; `fs.writeFile(path, data)`
writes them. Roblox files are binary — that's fine, Luau strings are byte strings.

## Load and save

```lua
local game  = roblox.deserializePlace(fs.readFile("in.rbxl"))   -- place  -> DataModel
local roots = roblox.deserializeModel(fs.readFile("in.rbxm"))   -- model  -> { Instance }

fs.writeFile("out.rbxl", roblox.serializePlace(game))           -- DataModel  -> place
fs.writeFile("out.rbxm", roblox.serializeModel(roots))          -- { Instance } -> model
```

Both binary (`.rbxl`/`.rbxm`) and XML (`.rbxlx`/`.rbxmx`) inputs deserialize the same way;
the serialize functions take an options table if you need XML out:
`roblox.serializePlace(game, { xml = true })`.

## Instances — just like Studio

```lua
local part = roblox.Instance.new("Part")
part.Name = "Platform"
part.Parent = workspace

obj.Name                      -- read/write properties by name
obj.ClassName                 -- read-only
obj:GetChildren()             -- array of children
obj:FindFirstChild("Foo")     -- or nil
obj:GetDescendants()
obj:GetFullName()
obj:Clone()
obj:Destroy()                 -- remove from the tree
obj:IsA("BasePart")
game:GetService("ServerScriptService")
```

Setting `obj.Parent = nil` also detaches it; `:Destroy()` is the clean removal.

## Scripts

`Script`, `LocalScript`, and `ModuleScript` expose `.Source` as a plain string:

```lua
local s = roblox.Instance.new("Script")
s.Name = "Bootstrap"
s.Source = [[print("hello")]]
s.Parent = game:GetService("ServerScriptService")
```

## Datatypes (construct via the `roblox` table)

```lua
roblox.Vector3.new(x, y, z)
roblox.Vector2.new(x, y)
roblox.CFrame.new(x, y, z)                 -- and CFrame.lookAt, etc.
roblox.Color3.new(r, g, b)                 -- components 0..1
roblox.Color3.fromRGB(r, g, b)             -- components 0..255
roblox.UDim.new(scale, offset)
roblox.UDim2.new(xs, xo, ys, yo)
roblox.BrickColor.new("Bright red")
roblox.Enum.Material.Plastic               -- enums via roblox.Enum.<Enum>.<Item>
roblox.NumberRange.new(min, max)
```

Assign them directly: `part.Size = roblox.Vector3.new(4, 1, 8)`,
`part.Color = roblox.Color3.fromRGB(255, 0, 0)`,
`part.Material = roblox.Enum.Material.Neon`.

## Common gotchas

- **Properties are validated.** Assigning the wrong type (e.g. a number to `.CFrame`)
  errors. Match the property's real type — check Studio or rbx-dom if unsure.
- **Some properties don't round-trip** if Roblox itself doesn't serialize them. Stick to
  properties you can see saved in the file (the Node decoder lists every PROP per class).
- **No runtime.** There's no game loop, no `wait`, no services doing work — you're editing
  a document, not running it. Scripts you add won't execute here; they run when the user
  opens the place in Studio / starts the game.
- **Referents/ids are managed for you.** Unlike hand-editing the binary, you never deal
  with referent arrays — rbx-dom rebuilds them on serialize. This is why Lune is the safe
  path for adding/removing instances.
- **Paths:** there's no built-in "get by path" — walk with `GetService` for the first
  segment then `FindFirstChild` for the rest (the bundled templates include a `resolve`
  helper you can copy).

## Minimal end-to-end example

```lua
local roblox = require("@lune/roblox")
local fs = require("@lune/fs")

local game = roblox.deserializePlace(fs.readFile("place.rbxl"))
local lighting = game:GetService("Lighting")
lighting.ClockTime = 14
lighting.Brightness = 2

local folder = roblox.Instance.new("Folder")
folder.Name = "Generated"
folder.Parent = game:GetService("ReplicatedStorage")

fs.writeFile("place_edited.rbxl", roblox.serializePlace(game))
print("done")
```
