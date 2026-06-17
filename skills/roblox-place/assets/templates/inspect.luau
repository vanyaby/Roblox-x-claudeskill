--!strict
-- Inspect a Roblox place OR model and print its instance tree.
-- Works for .rbxl/.rbxlx (places) and .rbxm/.rbxmx (models) alike.
-- usage: lune run inspect.luau <file>
local roblox = require("@lune/roblox")
local fs = require("@lune/fs")
local process = require("@lune/process")

local path = process.args[1]
assert(path, "usage: lune run inspect.luau <file.rbxl|.rbxlx|.rbxm|.rbxmx>")

local function walk(inst: any, depth: number)
	print(string.rep("  ", depth) .. inst.Name .. " [" .. inst.ClassName .. "]")
	for _, child in ipairs(inst:GetChildren()) do
		walk(child, depth + 1)
	end
end

local data = fs.readFile(path)
local isModel = path:match("%.rbxm$") ~= nil or path:match("%.rbxmx$") ~= nil

if isModel then
	local roots = roblox.deserializeModel(data)
	for _, root in ipairs(roots) do
		walk(root, 0)
	end
else
	local game = roblox.deserializePlace(data)
	walk(game, 0)
end
