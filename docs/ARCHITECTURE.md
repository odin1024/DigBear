> 仓库使用 pnpm workspace：桌面应用位于 `apps/desktop`，官网位于 `apps/website`。本文档中的 `src/`、`src-tauri/` 等路径均相对 `apps/desktop/`。
# CrawlBear 架构设计

> 中文名：超级爬爬熊 · 英文名：CrawlBear
> 技术栈：Tauri 2 / Rust 2021 / React 18 / TypeScript / Vite / Ant Design 5

## 1. 设计目标

1. **通用**：不绑定小红书，输入任意 `http(s)` 网站即可发现媒体资源。
2. **可扩展**：新增资源类型、发现策略、下载协议时只改独立模块，不影响 UI 与命令层。
3. **可维护**：Rust 按领域拆模块；React 按 feature 拆目录；命令层只做参数适配。
4. **可测试**：纯函数（URL/文件名/分类/HTML 解析）可单测；浏览器发现与下载可替换实现。
5. **安全边界**：远程页面只用于只读发现，不向远程页面暴露 Tauri IPC；下载只允许 `http(s)`。

## 2. 分层

```
┌────────────────────────────────────────────────────────────┐
│ React UI                                                   │
│ features/crawler · features/settings · shared/api           │
└───────────────────────┬────────────────────────────────────┘
                        │ Tauri invoke / events
┌───────────────────────▼────────────────────────────────────┐
│ commands/  (薄适配层：序列化、参数校验、调用 service)         │
├────────────────────────────────────────────────────────────┤
│ crawler/      downloader/      session/        core/config   │
│ 发现资源       保存资源          登录态/窗口     配置持久化     │
├────────────────────────────────────────────────────────────┤
│ core/   models · error · config · url · naming · classify    │
└────────────────────────────────────────────────────────────┘
```

### Rust 目录

| 路径 | 职责 |
| --- | --- |
| `src-tauri/src/lib.rs` | Tauri builder、状态注入、命令注册、插件初始化 |
| `src-tauri/src/commands/mod.rs` | 12 个 Tauri 命令的薄适配：`get_settings` / `save_settings` / `pick_download_dir` / `crawl_site` / `download_media` / `cancel_download` / `open_site_login` / `close_site_login` / `get_site_session` / `clear_site_session` / `reveal_path` / `open_url` |
| `src-tauri/src/core/models.rs` | 所有跨层 DTO（`MediaResource`, `CrawlResult`, `AppSettings`…） |
| `src-tauri/src/core/error.rs` | 统一 `AppError { code, message }` |
| `src-tauri/src/core/config.rs` | 配置文件读写、默认值、原子保存 |
| `src-tauri/src/core/url.rs` | URL 提取/规范化、host 展示 |
| `src-tauri/src/core/naming.rs` | 文件名清洗、扩展名推断、去重路径 |
| `src-tauri/src/core/classify.rs` | 扩展名/上下文 → `MediaKind` |
| `src-tauri/src/core/webview.rs` | WebView 兼容层：统一桌面 Safari UA、隐藏窗口 rAF 兜底脚本 |
| `src-tauri/src/crawler/` | 页面发现：WKWebView 执行 `script.js` 提取脚本、懒加载滚动 + `fallback.rs` HTML 兜底 |
| `src-tauri/src/downloader/` | 批量下载、Cookie/Referer、并发、取消、HLS；页面视频由可插拔 resolver 提取，通用下载/进度/合流复用 |
| `src-tauri/src/downloader/resolvers.rs` | `PageVideoResolver` trait + 注册表 + 通用流下载与 FFmpeg 合流 |
| `src-tauri/src/downloader/youtube.rs` | YouTube resolver：visionOS innertube 客户端提取直链 |
| `src-tauri/src/extensions.rs` | 应用私有扩展管理（下载/解压/校验/移除），当前提供 FFmpeg |
| `src-tauri/src/session/` | 通用站点登录窗口、Cookie 查询/清除 |

### React 目录

| 路径 | 职责 |
| --- | --- |
| `src/app/` | 壳层、导航、全局 Provider、主题 |
| `src/features/crawler/` | 地址输入、筛选器、资源列表、下载栏、状态 hooks |
| `src/features/settings/` | 保存目录、默认过滤、并发、登录站点管理 |
| `src/shared/` | Tauri API 封装、共享类型、通用组件/格式化函数 |
| `src/shared/components/Mascot.tsx` | 内置 SVG 小熊；检测到 `public/assets/bear-<mood>.png` 时自动换成生成插画 |
| `src/features/*/components` | 只负责展示，不直接调用 Tauri；动效由 framer-motion 编排 |

## 3. 关键数据流

### 爬取

```
URL → normalize → hidden WKWebView (共享 Cookie) → 注入 crawler/script.js
     → RawPage { title, final_url, resources[], warnings[] }
     → classify / dedupe / filter / cap → CrawlResult → UI
```

- 提取脚本同时扫描：DOM（img/picture/video/audio/source/link/meta/a/svg）、
  CSSOM（background-image、@font-face）、inline style、`performance` 资源条目。
- 爬取窗口使用桌面 Safari UA，并在页面脚本前注入 rAF 兼容层：隐藏 WKWebView 不接收
  显示器刷新，原生 rAF 不触发，会导致 JS 渲染/懒加载页面停留在骨架状态。
- 滚动懒加载由 Rust 分两段执行：滚到底 → 等待 → 收集；可通过设置关闭。
- WebView 失败时走 `crawler/fallback.rs`：curl HTML + 解析 HTML 中的媒体 URL。
- 同一 URL 去重（去掉 fragment，保留签名 query）。

### 下载

```
selected MediaResource[] → DownloadRequest
  → 读取 settings.download_dir / host 子目录
  → 并发 worker（默认 3）：cookie(主 WebView).cookies_for_url + Referer
  → curl 直接下载；m3u8/mpd 走 ffmpeg
  → .part 临时文件 → 扩展名修正 → 唯一文件名
  → emit download-progress / download-item / download-done
```

- 页面视频：`resolvers::resolve(url)` 按注册顺序选择解析器，拿到直链后复用同一套下载/进度/代理/FFmpeg 合流；新增或替换站点解析不需要改下载器。
- 取消使用 `AtomicBool`，worker 在开始下一个任务前检查。
- 下载目录结构：`<download_dir>/<host>/<filename>`。
- 媒体语义由 `MediaKind` 决定，不依赖前端文案。

### 登录态

```
Settings → 添加站点 URL → open_site_login
  → WebviewWindow(site-login) 加载目标站点
  → 用户手动登录
  → WKWebView 持久 Cookie Store（后续 crawl/download 自动复用）
  → get_site_session 返回 Cookie 数量（不读取/展示敏感值）
```

不自动填写账号密码、不绕过验证码。登录窗口按域名复用；清除时删除该 URL 对应 Cookie。

## 4. 扩展点

| 需求 | 扩展方式 |
| --- | --- |
| 新资源类型（如 SVG 图标、字幕） | `MediaKind` 增加枚举 + `classify` + UI 筛选配置 |
| 新发现来源（DOM/JSON-LD/API） | `crawler/script.js` 增加一段收集逻辑，输出统一 `RawPage.resources[]`（由 Rust 侧 `raw_kind` / `to_resources` 归一化） |
| 新下载协议（HLS/DASH/分片） | `downloader` 增加 `DownloadStrategy` 实现 |
| 新特殊站点解析 | 实现 `PageVideoResolver`，加入 `resolvers::registry()` 即可；resolver 只负责返回流地址 |
| 解析方案失效/替换 | 新 resolver 放到注册表更前面，旧实现保留为 fallback |
| 新本地依赖（FFmpeg 等） | 在 `extensions::CATALOG` 增加扩展定义，安装流程与设置面板自动复用 |
| 新设置项 | `AppSettings` 增字段（带 `#[serde(default)]`）+ settings UI |
| 新登录站点 | 设置页添加 URL 即可，无需改代码 |
| 新平台（Windows/Linux） | `core/naming` 与 `downloader` 的平台分支；UI 不变 |

## 5. 状态与并发

- `AppState`：
  - `SettingsStore`：`RwLock<AppSettings>`，保存时写临时文件再 rename。
  - `crawl_lock: tokio::sync::Mutex<()>`：同一时间只跑一个爬取窗口。
  - `download_cancel: AtomicBool`：取消当前批次。
- Tauri 事件：`crawl-progress`、`download-progress`、`download-item`、`download-done`。
- UI 状态机：`idle → crawling → ready → downloading → done / error`，所有异步 hook 有清理函数。

## 6. 安全与合规

- 只允许 `http/https` URL；拒绝 `file:`、`javascript:`、`data:`。
- 远程 WebView 不使用 remote IPC；提取脚本是静态字符串，只经由 `eval_with_callback` 读取。
- 下载使用用户本机 Cookie 和 Referer，不上传任何登录态。
- 只下载用户有权保存的内容；README 与 UI 均保留版权提示。
- 文件名清洗、目录规范化，防止路径穿越。

## 7. 命名约定

- 产品：`超级爬爬熊` / `CrawlBear`
- Tauri identifier：`com.crawlbear.desktop`
- 包名：`crawl-bear`，Rust lib：`crawl_bear_lib`
- 窗口：`main`、`crawl-worker`、`site-login`
- 默认下载目录：`~/Downloads/CrawlBear`
