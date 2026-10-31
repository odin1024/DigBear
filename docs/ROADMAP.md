# 掘掘熊 DigBear — 待优化清单

> 状态：2026-10-31　|　名字已定：**掘掘熊 DigBear**
> 本文是活文档，做完一条划掉一条。

---

## A. 必做 —— 影响能不能用 / 能不能发布

### A1 ⬜ 正式安装包（NSIS + MSI）
- **现状**：只有 `build-preview/dig-bear.exe`（GNU 工具链直出），没有安装程序
- **需要**：Microsoft C++ Build Tools，装「使用 C++ 的桌面开发」工作负载
- **产出**：`pnpm build:desktop:windows` → `nsis/DigBear_*_x64-setup.exe` + `msi/DigBear_*_x64_*.msi`
- **收益**：卸载、开始菜单、桌面快捷方式、后续版本升级

### A2 ✅ 中文路径下的完整链路
- **背景**：工程路径是 `F:\自媒体\AI编程\掘掘熊DigBear`（全中文）。GNU 工具链下曾实测到
  `windres: can't open icon file ... Invalid argument` —— windres 不支持非 ASCII 路径
- **实测结果（Windows + WebView2 + GNU 工具链运行时）**：
  - 配置目录 `...\中文路径测试\配置` ✅
  - 下载目录 `...\中文路径测试\下载目录` ✅ curl 正常落盘
  - 抓取 ✅ 16 图 + 90 字体，零 warning
  - 下载 ✅ 106/106 成功，**0 个零字节文件**，扩展名分布正常
- **结论**：**运行时**对中文路径完全无碍。唯一受影响的是 GNU `windres`（仅影响用 GNU 工具链打包，
  MSVC 工具链无此问题）

### A3 ⬜ 实机验证：X / YouTube 高清流
- 上游走 innertube `VISIONOS` client 取直链（纯 HTTP，不经过 WebView），理论上跨平台
- **风险**：接口参数变更、被限流、需要 `referer`/UA 匹配
- **验证**：`DIGBEAR_TEST_PAGE_VIDEO=<youtube 链接>` + `DIGBEAR_TEST_DOWNLOAD=1`

### A4 ⬜ 实机验证：需要登录的站点
- WebView2 的 Cookie 按**用户数据目录**隔离；登录窗口与抓取窗口共用同一目录，理论上能共享
- **风险**：WebKit 与 WebView2 的 Cookie 策略有差异（SameSite、第三方 cookie）
- **验证**：`DIGBEAR_TEST_LOGIN_URL=<url>`，看 `session cookies=N` 是否 > 0

### A5 ⬜ 实机验证：FFmpeg 扩展 + HLS/DASH 下载
- 扩展面板在 Windows 上现在可安装了（`can_install` 已放开），但**安装流程从没在 Windows 上跑过**
- **风险**：`ffmpeg-win32-x64.gz` 下载（约 30 MB）、gzip 解压、`.exe` 执行、`extension_root` 路径拼接
- **验证**：`DIGBEAR_TEST_EXTENSION=ffmpeg`，然后用一个 `.m3u8` 地址跑完整下载

---

## B. 该做 —— 影响完整度与品牌一致性

### B1 ⬜ 官网 `apps/website` 重做
- 现在整个还是上游 CrawlBear：**33 处**品牌文案、hero/banner 图、界面截图、链接全部指向
  `xw-meow/crawl-bear` 与 `we.miework.cn`
- **三个选项**：
  1. 按 DigBear 重做（文案换掉、截图重截、链接改向）
  2. 暂时从工作区移除，只保留桌面应用
  3. 保留但明确标注「灵感来源：上游 CrawlBear」

### B2 ✅ 上游文档来源标注
- `docs/` 下 6 份继承自上游的文档已在开头加了「来源说明」
- MIT 的版权声明保留在 `LICENSE`，致谢在 `NOTICE.md`

### B3 ⬜ 首页文案与标语统一
- 当前（大标题）：「把网页里的宝贝，收进采集袋。」
- 当前（气泡）：「今天想翻哪个网站？」
- 建议统一到「掘」的主题，例如：
  - 「网页里的宝贝，掘一掘就出来。」
  - 「今天想掘哪个网站？」
  - 「只读翻找，本机保存。」

### B4 ⬜ `paper-pattern.webp` 底纹
- 页面底纹仍是上游素材，自己画一张或换色

### B5 ⬜ `scripts/prepare_assets.py`
- 上游脚本，依赖已被 gitignore 的 `design-assets/` 提示词，现在**已作废**
- 当前流程是 `scripts/make_icon.py` + `scripts/gen_mascots.py` + `scripts/install_mascots.py`
- 处理：删掉，或重写成调用新流程

---

## C. 增强 —— 有余力再做

### C1 ⬜ CDP 网络层抓取（补 `blob:` / MSE / iframe 内资源）
- 上游 `docs/media-extraction.md` 明确列出这三条是能力短板
- Windows 上 Tauri 直接暴露 `ICoreWebView2Controller`，可以挂 CDP 的 `Network` / `Fetch` 事件
  在**网络层**捕获，直补上游补不了的场景

### C2 ⬜ 隐藏窗口节流加固
- 现方案：隐藏 HWND + rAF 垫片（实测够用）
- 加固方向：窗口移出屏幕（`-32000,-32000` + `skip_taskbar`），或 CDP `Page.setWebLifecycleState`
- 目的：重度动态站点（无限滚动、懒加载）不漏抓

### C3 ⬜ 更多站点解析器
- 目前只有 YouTube 与 X（`downloader/resolvers.rs` 的注册表机制）
- 可加：B 站、抖音、小红书、微博、Instagram
- 注册表机制已经留好位置，实现 `PageVideoResolver` 即可

### C4 ⬜ arm64 架构 + 代码签名
- arm64：CI 里加 `aarch64-pc-windows-msvc` target
- 签名：OV 证书约 $70/年，或短期靠「更多信息 → 仍要运行」

### C5 ⬜ 设置项的补充
- 目前设置页有：下载目录、分类筛选、并发数、滚动加载、最大条数、语言、扩展管理、登录站点
- 可考虑：默认文件名模板、按域名分目录开关、失败重试次数、磁盘空间预警

---

## 已完成 ✅

| 项 | 说明 |
| --- | --- |
| 平台移植 | 13 个 Rust 文件的 Windows 分支：UA、代理、文件名、下载目录、curl、explorer、FFmpeg |
| 打包配置 | NSIS + MSI、WebView2 引导、中英文语言包 |
| 流水线 | CI 矩阵加 windows-2022；Release 拆 windows/macos |
| 自有品牌 | 应用图标 + 顶栏 logo（Pillow 绘制）、6 只吉祥物（即梦 Seedream 4.6） |
| 打包流水线脚本 | `make_icon.py` / `gen_mascots.py` / `install_mascots.py` / `jimeng_gen.py` |
| 验证 | 类型检查通过、Windows 单元测试 10/10、真实抓取 + 真实下载 106 文件全成功、前端构建通过 |
| 文档 | `PORTING.md`（分析与实施）、`docs/PREVIEW.md`（预览版说明）、`NOTICE.md`（致谢） |
| 版本控制 | git 仓库已建，首次提交 143 文件 |
| 中文路径验证 | 全中文配置目录 + 全中文下载目录，抓取与下载 106/106 全通过 |