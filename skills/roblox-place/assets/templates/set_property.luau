--!strict
-- Set a single property on one instance in a place.
-- usage: lune run set_property.luau <in.rbxl> <out.rbxl> <Path> <Prop> <Value> [type]
--   Path : slash-separated from the place root, e.g. "Workspace/Baseplate".
--   type : string (default) | number | bool | vector3 | color3
--          vector3 value = "x,y,z" ; color3 value = "r,g,b" (0-255).
-- For richer datatypes (CFrame, UDim2, enums, ...) write a custom script instead;
-- see references/lune-api.md.
local roblox = require("@lune/roblox")
local fs = require("@lune/fs")
local process = require("@lune/process")

local inPath, outPath, objPath, prop, value, ty = table.unpack(process.args)
assert(inPath and outPath and objPath and prop and value ~= nil,
	"usage: lune run set_property.luau <in> <out> <Path> <Prop> <Value> [type]")
ty = ty or "string"

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

local function nums(s: string): { number }
	local out = {}
	for n in string.gmatch(s, "[^,%s]+") do
		table.insert(out, assert(tonumber(n), "not a number: " .. n))
	end
	return out
end

local target = resolve(game, objPath)
local v: any
if ty == "number" then
	v = assert(tonumber(value), "value is not a number")
elseif ty == "bool" then
	v = (value == "true" or value == "1")
elseif ty == "vector3" then
	local c = nums(value); v = roblox.Vector3.new(c[1], c[2], c[3])
elseif ty == "color3" then
	local c = nums(value); v = roblox.Color3.fromRGB(c[1], c[2], c[3])
else
	v = value
end

target[prop] = v
fs.writeFile(outPath, roblox.serializePlace(game))
print(string.format("set %s.%s = %s (%s) -> %s", objPath, prop, tostring(value), ty, outPath))
