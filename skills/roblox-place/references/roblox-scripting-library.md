# Roblox Luau — сводка функций с примерами

Краткая выжимка из базы знаний Roblox DevForum (объединены два файла:
`roblox_scripting_knowledge_base.txt` — секции 1–6, и `...(1).txt` — то же + секция 7
«Advanced Combat»: огнестрел, вьюмодели, сеть, VFX). Каждый пример — **реальный код из
файла** (verbatim или с минимальной чисткой), с указанием источника. Ничего не додумано:
только то, что есть в распарсенных блоках кода.

> **Как навигировать (для ИИ):** все API-имена и сигнатуры — латиницей, поэтому
> грепай файл по англ. имени (`GetPartsInPart`, `LinearVelocity`, `ViewportPointToRay`…).
> Не знаешь, где искать — начни со **Шпаргалки «симптом → фикс»** (lookup по багу),
> затем перейди в нужный раздел по таблице ниже. Каждый сниппет подписан источником.

## Навигация

| Раздел | Когда сюда | Ключевые имена для грепа |
|---|---|---|
| Хитбоксы (spatial queries) | детект попаданий, AoE, дедуп урона | `GetPartsInPart` `GetPartBoundsInBox` `OverlapParams` `Blockcast` |
| Урон и нокбэк | нанести урон, отбросить, затухание | `TakeDamage` `HealthChanged` `LinearVelocity` `getDamageFactor` |
| Комбо-системы | M1-цепочки, окна, мульти-кнопки | `os.clock` `attackId` `comboPatterns` |
| Анимации | загрузка, маркеры, префетч, идлы | `LoadAnimation` `GetMarkerReachedSignal` `PreloadAsync` |
| Рейкастинг | лучи, пробитие, подвеска | `workspace:Raycast` `RaycastParams` `AddToFilter` |
| Камера | режимы, тряска, пружина | `CameraMode` `BindToRenderStep` `CameraShaker` |
| Ввод / мобильные кнопки | клавиши, тач, отвязка | `UserInputService` `InputBegan` `ContextActionService` |
| Сеть / хитбоксы при пинге | компенсация пинга, репликация NPC | `GetNetworkPing` `Lerp` `Heartbeat` `FireAllClients` |
| Анти-чит / HTTP | детект эксплойтов, запросы, секреты | `FindService` `RequestAsync` `GetSecret` |
| UI / эффекты | твины, Безье, градиент | `TweenService` `quadBezier` `UDim2` |
| Вьюмодели (FPS) | руки от 1-го лица, клиппинг, ADS | `ScaleTo` `Highlight` `PivotTo` `GetMouseDelta` |
| Огнестрел (raycast-пушки) | пушки, разброс, отдача, валидация | `ViewportPointToRay` `ScreenPointToRay` `OnServerEvent` |
| Продвинутая сеть и лаг-компенсация | батчинг, whitelisting, rewind | `FireAllClients` `OnClientEvent` `Graphite` `SecureCast` |
| VFX (визуальные эффекты) | способности, снаряды | `InputBegan` `SimpleCast` `OnCastHit` |
| API-вызовы готовых модулей | как звать ShapecastHitbox и др. | `ShapecastHitbox` `HitboxClass` `RagdollService` |
| Шпаргалка «симптом → фикс» | быстрый lookup по конкретному багу | — |
| Полные ссылки на модули | URL на DevForum | — |

---

## Хитбоксы (spatial queries)

**Урон каждому один раз + не бить себя** — `GetPartsInPart` + дедуп-таблица.
Источник: ISSUE «Stop hitbox from damaging the user» (neweve2323).
```lua
function HitboxHandler.Damage(Damage, character)        -- передаём владельца хитбокса
    for _, v in workspace:GetPartsInPart(newHitbox) do
        if v.Parent:FindFirstChild("Humanoid") and character ~= v.Parent then
            v.Parent.Humanoid:TakeDamage(Damage)
            break
        end
    end
end
```

**Урон по area один раз** (несколько частей одной модели не дают двойной урон).
Источник: ISSUE «How to damage players inside of a part once» (talis783) + дедуп из
«Detecting multiple parts of a rig» (supercronter4).
```lua
local touching = workspace:GetPartsInPart(game.Workspace.Test)
local damagedHums = {}
for _, v in pairs(touching) do
    local hum = v.Parent:FindFirstChild("Humanoid")
    if hum and not damagedHums[hum] then
        hum:TakeDamage(50)
        damagedHums[hum] = true
    end
end
```

**OverlapParams (blacklist)** — кого игнорировать. Источник: «Detecting multiple parts».
```lua
local op = OverlapParams.new()
op.FilterType = Enum.RaycastFilterType.Blacklist
op.FilterDescendantsInstances = { workspace.Ignore, character }
local hitparts = workspace:GetPartsInPart(hitbox, op)
```

**Хитбокс варит к HumanoidRootPart** (типичная установка). Источник: ISSUE «Hitbox issue plz help» (drixlord).
```lua
local hitbox = Instance.new("Part", Fx)
hitbox.CanCollide, hitbox.CanTouch, hitbox.Massless = false, true, true
hitbox.CFrame = char.HumanoidRootPart.CFrame * CFrame.new(0,0,-2)   -- перед игроком
local weld = Instance.new("WeldConstraint", hitbox)
weld.Part0, weld.Part1 = char.HumanoidRootPart, hitbox
```
> Грабли: `Humrp * CFrame.new(...)` — ошибка, нужно `Humrp.CFrame * CFrame.new(...)`
> (ISSUE «hitbox not connecting», endsword_1).

**Blockcast** — нельзя нулевой direction. Источник: ISSUE «Hitboxes using block casts» (Ask_Allow).
```lua
local result = workspace:Blockcast(self.origin, self.size, Vector3.zero, self.params)
-- ^ не работает с Vector3.zero → бери маленький, но НЕ нулевой вектор
```

---

## Урон и нокбэк

**Детект «получил урон» (а не лечение).** Источник: ISSUE «detect if a player took damage» (StrongBigeMan9).
```lua
local oldHealth = Humanoid.Health
Humanoid.HealthChanged:Connect(function(newHealth)
    if newHealth < oldHealth then
        warn(player.Name.." took "..(oldHealth-newHealth).." damage")
    end
    oldHealth = newHealth                      -- обязательно обновлять
end)
```

**Затухание урона по дистанции (dropoff).** Источник: ISSUE «Advanced Damage-Dropoff» (Ziffixture).
```lua
local function getDamageFactor(distance, dropOff)        -- distance,dropOff в 0..1
    if distance >= 1 and dropOff >= 1 then return 0 end
    return math.clamp((1 - distance) / (1 - dropOff), 0, 1)
end
```
Базовая формула взрыва (с обязательным clamp, иначе на краю радиуса лечит):
```lua
local distanceFactor = 1 - (distance / explosion.BlastRadius)
humanoid:TakeDamage(maxDamage * distanceFactor)   -- TakeDamage уважает ForceField
```

**Нокбэк через LinearVelocity** (BodyVelocity устарел). Источник: ISSUE «VectorForce or LinearVelocity» (TenerPVPs).
```lua
LinearVelocity.VectorVelocity = humanoidRootPart.CFrame.LookVector * 20
```
> VectorForce требует чисел НАМНОГО больше (это сила, не скорость). При LinearVelocity:
> приваренные части → `Massless=true`, а HumanoidRootPart → `Massless=false`.

---

## Комбо-системы

**Версионный ID — отмена устаревшего отложенного вызова** (фикс «комбо ломается /
автокликер спамит»). Источник: ISSUE «Combat hit counter resets» (TheCraftNCreator).
```lua
Identify = 1
function DoM1()
    Identify += 1
    local newID = Identify
    task.wait(4)
    if newID ~= Identify then return end   -- функцию вызвали снова → отменяем старую
end
```

**Окно комбо через `os.clock()`.** Источник: ISSUE «combo system for a tool» (ChronicallyOnlin_e).
```lua
local CurrentClick, CurrentCD, ComboBreak, AttackStreak = 0, 0.3, 1, 0
Tool.Activated:Connect(function()
    local t = os.clock()
    if t - CurrentClick >= CurrentCD then
        if t - CurrentClick > ComboBreak then AttackStreak = 0 else AttackStreak += 1 end
        if math.fmod(AttackStreak, 3) == 0 then AttackStreak = 0 end
        AnimSession[AttackStreak+1]:Play(0.5, AttackStreak+5)
        CurrentClick = t
    end
end)
```

**Мульти-кнопочные комбо (R+L+R+L).** Источник: ISSUE «Multiple Key Combo» (ThanksRoBama).
```lua
local comboPatterns = {
    {name="One-two Punch", pattern={"R","L","R","L"}},
    {name="Right Jab",     pattern={"L","L","R","L"}},
}
local combo, comboExpireTime, lastActionTick = {}, 0.5, tick()
function addToCombo(action)
    if tick() - lastActionTick > comboExpireTime then combo = {} end
    lastActionTick = tick()
    table.insert(combo, action)
    return combo
end
```

---

## Анимации

**Загрузка через Animator + бинд на хелс/состояние.** Источник: ISSUE «Changing Animations Based On State».
```lua
local Animator = Humanoid:WaitForChild("Animator")
local Anims = {
    Idle = Animator:LoadAnimation(script:WaitForChild("IdleAnim")),
    RightArmInjuredIdle = Animator:LoadAnimation(script:WaitForChild("RightArmInjuredIdle")),
}
```

**Фикс «дёргается при первом проигрывании» — префетч.** Источник: ISSUE «Animator delays/stutters» (poopimpoopandcool4).
```lua
game:GetService("ContentProvider"):PreloadAsync({ anim1, anim2 })
```

**Клиппинг вьюмодела сквозь стену — рейкаст от камеры.** Источник: TUTORIAL «Preventing Viewmodel Clipping» (ForestFireTree1).
```lua
self.raycastParams = RaycastParams.new()
self.raycastParams.FilterType = Enum.RaycastFilterType.Exclude
self.raycastParams.FilterDescendantsInstances = { self.character, self.viewmodel }

local res = workspaceService:Raycast(
    self.currentCamera.CFrame.Position + self.currentCamera.CFrame.LookVector * -5,
    self.currentCamera.CFrame.LookVector * 8, self.raycastParams)

if res then
    self.offsetCFrame = self.offsetCFrame:Lerp(CFrame.new(0,0, 8 - res.Distance), 12 * dt)
else
    self.offsetCFrame = self.offsetCFrame:Lerp(CFrame.new(0,0,0), 9 * dt)
end
```

---

## Рейкастинг

**Пробивающий луч (bullet penetration).** Источник: TUTORIAL «Piercing Raycasts» (drewbluewasabi).
```lua
local function raycast_pierce(pos, direction, length, pierce, overlap_threshold)
    local ins, outs = {}, {}
    local exclude_params = RaycastParams.new()
    exclude_params.FilterType = Enum.RaycastFilterType.Exclude
    while true do
        local a_result = workspace:Raycast(pos, direction * length, exclude_params)
        if not a_result then break end
        exclude_params:AddToFilter(a_result.Instance)   -- игнор на след. проходе
        -- обратный луч от дальней точки → точка выхода; копим ins/outs
    end
    return ins, outs
end
```

**Подвеска машины (Hooke F=-kx, VectorForce + Attachment + Raycast).** Источник: TUTORIAL «In Depth Scripted Car Physics» (bIorbee).
```lua
local function processWheel(wheel)
    wheel.springForce.Force = Vector3.zero
    local down = -wheel.attachment.WorldCFrame.UpVector
    local start = wheel.attachment.WorldPosition
    local direction = down * (REST_LENGTH + WHEEL_RADIUS)

    local params = RaycastParams.new()
    params.FilterType = Enum.RaycastFilterType.Exclude
    params.RespectCanCollide = true
    params.FilterDescendantsInstances = { model }

    local result = workspace:Raycast(start, direction, params)
    if result then
        local length = result.Distance - WHEEL_RADIUS
        local displacement = REST_LENGTH - length    -- сжатие пружины
        applyForces(wheel, displacement)             -- F = stiffness*displacement - damping*v
    end
end
```

---

## Камера

**Переключение режима по клавише + форс-отдаление.** Источник: ISSUE «Changing camera mode» (Brambes230605).
```lua
UserInputService.InputBegan:Connect(function(input, gp)
    if gp then return end
    if input.KeyCode == Enum.KeyCode.F then
        if player.CameraMode == Enum.CameraMode.Classic then
            player.CameraMode = Enum.CameraMode.LockFirstPerson
        else
            player.CameraMode = Enum.CameraMode.Classic
            player.CameraMinZoomDistance = 10          -- форсим отдаление
            task.wait()
            player.CameraMinZoomDistance = StarterPlayer.CameraMinZoomDistance
        end
    end
end)
```

**Плавная пружинная камера — BindToRenderStep на приоритете камеры.** Источник: ISSUE «Camera Offset Jitters».
```lua
RunService:BindToRenderStep("SpringCamera", Enum.RenderPriority.Camera.Value, function()
    if Character:FindFirstChild("Humanoid") then
        SpringV2.tween(CameraPart, SpringV2.springInfo(0.15, 1), {CFrame = Character.Head.CFrame})
    end
end)
```

---

## Ввод / мобильные кнопки

**Показ моб-кнопок по типу ввода + пресет размера (порог 500px).** Источник: TUTORIAL «Correct Way to Design Mobile Buttons».
```lua
local UIS, RS = game:GetService("UserInputService"), game:GetService("RunService")
local function updateInput()
    local lastInput = UIS:GetLastInputType()
    if lastInput == Enum.UserInputType.Focus then return end
    Frame.Visible = lastInput == Enum.UserInputType.Touch
end
updateInput()
UIS.LastInputTypeChanged:Connect(updateInput)

RS.RenderStepped:Connect(function()
    if Frame.Visible then
        local minAxis = math.min(Frame.Screen.AbsoluteSize.X, Frame.Screen.AbsoluteSize.Y)
        local isSmall = minAxis <= 500                     -- телефон vs планшет
        local size = isSmall and 70 or 120
        Frame.Size = UDim2.new(0, size, 0, size)
    end
end)
```

**Отвязать прыжок (напр. для speak-to-jump).** Источник: TUTORIAL «Detecting Voice Chat Volume».
```lua
game:GetService("ContextActionService"):UnbindAction("jumpAction")
```

---

## Сеть / хитбоксы при пинге

**Компенсация пинга и скорости для серверного хитбокса.** Источник: ISSUE «Hitbox serverside issue» (Turbokidz4444).
```lua
local pingOffset = 8.6 - 10 * math.clamp(Player:GetNetworkPing(), 0, 0.3)
local velocityOffset = hitbox.CFrame:VectorToObjectSpace(primaryPart.AssemblyLinearVelocity)
hitbox.CFrame *= CFrame.new(velocityOffset / pingOffset)      -- предсказание позиции
```

**Кастомная репликация NPC — интерполяция с учётом dt.** Источник: TUTORIAL «Performance tips for NPC replication» (Downrest).
```lua
local deltaTimeConverted = deltaTime / (1 / 60)
npcHRP.CFrame = npcHRP.CFrame:Lerp(positionData, .05 * deltaTimeConverted)
```
Троттлинг отправки (раз в 10 кадров на Heartbeat):
```lua
local counter = 0
RNS.Heartbeat:Connect(function()
    if counter < 10 then counter += 1 return else counter = 0 end
    -- send position data to clients
end)
```
> Порог троттлинга Roblox — **50 KB/s**; 500 humanoid через `:MoveTo()` ≈ 160 KB/s.

---

## Анти-чит / HTTP

**Детект saveinstance().** Источник: ISSUE «saveinstance detection» (D3r3kM4n).
```lua
-- FindService (в отличие от GetService) НЕ создаёт сервис.
-- UGCValidationService появляется под game при saveinstance() → краш клиента.
if game:FindService("UGCValidationService") then  --[[ react ]] end
```

**Детект внешнего UI (скролл без зума камеры).** Источник: RESOURCE «Detect CoreGui» (accmoi_lapdungbannha).
```lua
local function isMouseOverSurfaceGui()
    local mouse = UserInputService:GetMouseLocation() - GuiService:GetGuiInset()
    local ray = Camera:ScreenPointToRay(mouse.X, mouse.Y)
    -- raycast → если скролл был, но зум не менялся и курсор не над scroll-GUI → подозрительно
end
```

**HttpService:RequestAsync + секрет (без хардкода ключа).** Источник: TUTORIAL «Group ranking with OpenCloud» (va0ck).
```lua
local HttpService = game:GetService("HttpService")
local res = HttpService:RequestAsync({
    Url = url, Method = "GET",
    Headers = { ["x-api-key"] = HttpService:GetSecret("roblox_cloud_key") },
})
```
> Discord webhook 400: все поля embed → `tostring()`; старый headshot-URL мёртв,
> бери `thumbnails.roblox.com/v1/users/avatar-headshot`.

---

## UI / эффекты

**Кривой полёт стрелы — квадратичная Безье (твин NumberValue 0→1).** Источник: ISSUE «arrow projectile curve» (Denzil160).
```lua
local function lerp(p0, p1, t) return p0 + (p1 - p0) * t end
local function quadBezier(t, p0, p1, p2)
    return lerp(lerp(p0,p1,t), lerp(p1,p2,t), t)
end
local controlPoint = startPos:Lerp(endPos, 0.5) + Vector3.new(0, 20, 0)  -- высота дуги
```
> Радуга-градиент: делай ДВЕ радуги и сдвигай на полдлины для бесшовного цикла;
> двигай через TweenService, не `while/wait` (ISSUE «Rainbow UI Gradient»).

---

## Вьюмодели (FPS, от первого лица)

**Способы рендера вьюмодела (борьба с Z-fighting/клиппингом).** Источник: TUTORIAL «Types of rendering a ViewModel» (Tavikron).
- Анимации с позой «Idle» (как Arsenal) — чтобы при подгрузке руки не были раскоряками.
- CFrame + `:Lerp()` (как Phantom Forces) — позиции не «грузятся».
- **`Model:ScaleTo()`** — уменьшить вьюмодел, чтобы не клиппился сквозь стены (новый способ).
- Z-fighting фиксят через Highlight (AlwaysOnTop), ViewportFrame или SurfaceGui.
```lua
-- Highlight поверх всего (минус: нет теней/материалов)
for _, v in pairs(workspace["viewmodel arms"]:GetDescendants()) do
    if v:IsA("BasePart") then
        local h = Instance.new("Highlight")
        h.Adornee, h.FillTransparency = v, 0
        h.FillColor, h.OutlineColor = v.Color, v.Color
        h.Parent = v
    end
end
```

**Баг: руки вьюмодела сами включают CanCollide каждый кадр.** Источник: ISSUE «ViewModel CanCollide Bug» (RoyalTHEUSERNAME).
> Humanoid форсит коллизии. Решение: CollisionGroup, игнорящий игрока (создать на сервере,
> применить локально), ЛИБО состояние Humanoid `RunningNoPhysics`, либо сбрасывать
> `CanCollide=false` каждый кадр.

**Плавный sway вьюмодела (НЕ дёргается).** Источник: ISSUE «ViewModel freeze lag» (avodey).
```lua
-- база: позиционируем вьюмодел по камере каждый кадр
viewModelRoot.CFrame = camera.CFrame * viewModelOffset * CFrame.Angles(-rotY, -rotX, 0)
-- где rotX/rotY из UserInputService:GetMouseDelta()
```
> Грабли: если совать `GetMouseDelta()` прямо в угол — дёргается (delta не влияет на след.
> кадр). Нужно копить **offset-CFrame во времени** и лерпить с `MOTION_SPEED`; bobbing
> делать frame-delta-aware (одинаково на любом FPS).

**ADS (прицеливание) — offset до Aim-части.** Источник: ISSUE «How do i ADS a gun» (AtomoaiV).
```lua
local offset = arms.HumanoidRootPart.CFrame:ToObjectSpace(arms.Model.Aim.CFrame:Inverse())
```

**Overshoot вьюмодела (как в HELLMET) — clamp + PivotTo.** Источник: ISSUE «Overshoot Viewmodel» (DevOrderless).
```lua
gunYawOffset = math.clamp(gunYawOffset, MIN_YAW, MAX_YAW)
gunPitchOffset = math.clamp(gunPitchOffset, MIN_PITCH, MAX_PITCH)
local freeAimRotation = CFrame.Angles(gunPitchOffset, gunYawOffset, 0)
viewmodel:PivotTo(head.CFrame * freeAimRotation * VIEWMODEL_OFFSET)
```

---

## Огнестрел (raycast-пушки)

**Луч игнорирует своего игрока и пушку.** Источник: ISSUE «raycast ignore my player» (emilisyaye).
```lua
local thingmagigs = {}
for _, v in pairs(player.Character:GetChildren()) do
    if v:IsA("BasePart") then table.insert(thingmagigs, v) end
end
local params = RaycastParams.new()
params.FilterType = Enum.RaycastFilterType.Exclude
params:AddToFilter(thingmagigs)        -- лучше, чем AddToFilter в цикле
```

**Мировая точка прицела от курсора.** Источник: ISSUE «shotgun/bullet spread» (Vaugh_PlaysRblx).
```lua
local screenToWorldRay = camera:ViewportPointToRay(mouseLocation.X, mouseLocation.Y)
local result = workspace:Raycast(screenToWorldRay.Origin, screenToWorldRay.Direction * MAX_MOUSE_DISTANCE)
local hitPos = result and result.Position or (screenToWorldRay.Origin + screenToWorldRay.Direction * MAX_MOUSE_DISTANCE)
```
> Разброс дробовика: пустить 5 лучей с небольшим угловым отклонением, урон меньше у
> каждого, считать как один выстрел (2112Jay).

**Луч от центра экрана (прицел).** Источник: ISSUE «Shots Don't Hit While Moving» (EmmettKurth).
```lua
local ray = Camera:ScreenPointToRay(Camera.ViewportSize.X/2, Camera.ViewportSize.Y/2 - 60, 0)
MouseEvent:FireServer(ray.Origin, ray.Direction)
```

**Серверная валидация попадания.** Источник: ISSUE «Firearm System - Server Hit Validation» (ChiDj123).
> Клиент-хитскан шлёт `(weapon, hit, origin, hitPos, normal)` → сервер **пере-кастует**
> origin→лимб. Грабли: к моменту серверного re-raycast цель уже сдвинулась с точки зрения
> сервера → ложные промахи. Нужна лаг-компенсация (см. ниже).

**Анти-тимкилл + per-player debounce.** Источник: ISSUE «Anti-Teamkill» / «How do I add cooldown».
```lua
local cooldowns = {}                                   -- debounce НА КАЖДОГО игрока
remote.OnServerEvent:Connect(function(player, target)  -- player всегда первый аргумент!
    if cooldowns[player] then return end
    if target and game.Players:GetPlayerFromCharacter(target).Team ~= player.Team then
        cooldowns[player] = true
        target.Humanoid:TakeDamage(30)
        task.wait(fireRate)
        cooldowns[player] = nil
    end
end)
```
> Грабли (ISSUE «Weapon System - Wrongly interpreting objects»): `OnServerEvent` **всегда**
> добавляет `player` первым параметром — не передавай атакующего вручную, иначе аргументы
> съезжают. Глобальный `debounce` блокирует всех игроков сразу — держи таблицу по игроку.

**Визуальная отдача (camera shake) поверх управляемой отдачи.** Источник: ISSUE «visual recoil» (notsad2ALT).
```lua
local function ApplyDeltaRotation(cX,cY,cZ, lX,lY,lZ)   -- применять дельту, а не абсолют
    camera.CFrame *= CFrame.Angles(cX-lX, cY-lY, cZ-lZ)
    return cX, cY, cZ
end
```
> Управляемая отдача (A→B, игрок её гасит мышью) и визуальная тряска — раздельно;
> у каждой пушки свои `recoilStrength/kickTime/recoveryTime`.

**Пушка без вьюмодела (тулза + руки персонажа).** Источник: ISSUE «Tool-based gun without viewmodel» (Sametc4n).
```lua
local rightHand = character:WaitForChild("RightHand")
game:GetService("RunService").RenderStepped:Connect(function()
    gun.CFrame = rightHand.CFrame * CFrame.new(0,-0.5,0.3)   -- base offset * anim offset
end)
```

---

## Продвинутая сеть и лаг-компенсация

**Частота RemoteEvent + батчинг.** Источник: ISSUE «How often should RemoteEvents be fired» (ChiDj123).
> 1/20–1/60 раз/сек достаточно; интерполируй CFrame на клиенте. **Батчи**: собирай
> изменения за кадр и шли одним вызовом, а не по одному на игрока.
```lua
local moves = {}
moveHead.OnServerEvent:Connect(function(plr, cf) table.insert(moves, {plr, cf}) end)
RunService.Heartbeat:Connect(function()
    if #moves == 0 then return end
    moveHead:FireAllClients(moves)       -- можно делить на батчи по N
    table.clear(moves)
end)
```

**Whitelisted networking — состояния вместо «RemoteEvent37».** Источник: RESOURCE «Clean, Whitelisted Networking System» (Yanzity).
```lua
-- States-модуль: разрешённые действия + направление
return {
    PlayerPressedSpinButton = { FromClient = true },              -- C→S событие
    ServerBroadcastMessage  = { FromServer = true },              -- S→C событие
    RequestPlayerStats      = { FromClient = true, IsRequest = true }, -- запрос (RemoteFunction)
}
-- всё, чего нет в States или не совпадает по направлению — автоматически отклоняется
```

**Builder-нетворкинг с congestion control.** Источник: RESOURCE «Graphite» (PELMEN4IK125).
```lua
local Event = Graphite.Event("Test").type(Graphite.String8).droppable().build()
Event.OnClientEvent(function(str: string) print(str) end)
```

**Лаг-компенсация снарядов (server-auth).** Источник: ISSUE «Lag Compensation Of Projectiles» (kiy4ku).
> Server-auth детерминирован → возможен rewind/rollback: на момент получения пакета сервер
> считает латентность и **перематывает время** к снапшоту, в котором стрелял клиент.
> Референсы: **SecureCast**, **Chickynoid**, «Lag Compensated Gun System with Server Authority».

**Мгновенный фидбэк хита при любом пинге.** Источник: ISSUE «Instant Hit-Detection regardless of ping» (superlaser60).
> Визуал — на клиенте сразу; урон/кулдаун/детект — на сервере. Для снарядов — **raymarching**
> (дробить полёт на шаги) + Region3-предсказание цели, чтобы слать индикатор урона чуть
> раньше фактического попадания.

**BetterReplication — буфер-репликация CFrame персонажей.** Источник: RESOURCE «BetterReplication» (baukeblox12).
> Roblox-репликация медленна для боёвки (задержка позиций/констрейнтов на др. клиентах).
> BetterReplication шлёт CFrame через buffer (минимум трафика, ~0.6 KB/s/игрок), сервер
> форвардит остальным. **Анти-чит НЕ входит** — делать самому. Преемник — **Chrono**.

**Безопасность RemoteEvent от RemoteSpy.** Источник: RESOURCE «XASEMOTE» (IvanTheProtogen0).
> Крипто-обёртка (X25519/Ed25519/ChaCha20-Poly1305/BLAKE3). Всё равно нужна серверная
> валидация — шифрование не заменяет проверки.

**BindableEvent vs RemoteEvent (частая путаница).** Источник: ISSUE 21/25.
> `BindableEvent` — `:Fire()` / `.Event` (в пределах одной стороны: server↔server,
> client↔client). `RemoteEvent` — `:FireServer()` / `.OnServerEvent` (через сеть). Если
> хочешь поймать ввод от клиента на сервере — это `RemoteEvent.OnServerEvent`, а не `.Event`.

---

## VFX (визуальные эффекты)

**Канва VFX-способности.** Источник: TUTORIAL «Beginner's Guide on scripting Anime/Fighting VFX» (SushiScripter).
Поток: ввод (`InputBegan` + проверка `gameProcessedEvent`) → RemoteEvent на сервер →
**серверный debounce** (таблица по игроку, клиентский обходится эксплойтерами) → детект
урона → спавн VFX. Рекомендуется **Client-Replication** (сервер говорит клиентам проиграть
эффект), а не серверный спавн частей.

**Снаряд с кастом-физикой (SimpleCast).** Источник: RESOURCE «SimpleCast» (seliso).
```lua
local castSettings = {
    MaxLifeTime = 5, Gravity = GRAVITY, RaycastParam = raycastParams,
    OnCastHit = function(self, hitObj, castData, newPos) self:CastTerminate(castData) return end,
}
local caster = SimpleCast.new(ball, castSettings)
-- GetPosition(t, v0, p0, gravity) — позиция в момент t; GetVelocity — её производная
```
> Bullet sim: визуал на клиенте, raycast/урон валидируются на сервере (Danielvip1010).

---

## API-вызовы готовых модулей (как они вызываются — из примеров в файле)

```lua
-- ShapecastHitbox (chaining). RESOURCE 5 (combat arch)
local hitbox = ShapecastHitbox.new(swordHandle, raycastParams)
hitbox:HitStart(3):OnUpdate(function()
    if hitbox.RaycastResult then hitbox:HitStop():Destroy() end
end)

-- HitboxClass v2.0. RESOURCE 6 (combat arch)
local hitbox = HitboxClass.new("WeldedBox", {
    root = sword, size = Vector3.new(4,1,6), duration = 0.3,
    velocityPrediction = true, HitMode = "Weak",
})
hitbox.OnHit:Connect(function(character, hitPart) end)
hitbox:Start()

-- EZ Hitbox (фабрики). RESOURCE 3 (combat arch)
local hit = Hitbox.sphere(10, CFrame.new(0,5,0))
local hit = Hitbox.box(Vector3.new(10,5,10), CFrame.new(0,5,0))
local hit = Hitbox.fromPart(workspace.MyHitboxPart)

-- Barbs Hitbox. RESOURCE 7 (combat arch)
BarbsHitbox.Sphere(origin, radius, options)

-- EZ Camera Shake V2. RESOURCE 13 (community)
local CamShake = CameraShaker.new(Enum.RenderPriority.Camera.Value + 2^4, function(cf)
    CurrentCamera.CFrame *= cf
end)
CamShake:Start()

-- Bootstrapper (загрузчик/планировщик модулей). RESOURCE 11
local services = Bootstrapper.loadDescendants(Services, Bootstrapper.byName("Service$"))
Bootstrapper.run(services, ':init')
Bootstrapper.run(services, ':start')
Bootstrapper.bindToHeartbeat({ Services.InputService, Services.CharacterService }, ':onHeartbeat')

-- ByteNet Max (буфер-нетворкинг). RESOURCE 17
ByteNetMax.defineNamespace("PlayerData", function()
    return { queries = { GetCoins = ByteNetMax.defineQuery({
        request = ByteNetMax.struct({ message = ByteNetMax.string }),
        response = ByteNetMax.struct({ coins = ByteNetMax.uint8 }),
    }) } }
end)

-- RagdollService. RESOURCE 12 (combat arch)
RagdollService.Ragdoll(character, rig_type)   -- → success: boolean
```

---

## Шпаргалка «симптом → фикс»

| Симптом | Причина / фикс |
|---|---|
| Хитбокс бьёт дважды (рука+торс) | дедуп по Humanoid в таблице (Хитбоксы) |
| Хитбокс бьёт самого себя | фильтр владельца: `character ~= v.Parent` |
| Персонаж «спотыкается» о хитбокс | `CanCollide=false`, CollisionGroup |
| `.Touched` пропускает стоящих/быстрых | spatial query на тик действия |
| Урон лечит на краю взрыва | `math.clamp(factor, 0, 1)` |
| Комбо ломается / автокликер | версионный attackId + серверный кулдаун |
| Анимация дёргается при 1-м проигрывании | `ContentProvider:PreloadAsync` |
| Нокбэк не работает (BodyVelocity устарел) | `LinearVelocity`; следить за Massless |
| Лаг хитбокса в игре, но не в Studio | пинг RemoteEvent; клиент-детект + серверная проверка |
| Аудио пропадает после респавна | держать в SoundService, не в PlayerGui |
| `saveinstance()` крадёт игру | `game:FindService("UGCValidationService")` |
| Blockcast ничего не находит | `direction` не `Vector3.zero` |
| Discord webhook 400 | поля embed → `tostring()`; новый thumbnails-URL |
| Вьюмодел клиппится сквозь стену | `Model:ScaleTo()` или рейкаст от камеры |
| Руки вьюмодела сами включают CanCollide | Humanoid форсит; CollisionGroup / RunningNoPhysics |
| Вьюмодел дёргается при движении мыши | копить offset-CFrame + лерп, не сырой GetMouseDelta |
| Луч пушки бьёт своего игрока | `params:AddToFilter(части персонажа)`, Exclude |
| Сервер не засчитывает попадание | цель сдвинулась к re-raycast → лаг-компенсация |
| `debounce` блокирует всех игроков | таблица `cooldowns[player]`, не глобальный bool |
| Аргументы OnServerEvent «съехали» | `player` всегда первый — не передавай атакующего вручную |
| BindableEvent не ловится на сервере | нужен `RemoteEvent.OnServerEvent`, не `Bindable.Event` |
| Нельзя твинить модель | `Model:ScaleTo()` через NumberValue + `.Changed` |
| Дэш кидает игрока при столкновении | силы вместо прямой ALV; рейкаст-ранняя остановка |
| Подвеска машины «прыгает» | знак демпфера: `Stiffness*compression - Damping*velocity` |

---

## Полные ссылки на ключевые модули (точные URL из файла)

- ShapecastHitbox — https://devforum.roblox.com/t/shapecasthitbox-for-all-your-melee-needs-v025/3624241
- Raycast Hitbox 4.01 — https://devforum.roblox.com/t/raycast-hitbox-401-for-all-your-melee-needs/374482
- HitboxClass v2.0 — https://devforum.roblox.com/t/hitboxclass-v20-a-powerful-oop-based-hitbox-module/3929512
- EZ Hitbox — https://devforum.roblox.com/t/ez-hitbox-hitbox-made-easy/3738357
- Barbs Hitbox — https://devforum.roblox.com/t/barbs-hitbox-an-easier-to-use-hitbox-system/4082195
- Hitbox by Salvatore (анти-чит) — https://devforum.roblox.com/t/hitbox-module-by-salvatore/3913281
- FastCast2 — https://devforum.roblox.com/t/fastcast2-an-improved-version-of-fastcast-with-parallel-scripting-more-extensions-and-statically-typed-a-powerful-modern-projectile-library/4093890
- SwiftCast — https://devforum.roblox.com/t/swiftcast-simple-fast-and-easy-projectiles/4477145
- RagdollService — https://devforum.roblox.com/t/ragdollservice-all-in-one-high-quality-ragdoll-solution/4255978
- Advanced Melee System — https://devforum.roblox.com/t/open-source-advanced-melee-system/1579485
- Lock-On Combat 3D — https://devforum.roblox.com/t/open-source-updated-lock-on-combat-in-3d/2518120
- In Depth Scripted Car Physics — https://devforum.roblox.com/t/in-depth-scripted-car-physics/3915628
- Piercing Raycasts (туториал) — https://devforum.roblox.com/t/breakdown-piercing-raycasts-and-bullet-penetration/4051367

### Advanced Combat (секция 7)
- SimpleCast (альтернатива FastCast) — https://devforum.roblox.com/t/simplecast-an-alternative-to-fastcast/2271321
- BetterReplication (буфер-репликация боёвки) — https://devforum.roblox.com/t/betterreplication-vastly-improve-your-combat-experience-by-fighting-lag/3260027
- Graphite (нетворкинг + congestion control) — https://devforum.roblox.com/t/v020-graphite-modern-high-perf-networking-library-for-roblox/4352938
- Clean, Whitelisted Networking System — https://devforum.roblox.com/t/clean-whitelisted-networking-system/4277192
- XASEMOTE (защита от RemoteSpy) — https://devforum.roblox.com/t/xasemote-security-module-to-protect-against-remotespy-attacks/4014996
- Open Sourced Cartoony Gun System — https://devforum.roblox.com/t/open-sourced-cartoony-gun-system/3327044
- Types of rendering a ViewModel (туториал) — https://devforum.roblox.com/t/types-of-rendering-a-viewmodel/2002479
- Anime/Fighting VFX Guide Part 1 (туториал) — https://devforum.roblox.com/t/full-beginners-guide-on-scripting-animefighting-vfxvisual-effects-part-1/1610853

*Все сниппеты — фактический код из базы знаний. Числа/сигнатуры сверять с Creator Docs.*
