--!strict
-- Remove (destroy) an instance from a place.
-- usage: lune run remove_instance.luau <in.rbxl> <out.rbxl> <Path>
--   Path: slash-separated from the place root, e.g. "Workspace/OldModel".
local roblox = require("@lune/roblox")
local fs = require("@lune/fs")
local process = require("@lune/process")

local inPath, outPath, objPath = table.unpack(process.args)
assert(inPath and outPath and objPath,
	"usage: lune run remove_instance.luau <in> <out> <Path>")

local game = roblox.deserializePlace(fs.readFile(inPath))

local function resolve(root: any, p: string): any
	local node = root
	local first = true
	for seg in string.gmatch(p, "[^/]+") do
		if first then
			local ok, svc = pcall(function() return root:GetService(seg) end)
			node = (ok and svc) or root:FindFirstChild(seg)
			first = false
		else
			node = node:FindFirstChild(seg)
		end
		assert(node, "path segment not found: '" .. seg .. "' in '" .. p .. "'")
	end
	return node
end

local target = resolve(game, objPath)
target:Destroy()

fs.writeFile(outPath, roblox.serializePlace(game))
print("removed " .. objPath .. " -> " .. outPath)
