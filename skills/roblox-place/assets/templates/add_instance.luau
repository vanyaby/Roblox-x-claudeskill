--!strict
-- Add a new instance (often a Script/ModuleScript) to a place.
-- usage: lune run add_instance.luau <in.rbxl> <out.rbxl> <ClassName> <Name> <ParentPath> [SourceFile]
--   ParentPath: slash-separated from the place root, first segment is a service,
--               e.g. "ServerScriptService" or "Workspace/Model".
--   SourceFile: optional; if given and the class has a Source (scripts), its contents
--               become the script body.
local roblox = require("@lune/roblox")
local fs = require("@lune/fs")
local process = require("@lune/process")

local inPath, outPath, className, name, parentPath, sourceFile = table.unpack(process.args)
assert(inPath and outPath and className and name and parentPath,
	"usage: lune run add_instance.luau <in> <out> <ClassName> <Name> <ParentPath> [SourceFile]")

local game = roblox.deserializePlace(fs.readFile(inPath))

-- Resolve "Service/Child/Grandchild" starting from the DataModel.
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

local parent = resolve(game, parentPath)
local inst = roblox.Instance.new(className)
inst.Name = name
if sourceFile then
	inst.Source = fs.readFile(sourceFile)
end
inst.Parent = parent

fs.writeFile(outPath, roblox.serializePlace(game))
print("added " .. className .. " '" .. name .. "' under " .. parentPath .. " -> " .. outPath)
