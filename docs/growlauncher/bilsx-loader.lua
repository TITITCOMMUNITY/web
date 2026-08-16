-- BILSX Growlauncher Loader
-- Test client for /api/gl/login + /api/gl/me + /api/script/load

local BILSX_API = "https://web-d8a.pages.dev/api"
local username = ""
local password = ""
local bilsxToken = ""
local account = nil
local scripts = {}
local scriptAlias = {}

local function safe(value)
    return tostring(value or "")
end

local function remainingText(ms)
    ms = tonumber(ms or 0) or 0
    if ms <= 0 then return "Expired" end
    local total = math.floor(ms / 1000)
    local d = math.floor(total / 86400)
    local h = math.floor((total % 86400) / 3600)
    local m = math.floor((total % 3600) / 60)
    if d > 0 then return d .. "d " .. h .. "h" end
    if h > 0 then return h .. "h " .. m .. "m" end
    return m .. "m"
end

local function scriptUrl(id)
    return BILSX_API .. "/script/load?script=" .. safe(id) .. "&token=" .. safe(bilsxToken)
end

local function loadBilsxScript(id)
    if not bilsxToken or bilsxToken == "" then
        logToConsole("`4Bilsx: belum login.")
        return
    end

    local source = fetch(scriptUrl(id))
    if not source or source == "" then
        logToConsole("`4Bilsx: script tidak dapat dimuat.")
        return
    end

    local fn, err = load(source)
    if not fn then
        logToConsole("`4Bilsx: script error: " .. safe(err))
        return
    end

    local ok, runtimeError = pcall(fn)
    if not ok then
        logToConsole("`4Bilsx: runtime error: " .. safe(runtimeError))
    end
end

local function buildAccountModule()
    local freeKey = account and account.free_key or {}
    local keyStatus

    if not freeKey.exists then
        keyStatus = "Not Created\\nGet Key manual in Bilsx website"
    elseif not freeKey.active then
        keyStatus = "Expired\\nGet Key manual in Bilsx website"
    else
        keyStatus = "Active\\nRemaining: " .. remainingText(freeKey.remaining_ms)
    end

    local menu = {
        { type = "divider" },
        { type = "label", text = "User : " .. safe(account.username), description = "" },
        { type = "label", text = "Status : " .. safe(account.plan):upper(), description = "" },
        { type = "label", text = "Account : " .. safe(account.status):upper(), description = "" },
        { type = "divider" },
        { type = "label", text = "Key Status", description = "" },
        { type = "label", text = keyStatus, description = "" },
        { type = "divider" },
        { type = "label", text = "Load Script", description = "" }
    }

    scriptAlias = {}
    for _, script in ipairs(scripts or {}) do
        local alias = "bilsx_script_" .. safe(script.id):gsub("[^%w_]", "_")
        scriptAlias[alias] = script.id
        table.insert(menu, {
            type = "button",
            text = safe(script.name),
            alias = alias
        })
    end

    table.insert(menu, { type = "divider" })

    local module = [[{"sub_name":"[Info Account]","icon":"Account Balance","description":"Account Info and Loader","menu":]]
        .. jsonEncode(menu) .. "}"

    addIntoModule(module)
end

local function loginBilsx()
    if username == "" or password == "" then
        logToConsole("`4Bilsx: Username dan Password wajib diisi.")
        return
    end

    local url = BILSX_API .. "/gl/login?username=" .. username .. "&password=" .. password
    local response = fetch(url)
    if not response or response == "" then
        logToConsole("`4Bilsx: server tidak dapat dihubungi.")
        return
    end

    local data = jsonDecode(response)
    if not data or data.success ~= true then
        logToConsole("`4Bilsx: Login gagal.")
        return
    end

    bilsxToken = safe(data.token)
    account = data.account
    scripts = data.scripts or {}

    buildAccountModule()
    logToConsole("`2Bilsx: Login berhasil sebagai `w" .. safe(account.username))
end

bilsxSystem = [[
{
    "sub_name":"[Login]",
    "icon":"Hub",
    "description":"Bilsx Login",
    "menu":[
        {"type":"label","text":"Login Bilsx Account","description":""},
        {"type":"input_string","text":"Username","default":"","label":"Username","placeholder":"Username","icon":"Account Circle","alias":"username"},
        {"type":"input_string","text":"Password","default":"","label":"Password","placeholder":"Password","icon":"Key","alias":"password"},
        {"type":"button","text":"Login","alias":"login"}
    ]
}
]]

addIntoModule(bilsxSystem)

function onValue(_, alias, value)
    if alias == "username" then
        username = safe(value)
        return
    end

    if alias == "password" then
        password = safe(value)
        return
    end

    if alias == "login" then
        loginBilsx()
        return
    end

    if scriptAlias[alias] then
        loadBilsxScript(scriptAlias[alias])
        return
    end
end

applyHook()
