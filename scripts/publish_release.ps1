# 发布脚本：建仓库 -> 推代码 -> 打标签 -> 发 Release
#
# 用法：
#   $env:GITHUB_TOKEN = "ghp_xxx"      # 需要 repo 权限的 Personal Access Token
#   powershell -File scripts/publish_release.ps1
#
# 参数：
#   -Repo           目标仓库，默认 odin1024/DigBear
#   -Version        版本号，默认读 apps/desktop/src-tauri/tauri.conf.json
#   -SkipRelease    只推代码和标签，让 GitHub Actions 自动构建发布
#   -NoCreateRepo   不尝试自动创建仓库（已存在时默认也会跳过）

param(
    [string]$Repo = "odin1024/DigBear",
    [string]$Version = "",
    [switch]$SkipRelease,
    [switch]$NoCreateRepo
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Write-Step($message) {
    Write-Host "==> $message" -ForegroundColor Cyan
}

if (-not $Version) {
    $conf = Get-Content "apps/desktop/src-tauri/tauri.conf.json" | ConvertFrom-Json
    $Version = $conf.version
}
$Tag = "v$Version"

$Token = $env:GITHUB_TOKEN
if (-not $Token -and -not $NoCreateRepo) {
    throw "缺少 GITHUB_TOKEN。请先设置：$env:GITHUB_TOKEN = 'ghp_xxx'（Personal Access Token，需要 repo 权限）"
}

# ---------- 1. 远端地址 ----------
Write-Step "配置远端仓库 $Repo"
$remote = "ssh://git@github.com/$Repo.git"
git remote get-url origin 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
    git remote set-url origin $remote
} else {
    git remote add origin $remote
}

# ---------- 2. 仓库不存在就建一个 ----------
if (-not $NoCreateRepo) {
    $headers = @{
        Authorization = "Bearer $Token"
        Accept = "application/vnd.github+json"
        "X-GitHub-Api-Version" = "2022-11-28"
        "User-Agent" = "DigBear-Publisher"
    }
    Write-Step "检查仓库是否存在"
    try {
        Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo" -Headers $headers -Method Get | Out-Null
        Write-Host "    仓库已存在，跳过创建" -ForegroundColor DarkGray
    } catch {
        Write-Step "创建仓库 $Repo"
        $body = @{
            name = ($Repo -split "/")[-1]
            description = "输入一个网址，把网页里的图片、视频、音乐与字体收进本地文件夹。"
            private = $false
            auto_init = $false
        } | ConvertTo-Json
        Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Headers $headers -Method Post -Body $body | Out-Null
        Write-Host "    已创建" -ForegroundColor Green
    }
}

# ---------- 3. 推代码 ----------
Write-Step "推送 main 分支"
git push -u origin main
if ($LASTEXITCODE -ne 0) { throw "推送 main 失败" }

# ---------- 4. 打标签 ----------
$existing = git tag -l $Tag
if ($existing -eq $Tag) {
    Write-Step "标签 $Tag 已存在，跳过"
} else {
    Write-Step "打标签 $Tag"
    git tag -a $Tag -m "掘掘熊 DigBear $Tag"
    git push origin $Tag
    if ($LASTEXITCODE -ne 0) { throw "推送标签失败" }
}

if ($SkipRelease) {
    Write-Step "已推送代码与标签。GitHub Actions 会自动构建并发布 Release。"
    Write-Host "    查看进度：https://github.com/$Repo/actions" -ForegroundColor Cyan
    exit 0
}

# ---------- 5. 本地直接发 Release（不用等 CI） ----------
Write-Step "创建 Release $Tag"
$headers = @{
    Authorization = "Bearer $Token"
    Accept = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
    "User-Agent" = "DigBear-Publisher"
}
$notesFile = "docs/releases/$Tag.md"
$notes = if (Test-Path $notesFile) { Get-Content $notesFile -Raw } else { "Windows 安装包（NSIS / MSI）。" }

$releaseBody = @{
    tag_name = $Tag
    name = "掘掘熊 DigBear $Tag"
    body = $notes
    draft = $false
    prerelease = $false
} | ConvertTo-Json

$existing = $null
try { $existing = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/tags/$Tag" -Headers $headers -Method Get } catch {}
if (-not $existing) {
    Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases" -Headers $headers -Method Post -Body $releaseBody | Out-Null
    Write-Host "    已创建 Release" -ForegroundColor Green
} else {
    Write-Host "    Release 已存在，更新说明" -ForegroundColor DarkGray
    Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/$($existing.id)" -Headers $headers -Method Patch -Body $releaseBody | Out-Null
}

# ---------- 6. 上传产物 ----------
$assets = Get-ChildItem "build-preview/installers" -File -ErrorAction SilentlyContinue
if (-not $assets) {
    Write-Step "没有找到 build-preview/installers 里的产物，跳过上传"
    exit 0
}
$uploadBase = "https://uploads.github.com/repos/$Repo/releases/"
$releaseInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/tags/$Tag" -Headers $headers -Method Get
foreach ($asset in $assets) {
    Write-Step "上传 $($asset.Name)"
    $uploadUrl = "$uploadBase$($releaseInfo.id)/assets?name=$([uri]::EscapeDataString($asset.Name))"
    $bytes = [System.IO.File]::ReadAllBytes($asset.FullName)
    Invoke-RestMethod -Uri $uploadUrl -Headers $headers -Method Post -Body $bytes -ContentType "application/octet-stream" | Out-Null
}

Write-Step "完成"
Write-Host "    https://github.com/$Repo/releases/tag/$Tag" -ForegroundColor Green
