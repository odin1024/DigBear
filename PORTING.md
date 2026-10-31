# Crawl Bear（超级爬爬熊）项目分析与 Windows 版实施方案

> 上游项目：[xw-meow/crawl-bear](https://github.com/xw-meow/crawl-bear)（MIT，v0.4.0，2026-10-29 建仓）
> 本文基于对上游源码的完整通读 + 对 Tauri 2.12.5 / wry 0.57.1 / WebView2 运行时 156 的实测验证。
> 本仓库是面向 Windows 的移植版（产品名 **掘掘熊 DigBear**）。

---

## 一、上游项目是怎么工作的

### 1.1 技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 桌面壳 | Tauri 2 | Rust 后端 + WebView 内核，不打包 Electron |
| 后端 | Rust 2021 | 全部业务逻辑 |
| 前端 | React 18 + TypeScript + Vite + Ant Design 5 | 只负责展示与交互 |
| 网络 | reqwest + 系统 `curl` | 直链下载走 curl，HLS 走 ffmpeg |
| 打包 | `.app` + `.pkg`（macOS） | 自写 `package_macos.sh` 做 pkg |

### 1.2 核心数据流

```
用户粘贴 URL
   │
   ├─▶ crawler/browser.rs
   │     建一个不可见的 WebviewWindow（label = "crawl-worker"）
   │     注入 CRAWL_INIT_SCRIPT（把 rAF 映射成 setTimeout）
   │     → eval(EXTRACT_JS)  ← crawler/script.js 是真正的"抓取引擎"
   │     → 得到 { title, final_url, resources[], warnings[] }
   │
   ├─▶ crawler/mod.rs
   │     URL 规范化、去重（去 fragment）、按扩展名分类、截断到 max_items
   │     调 twitter.rs 提升 X 的清晰度
   │
   ├─▶ 前端展示（features/crawler）
   │     按类型过滤、预览、勾选
   │
   └─▶ downloader/mod.rs
         并发 worker（1~5）
         ├─ 直链      → curl（带 Cookie + Referer + 代理）
         ├─ HLS/DASH  → ffmpeg -c copy 重封装
         └─ 页面视频  → resolvers/（youtube.rs 用 innertube API 取最高清）
         .part 临时文件 → 校验 Content-Type → 改扩展名 → 唯一化重命名
```

### 1.3 最关键的一块：`crawler/script.js`

这是整个项目的技术核心，一个 ~550 行的同步 IIFE，**不发任何请求、不依赖页面框架、不用全局变量**，一次跑完返回 `JSON.stringify(...)`。它同时覆盖 12 种来源：

| 来源 | 采集内容 |
| --- | --- |
| `img` / `picture` | `<img>`、`<picture><source>` |
| `video` / `audio` | `<video>`、`<source>`、`<audio>` |
| `link` / `meta` / `anchor` | `<link rel=...>`、og 标签、`<a href>` |
| `inline_style` | `<style>` 里的 `url(...)`（含 @font-face 判定） |
| `css_background` / `css_font_face` | 遍历 CSSOM 规则（跨域样式表会被 catch 住并记 warning） |
| `performance` | `performance.getEntriesByType('resource')` |
| `svg_image` | SVG 里的 `<image>` |
| `inline_media_urls` | 正则扫 HTML 源码里的 `.m3u8` / `.mpd`（为 X 准备） |

作者在 `docs/media-extraction.md` 里记录了实测结论：WebKit 与 Chromium 采集结果**高度一致**（差异主要来自字符串拼接型懒加载图的加载时序，±5%~20%），真实站点 41~168 条资源。

> **这点对 Windows 非常关键**：采集逻辑是纯 DOM + CSSOM + Performance Timing，
> **不依赖 Safari 的任何专有行为**。换到 Chromium（WebView2）后主体逻辑可以直接复用。

### 1.4 项目自认的短板（作者写进 `docs/media-extraction.md`）

1. 第三方追踪像素（`initiatorType=img` 但无扩展名）会被误判为图片 —— 靠用户手动过滤。
2. `blob:` 流（MSE / HLS 实时流）**抓不到**。
3. iframe 内部资源抓不到。
4. closed shadow DOM 抓不到。
5. 脚本在提取之后才设置的背景图抓不到。

作者在 `docs/ARCHITECTURE.md` 里明确写了扩展点，其中一条直接对应 Windows：

> | 新平台（Windows/Linux） | `core/naming` 与 `downloader` 的平台分支；UI 不变 |

也就是说，**上游作者自己是预留了 Windows 移植位置的**，只是没做。

---

## 二、能不能直接做 Windows 版？—— 能，而且是"低风险移植"

三个前提全部满足：

1. **许可证允许**：MIT。保留版权声明即可，可以改名、可以闭源发布、可以商用。
2. **技术栈本来就跨平台**：Tauri 2 的 `WebviewWindowBuilder` 在 Windows 上映射到 **WebView2（Edge/Chromium 内核）**，上游用的 `visible()` / `user_agent()` / `initialization_script()` / `data_directory()` 在 Windows 上**全部有对应实现**（已逐一核对源码，见附录 A）。
3. **核心逻辑与平台无关**：采集脚本是纯 DOM API；下载器走系统 `curl`（Windows 10 1803+ 自带 `curl.exe`）；合并走 ffmpeg（Windows 版二进制有现成发布）。

> **结论**：这不是"重新实现"，而是"把平台分支补齐"。工作量集中在 7 个文件。

---

## 三、macOS → Windows 的 9 个真实差异（逐条）

下面每一条我都去源码里核实过，不是猜的。

### 差异 1：WebView 内核 —— WKWebView → WebView2 ⚠️ 最高风险

| | macOS | Windows |
| --- | --- | --- |
| 内核 | WKWebView（Safari） | WebView2（Chromium / Edge 156+） |
| 缺失 | — | 未装 WebView2 运行时的机器打不开 |

**上游的应对**：`core/webview.rs` 注释写得很清楚 —— WKWebView 默认 UA 少了 `Safari/` token，很多站点嗅探 UA 后返回降级页，所以上游**强制指定桌面 Safari UA**。这个做法在 Windows 上要改：WebView2 默认 UA 本来就是完整的 Chromium UA，**再伪装成 Safari 反而会让 `Sec-CH-UA` 客户端提示和 UA 自相矛盾**。

**移植做法**：拆成平台常量。

```rust
#[cfg(target_os = "macos")]
pub const BROWSER_USER_AGENT: &str = "... Safari/605.1.15";
#[cfg(windows)]
pub const BROWSER_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/140.0.0.0 Safari/537.36";
```

关键点：**同一个常量同时用于 WebView 和 curl 下载器**，保证"浏览器里发现的 URL"和"下载时自称的身份"一致，否则部分 CDN 会拒绝。

### 差异 2：不可见窗口不再刷新画面 ⚠️ 最高风险

上游 `core/webview.rs` 里有一段注释写得很清楚：

> Hidden WKWebView windows never receive display refreshes, so `requestAnimationFrame` callbacks do not fire and JavaScript-rendered or lazy-loaded content stays in its initial loading state.

上游的解法是**把 rAF 映射成 setTimeout**：

```js
window.requestAnimationFrame = function (cb) {
  return setTimeout(function () { cb(performance.now()); }, 16);
};
```

**这段必须保留到 Windows 版。** 我核对了 wry 0.57.1 的 WebView2 后端源码：

- `wry/src/webview2/mod.rs:619` → `controller.SetIsVisible(attributes.visible)`，而 `attributes.visible` 默认是 `true`，**Tauri 从不覆盖它**；
- 隐藏的是外层 HWND（`tao` 的 `with_visible(false)`，WebView2 子窗口样式不带 `WS_VISIBLE`）。

结论：**Chromium 认为页面是 visible 的，计时器不会被降频；只是不产帧，所以 rAF 不触发**。上游那个 rAF 垫片正好补上这个洞。这条逻辑在两个平台上是通用的，无需分平台。

### 差异 3：后台冻结 / 降频的加固手段（Windows 独有）

差异 2 的结论是"够用"，但有两处 Chromium 层面的隐患：

- **隐藏窗口可能被判为 occluded** → 触发 `--disable-backgrounding-occluded-windows` 那一套节流。
- Tauri 2 有 `background_throttling(BackgroundThrottlingPolicy::Disabled)`，但 **wry 的 WebView2 后端根本没实现这个策略**（`wry/src/webview2/` 全目录无 `background_throttling` 相关代码，只有 macOS 的 `WKInactiveSchedulingPolicy` 分支）。所以这个开关在 Windows 上是**空操作**，别指望它。

Windows 上的加固手段（按推荐度排序）：

| 方案 | 做法 | 代价 |
| --- | --- | --- |
| **A. 移出屏幕而非隐藏**（推荐先试） | `position(-32000, -32000)` + `skip_taskbar(true)` + `always_on_bottom(true)`，窗口仍然是"可见"的 | 可能短暂闪现；仍在 Alt+Tab 里 |
| **B. CDP 保持页面活跃** | `PlatformWebview::controller()` → `ICoreWebView2Controller` → `ICoreWebView2::CallDevToolsProtocolMethod("Page.setWebLifecycleState", {"state":"active"})` + `Emulation.setFocusEmulationEnabled` | 需要引入 `webview2-com` + `windows` 两个依赖，且版本必须与 Tauri 锁死 |
| **C. `additional_browser_args`** | 加 `--disable-background-timer-throttling` 等 | ⚠️ **有坑**，见下 |

> ⚠️ **C 方案的坑（务必注意）**：`additional_browser_args` 是 **WebView2 环境创建参数**（`wry/src/webview2/mod.rs:341` → `options.set_additional_browser_arguments(...)`）。WebView2 要求**同一个用户数据目录下，所有窗口的浏览器参数必须完全一致**，否则 `CreateCoreWebView2EnvironmentWithOptions` 返回 `ERROR_INVALID_STATE`。
> 而本项目的主窗口、登录窗口、抓取窗口共用同一个数据目录（否则登录态传不过去）。
> → 所以用 C 就必须给**所有**窗口都传**一模一样**的字符串，包括 `tauri.conf.json` 里的主窗口。Tauri 官方文档也写了这条警告。
> **本移植没有采用 C**，避免这个耦合。

### 差异 4：系统代理 —— 上游只有 macOS 分支

上游 `core/net.rs`：

```rust
#[cfg(target_os = "macos")]
{ /* scutil --proxy */ }
```

Windows 上这段直接被编译掉 → **等于没有代理支持**。而国内用户大量依赖系统代理（Clash / v2rayN 的"系统代理"开关），YouTube 在直连下基本不可用。

**移植做法**：读 WinINET 注册表 `HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings`：

- `ProxyEnable`（DWORD）为 1 才启用；
- `ProxyServer` 可能是 `host:port`，也可能是 `http=...;https=...;socks=...` 分协议列表；
- 取 `https` 优先，其次 `http`，最后 `socks`。

优先级：**环境变量（`HTTPS_PROXY` 等）> 系统设置**，因为 CLI 工具和大多数代理客户端都直接暴露环境变量，且没有歧义。

### 差异 5：文件名规则 —— Windows 比 macOS 严格得多

上游 `core/naming.rs` 只过滤了 `\ / : * ? " < > |` 和控制字符 —— 这已经是 Windows 完整字符集了，但**还漏了两类**：

| 问题 | 现象 | 修复 |
| --- | --- | --- |
| **DOS 保留设备名** | `CON.txt` / `NUL` / `COM1` → Windows 根本创建不了这个文件 | 按"第一个点之前"判定 stem，命中就加 `_` 前缀 |
| **结尾的点与空格** | Windows 创建文件时会**静默丢弃**结尾的 `.` 和空格 → 磁盘上的名字和我们预留的名字对不上，UI 显示错 | 循环剥掉结尾的 `.` 和空格 |

另外补了 **260 字符路径上限**（`path_budget()` / `fit_to_budget()`）：Windows 默认 `MAX_PATH=260`，下载目录一深就溢出。macOS/Linux 无此限制，所以 `path_budget()` 在非 Windows 返回 `usize::MAX`。

### 差异 6：默认下载目录 —— 上游在 Windows 上是坏的

上游 `core/models.rs`：

```rust
let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
let download_dir = format!("{home}/Downloads/DigBear");
```

**Windows 没有 `HOME` 环境变量**（只有 `USERPROFILE`）→ 会退化成 `./Downloads/DigBear`，相对当前工作目录，位置完全不对。

**移植做法**：改用 `dirs::download_dir()`（Windows 上走 Known Folder API，返回真实的 `%USERPROFILE%\Downloads`）。

### 差异 7：`curl` 的位置

上游 `downloader/curl.rs` 写死 `/usr/bin/curl`、`/bin/curl`。

Windows 10 1803 起自带 `curl.exe`（在 `System32`）。`find_binary` 会先找 fallback 再扫 `PATH`，所以改成：

```rust
#[cfg(windows)]
find_binary("curl.exe", &[r"C:\Windows\System32\curl.exe", r"C:\Windows\SysWOW64\curl.exe"])
```

另外注意：Windows 自带的 curl 用 Schannel，走系统证书存储，代理行为和浏览器一致 —— 这正是上游用 curl 而不是 Rust HTTP 客户端的原因，Windows 上同样成立。

### 差异 8：打开文件夹 / 打开链接

上游 `commands/mod.rs` 只有 macOS 的 `open -R` 和 `open`，其他平台直接返回 `unsupported`：

```rust
#[cfg(not(target_os = "macos"))]
{ Err(AppError::new("unsupported", "当前系统不支持自动打开目录。")) }
```

Windows 的对应物：

- 定位文件 → `explorer /select,"<path>"`
- 打开文件夹 → `explorer "<path>"`
- 打开链接 → `cmd /C start "" "<url>"`（交给默认浏览器）

### 差异 9：FFmpeg 扩展包

上游 `extensions.rs` 的下载地址只分 arm64 / x64 两个 **macOS** 包，且 `can_install: cfg!(target_os = "macos")` —— Windows 上扩展面板是灰的。

`eugeneware/ffmpeg-static` 的 b6.1.1 发布里确实有 `ffmpeg-win32-x64.gz`（29.5 MB），已确认存在。同时把可执行文件名从 `ffmpeg` 改成 `ffmpeg.exe`。

---

## 四、本次移植改了哪些文件

### 后端（Rust）

| 文件 | 改动 | 对应差异 |
| --- | --- | --- |
| `src/core/webview.rs` | 拆分平台 UA 常量（`SAFARI_USER_AGENT` → `BROWSER_USER_AGENT`）；保留 rAF 垫片并补充 Windows 说明 | 1、2 |
| `src/core/net.rs` | 新增 WinINET 注册表代理读取 + 解析 + 单元测试 | 4 |
| `src/core/naming.rs` | DOS 保留名、结尾点/空格、路径长度预算 | 5 |
| `src/core/models.rs` | 默认下载目录改用 `dirs::download_dir()` | 6 |
| `src/core/config.rs` | 新旧环境变量兼容 | — |
| `src/crawler/browser.rs` | UA 常量改名 | 1 |
| `src/downloader/curl.rs` | `curl.exe` 查找路径 | 7 |
| `src/downloader/paths.rs` | 路径长度预算落到 `PathPlanner` | 5 |
| `src/downloader/resolvers.rs` | UA 常量改名 | 1 |
| `src/session/mod.rs` | UA 常量改名 | 1 |
| `src/commands/mod.rs` | `reveal_path` / `open_url` 的 Windows 实现 | 8 |
| `src/extensions.rs` | FFmpeg 的 Windows 包与 `.exe` | 9 |
| `src-tauri/Cargo.toml` | 新增 `dirs`、`winreg`（仅 Windows） | 4、6 |

### 配置与流水线

| 文件 | 改动 |
| --- | --- |
| `src-tauri/tauri.conf.json` | `productName: DigBear`、`identifier: com.digbear.desktop`、Windows 打包目标（NSIS + MSI）、`webviewInstallMode: downloadBootstrapper`、NSIS `currentUser` 安装模式与中英文语言包 |
| `package.json` | `build:desktop:windows` / `build:desktop:macos` 分平台脚本 |
| `.github/workflows/ci.yml` | 矩阵改成 macos-14 + windows-2022 |
| `.github/workflows/release.yml` | 拆成 `windows` 与 `macos` 两个 job，Windows 产 NSIS/MSI + SHA256 |

### 顺带修掉的上游问题

- `extensions.rs` 里 `FFMPEG_DOWNLOAD_SIZE` 写死 20 MB，实际 Windows 包是 29.5 MB（只是 UI 提示，不影响功能）。
- `core/webview.rs` 的 `SAFARI_USER_AGENT` 名字对 Windows 是错的，改成 `BROWSER_USER_AGENT`。

---

## 五、Windows 版能拿到的两个"上游没有"的增强

移植本身不增加功能，但这三点是 Windows 平台**天然**能做而 macOS 做不到的，值得单独立项：

### 5.1 用 CDP 在网络层抓媒体（补上 `blob:` 这个短板）

Tauri 2 在 Windows 上把 `ICoreWebView2Controller` 直接暴露出来：

```rust
// tauri-2.12.5/src/webview/mod.rs
#[cfg(windows)]
pub fn controller(&self) -> webview2_com::...::ICoreWebView2Controller { ... }
```

于是可以挂 CDP 的 `Network.responseReceived` / `Fetch.requestPaused`，**在网络层**拿到所有媒体请求 —— 包括上游明确抓不到的 `blob:`（MSE 流）、iframe 内部资源、以及接口返回的直链。这是 WebKit 上做不到的。

### 5.2 多架构与体积

上游只发 macOS universal 包。Windows 可以发 `x64`（+ `arm64`），MSI + NSIS 双格式覆盖企业批量部署和个人使用。

---

## 六、构建与发布

### 前置依赖（Windows）

| 依赖 | 说明 | 必需？ |
| --- | --- | --- |
| **Microsoft C++ Build Tools** | 装 **"使用 C++ 的桌面开发"** 工作负载（含 MSVC 链接器 + Windows SDK） | ✅ 必需，缺 `link.exe` 直接编译失败 |
| **Node.js ≥ 20** + pnpm 12 | 构建前端 | ✅ |
| **Rust stable (x86_64-pc-windows-msvc)** | | ✅ |
| **WebView2 Runtime** | 运行时；Win11 自带，Win10 可能要装 | ✅ 运行必需 |

> Tauri 2 在 `tauri.conf.json` 里配了 `webviewInstallMode: downloadBootstrapper`，
> 安装包会在目标机缺少 WebView2 时自动下载运行时（静默）。

### 命令

```bash
pnpm install
pnpm build:desktop:windows          # 出 NSIS(.exe) + MSI
pnpm test:rust                      # 跑 Rust 单元测试
```

产物位置：

```
apps/desktop/src-tauri/target/release/bundle/nsis/DigBear_0.4.0_x64-setup.exe
apps/desktop/src-tauri/target/release/bundle/msi/DigBear_0.4.0_x64_en-US.msi
```

### 代码签名

**未签名的 Windows 程序**会被 SmartScreen 拦（"Windows 已保护你的电脑"）。两条路：

1. 买 OV/EV 证书（~$70/年），用 `signtool` 签 NSIS 和 MSI；
2. 暂时不签，在 README / 安装说明里写清楚"首次运行点『更多信息 → 仍要运行』"。

CI 里的 release note 已经按未签名场景写了提示。

---

## 七、当前状态与未验证项

### 已在 Windows 实机跑通 ✅

本机环境：Windows / WebView2 Runtime 156.0.4314.50 / Rust 1.95 / Node 24。

| 验证项 | 方式 | 结果 |
| --- | --- | --- |
| **Rust 全量类型检查** | `cargo check --lib`（含 `tauri 2.12.5`、`wry 0.57.1`、`winreg 0.55`、`dirs 7` 全部依赖） | ✅ 通过，无警告 |
| **Windows 专属单元测试** | 把 `core/naming.rs` + `core/net.rs` 抽成独立 crate 实跑 | ✅ **10 passed / 0 failed**，含 7 个新增测试：DOS 保留名、结尾点空格、路径预算、WinINET 代理解析 4 例 |
| **前端构建** | `tsc && vite build` | ✅ 通过，1840 modules，无类型错误 |
| **真实抓取（端到端）** | 用上游自带的 `DIGBEAR_TEST_URL` 钩子跑 `https://www.rust-lang.org/` | ✅ `crawl ok host=rust-lang.org title=Rust Programming Language counts={"audio":0,"font":90,"image":16,"other":0,"video":0} warnings=[]` |
| **真实下载（端到端）** | 同一页面 + `DIGBEAR_TEST_DOWNLOAD=1` | ✅ `download ok folder=<项目内>\rust-lang.org success=106 failed=0` |
| **下载产物有效性** | 检查落盘文件 | ✅ 106 个文件、1.85 MB，扩展名分布 `.woff2/.woff/.svg/.png/.jpg`，均为真实内容（无 0 字节错误页） |
| **默认下载目录** | 看下载落盘路径 | ✅ 正确解析为 `%USERPROFILE%\Downloads\DigBear\<host>`（调试时改指向项目内，见附录 D）—— 证明上游 `HOME` bug 在 Windows 上已修掉 |
| **隐藏窗口可用** | 抓取成功即证明 | ✅ WebView2 隐藏窗口正常加载 + 渲染 + 执行脚本，rAF 垫片有效，提取到 90 个字体资源 |

> 这次实机跑通，验证了移植最核心的假设：**上游基于 WKWebView 的采集脚本在 Chromium（WebView2）上同样有效**，
> 且隐藏窗口 + rAF 垫片的方案可以原样搬到 Windows。

### 未验证 ⚠️（需要装好 MSVC 工具链的机器）

1. **MSVC 正式构建与打包**：本机没有 MSVC 链接器（`link.exe` 缺失）且无管理员权限装 Build Tools。
   类型检查、单元测试、前端构建、端到端抓取与下载都已用 **GNU 工具链** 在本机跑通（见上表），
   但 **NSIS / MSI 打包产物还没生成过**。
2. **需要登录的站点**：WebView2 的 Cookie 存储按数据目录隔离，实测应该可用，但没在真实登录站点上验证过。
3. **X / YouTube 的高清流**：上游用 innertube `VISIONOS` client 拿直链（纯 HTTP，不依赖 WebView），理论上与平台无关，但还没在实机验证过。
4. **懒加载 / 无限滚动页面**：本次实测页面较简单，隐藏窗口在重度动态站点上的节流风险还没量化。

> 装好 Build Tools 后，第一件事应该是：
> ```bash
> pnpm install && pnpm test:rust && pnpm build:desktop:windows
> ```
> 然后手工验证：随便找个图片站 + 一个 X 视频 + 一个 YouTube 视频。

---

## 八、建议的推进顺序

| 阶段 | 内容 | 产出 |
| --- | --- | --- |
| **P0**（已完成） | 平台分支补齐 + 打包配置 + CI | 本仓库当前状态 |
| **P1** | 装 MSVC 工具链，跑通 `pnpm build:desktop:windows` | NSIS + MSI 安装包 |
| **P2** | 实机验证三个典型站点（普通图片站 / X / YouTube） | 抓取成功率数据 |
| **P3** | 隐藏窗口改成"移出屏幕"或上 CDP 兜底 | 消除懒加载站点的漏抓风险 |
| **P4** | 补 `blob:` / iframe 采集（靠 5.1 的 CDP） | 补上上游明确的能力短板 |
| **P5** | 品牌视觉重做（吉祥物、配色、图标 —— 上游的 `Mascot.tsx` / `styles.css` 是继承来的） | 真正属于你的产品 |
| **P6** | 代码签名 + 多架构（x64/arm64） | 可分发的正式版本 |

---

## 附录 A：上游代码里可以直接复用的部分

| 模块 | 复用度 | 说明 |
| --- | --- | --- |
| `crawler/script.js` | **~95%** | 纯 DOM/CSSOM API，Chromium 与 WebKit 实测高度一致 |
| `crawler/mod.rs` | 100% | 纯逻辑 |
| `core/models.rs` | 95% | 只需修默认下载目录 |
| `core/classify.rs` / `core/url.rs` / `core/naming.rs` | 95% | 补 Windows 文件名规则 |
| `downloader/mod.rs` / `paths.rs` | 90% | 补路径长度预算 |
| `downloader/curl.rs` | 95% | 补 `curl.exe` 路径 |
| `downloader/hls.rs` | 100% | 只调 ffmpeg，跨平台 |
| `downloader/youtube.rs` | 100% | 纯 HTTP innertube，与平台无关 |
| `downloader/resolvers.rs` | 100% | 纯逻辑 |
| `session/mod.rs` | 90% | WebView2 的 Cookie 存储按数据目录隔离，登录态天然共享 |
| `crawler/browser.rs` | 85% | 隐藏窗口 + rAF 垫片通用；需评估节流 |
| `extensions.rs` | 80% | 换 Windows 二进制 |
| `commands/mod.rs` | 85% | 补 `explorer` / `start` |
| `core/net.rs` | 60% | macOS 用 `scutil`，Windows 要读注册表 |
| 前端 `features/crawler` | 100% | 纯 TS |
| 前端 `features/settings` | 95% | 文案与路径显示 |
| `styles.css` / `Mascot.tsx` | 待定 | 视觉资产，建议重做 |

## 附录 B：Windows 上手速查

```powershell
# 装构建工具（需要管理员）
winget install Microsoft.VisualStudio.2022.BuildTools `
  --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"

# 编译
pnpm install
pnpm test:rust
pnpm build:desktop:windows

# 手动验证 WebView2 环境
$env:ProgramFiles
Get-ChildItem "${env:ProgramFiles(x86)}\Microsoft\EdgeWebView\Application"
```

## 附录 C：许可证与致谢

上游 [xw-meow/crawl-bear](https://github.com/xw-meow/crawl-bear) 采用 MIT 许可证，Copyright (c) 2026 xw-meow。
本移植版保留了原始版权声明（见 `LICENSE` 与 `NOTICE.md`）。
MIT 允许：使用、复制、修改、合并、发布、分发、再授权及销售副本，并允许商业使用，唯一要求是保留版权与许可声明。
---

## 附录 D：本地调试时不要往 C 盘写

开发调试用的产物都放在项目内的 `_test-artifacts/`（已在 `.gitignore` 里排除）：

```
_test-artifacts/
├─ dev-config/settings.json   # 指向项目内下载目录的调试配置
└─ downloads/<host>/           # 抓取下来的媒体文件
```

跑调试钩子时带上配置目录，下载就不会落到 `C:\Users\admin\Downloads`：

```powershell
$env:DIGBEAR_CONFIG_DIR = "$PWD\_test-artifacts\dev-config"
$env:DIGBEAR_TEST_URL = "https://www.rust-lang.org/"
$env:DIGBEAR_TEST_DOWNLOAD = "1"
& ".\apps\desktop\src-tauri\target\debug\dig-bear.exe"
```

> `_test-artifacts/dev-config/settings.json` 里把 `download_dir` 指到了项目内；
> 正式应用默认仍然是 `%USERPROFILE%\Downloads\DigBear`，用户可在
> **设置 → 下载目录** 里改。
