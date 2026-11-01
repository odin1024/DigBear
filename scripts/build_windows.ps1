<#
.SYNOPSIS
    在 Windows 上打包掘掘熊 DigBear（NSIS + MSI）。

.DESCRIPTION
    仓库路径是全中文的，而 GNU 工具链的 windres 不支持非 ASCII 路径，
    所以这里把源码复制到一个纯 ASCII 的临时目录再编译。

    用法：
        pwsh -File scripts/build_windows.ps1
        pwsh -File scripts/build_windows.ps1 -BuildDir E:\digbear-build -Bundles nsis

    默认使用 GNU 工具链（rustup target：stable-x86_64-pc-windows-gnu），
    不需要安装 Visual Studio Build Tools。
#>
[CmdletBinding()]
param(
    # ASCII 路径的构建目录
    [string]$BuildDir = "E:\digbear-build",
    # 需要生成的安装包类型
    [string]$Bundles = "nsis,msi",
    # 只复制源码、不编译
    [switch]$SyncOnly
)

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
$Desktop = Join-Path $Repo "apps\desktop"

function Write-Step($message) {
    Write-Host "==> $message" -ForegroundColor Cyan
}

if (-not (Test-Path $BuildDir)) {
    New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null
}

Write-Step "同步源码到 $BuildDir"
$desktopCopy = Join-Path $BuildDir "apps\desktop"
New-Item -ItemType Directory -Force -Path $desktopCopy | Out-Null
robocopy $Desktop $desktopCopy /E /XD node_modules target /NFL /NDL /NJH /NJS /MT:8 | Out-Null

# GNU 工具链下 cdylib 会导出超过 255 个符号，链接直接失败；只要 rlib 即可。
$manifest = Join-Path $desktopCopy "src-tauri\Cargo.toml"
$text = Get-Content $manifest -Raw
$text = $text -replace 'crate-type = \["staticlib", "cdylib", "rlib"\]', 'crate-type = ["rlib"]'
[System.IO.File]::WriteAllText($manifest, $text, (New-Object System.Text.UTF8Encoding($false)))

# 前端已经在仓库里构建好了（npm run build），这里跳过 beforeBuildCommand，
# 免得 Tauri 在没有 node_modules 的副本目录里跑 pnpm install。
$config = Join-Path $desktopCopy "src-tauri\tauri.conf.json"
$json = Get-Content $config -Raw -Encoding UTF8 | ConvertFrom-Json
$json.build.beforeBuildCommand = $null
$body = ($json | ConvertTo-Json -Depth 32) -replace "`r`n", "`n"
[System.IO.File]::WriteAllText($config, $body, (New-Object System.Text.UTF8Encoding($false)))

if ($SyncOnly) {
    Write-Step "已同步完成（-SyncOnly）"
    exit 0
}

# 工具链选择：
#   - 机器上装了 GNU 工具链（stable-x86_64-pc-windows-gnu）就走 GNU，本项目的
#     开发环境就是这么配的；
#   - 否则走系统默认的 MSVC（装了 Microsoft C++ Build Tools 就能编）——
#     别人 clone 下来直接跑也不会卡在找不到工具链上。
$gnuToolchain = "$env:RUSTUP_HOME\toolchains\stable-x86_64-pc-windows-gnu"
if (-not $env:RUSTUP_HOME) { $gnuToolchain = "$env:USERPROFILE\.rustup\toolchains\stable-x86_64-pc-windows-gnu" }

if (Test-Path $gnuToolchain) {
    Write-Step "使用 GNU 工具链"
    $env:RUSTUP_TOOLCHAIN = "stable-x86_64-pc-windows-gnu"
    $env:RUSTFLAGS = "-C linker=rust-lld -C link-self-contained=yes"
    # MinGW 的 bin 必须排在 self-contained 前面：否则 rustc 挑到的 dlltool
    # 找不到配套的运行时 DLL，会报 CreateProcess 失败。
    $gnuBin = "D:\tmp-toolchain\mingw64\bin"
    $selfContained = Join-Path $gnuToolchain "lib\rustlib\x86_64-pc-windows-gnu\bin\self-contained"
    $extraPath = @()
    if (Test-Path $gnuBin) { $extraPath += $gnuBin }
    if (Test-Path $selfContained) { $extraPath += $selfContained }
    if ($extraPath.Count -gt 0) { $env:PATH = ($extraPath -join ";") + ";" + $env:PATH }
} else {
    Write-Step "未找到 GNU 工具链，使用系统默认工具链（MSVC）"
    $env:RUSTFLAGS = ""
    Remove-Item Env:\RUSTUP_TOOLCHAIN -ErrorAction SilentlyContinue
}

$cli = Join-Path $Desktop "node_modules\@tauri-apps\cli\tauri.js"
if (-not (Test-Path $cli)) {
    throw "找不到 Tauri CLI：$cli（先在仓库根目录执行 corepack pnpm install）"
}

Write-Step "编译并打包（$Bundles）"
Push-Location $desktopCopy
try {
    node $cli build --bundles $Bundles
    if ($LASTEXITCODE -ne 0) {
        throw "tauri build 失败（退出码 $LASTEXITCODE）。上面的日志里有具体原因。"
    }
} finally {
    Pop-Location
}

$bundleDir = Join-Path $desktopCopy "src-tauri\target\release\bundle"
$outDir = Join-Path $Repo "build-preview\installers"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Write-Step "收集安装包到 $outDir"
Get-ChildItem (Join-Path $bundleDir "nsis") -Filter *.exe -ErrorAction SilentlyContinue |
    Copy-Item -Destination $outDir -Force
Get-ChildItem (Join-Path $bundleDir "msi") -Filter *.msi -ErrorAction SilentlyContinue |
    Copy-Item -Destination $outDir -Force
$exeTarget = Join-Path $Repo "build-preview\dig-bear.exe"
try {
    Copy-Item (Join-Path $desktopCopy "src-tauri\target\release\dig-bear.exe") $exeTarget -Force
    # 预览版放一个标记文件：它的配置（历史 / 收藏 / 设置）写到独立子目录，
    # 不会把开发时的测试数据带进用户装好的正式版。
    Set-Content -Path (Join-Path $Repo "build-preview\digbear-preview.marker") -Value "DigBear portable preview build" -Encoding ASCII
} catch {
    Write-Warning "没能覆盖 $exeTarget（程序正在运行？）。安装包不受影响。"
}

# Cargo.lock 可能因为新依赖发生变化，要带回仓库
Copy-Item (Join-Path $desktopCopy "src-tauri\Cargo.lock") `
    (Join-Path $Desktop "src-tauri\Cargo.lock") -Force

Get-ChildItem $outDir | Sort-Object Name | Format-Table Name, @{n="MB"; e={[math]::Round($_.Length / 1MB, 2)}}
Write-Step "完成"