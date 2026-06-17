--!strict
-- Replace the Source (Luau code) of a script inside a place.
-- usage: lune run edit_source.luau <in.rbxl> <out.rbxl> <ScriptPath> <SourceFile>
--   ScriptPath: slash-separated from the place root, e.g.
--               "ServerScriptService/CombatServer" or
--               "StarterPlayer/StarterPlayerScripts/CombatHandler".
local roblox = require("@lune/roblox")
local fs = require("@lune/fs")
local process = require("@lune/process")

local inPath, outPath, scriptPath, sourceFile = table.unpack(process.args)
assert(inPath and outPath and scriptPath and sourceFile,
	"usage: lune run edit_source.luau <in> <out> <ScriptPath> <SourceFile>")

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

local target = resolve(game, scriptPath)
target.Source = fs.readFile(sourceFile)

fs.writeFile(outPath, roblox.serializePlace(game))
print("updated Source of " .. scriptPath .. " -> " .. outPath)
