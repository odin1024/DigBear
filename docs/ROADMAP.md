# 掘掘熊 DigBear — 待优化清单

> 状态：2026-11-01　|　名字已定：**掘掘熊 DigBear**
> 本文是活文档，做完一条划掉一条。

---

## A. 必做 —— 影响能不能用 / 能不能发布

### A1 ✅ 正式安装包（NSIS + MSI）
- **现状**：只有 `build-preview/dig-bear.exe`（GNU 工具链直出），没有安装程序
- **需要**：Microsoft C++ Build Tools，装「使用 C++ 的桌面开发」工作负载
- **产出**：`scripts/build_windows.ps1` → `nsis/DigBear_0.4.0_x64-setup.exe`（12.7 MB）+ `msi/DigBear_0.4.0_x64_zh-CN.msi` / `_en-US.msi`（16.4 MB）
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

### B6 ✅ 窗口尺寸自适应屏幕
- **问题**：上游把窗口写死成 1240x900。在 1920x1080 / 125% 缩放的机器上，
  逻辑可用区只有 1229x653 —— **窗口比屏幕还大**，标题栏与上下边框被直接顶掉
- **做法**：`src-tauri/src/lib.rs` 新增 `fit_window_to_work_area()`，
  启动时按主显示器工作区把窗口夹紧（物理像素计算，留 36px 边距）并居中
- **结果**：逻辑 1240x792 → 物理 1550x990，工作区 1920x1020，上下各留 15px ✓

### B7 ✅ 高度自适应与溢出修复
- `.home-page` 原本 `justify-content:center` + `padding-bottom:27vh` + `overflow:hidden`
  → 矮屏下内容溢出**直接被裁**
- 改为 `justify-content: safe center` + `overflow-y:auto`，并加两档高度断点
  （≤860px 收留白缩吉祥物、≤720px 进一步压缩并允许滚动）
- `Mascot.tsx` 把尺寸写死成 292px，矮屏时 stage 缩到 232 会让组件溢出 60px
  → 用 CSS 让组件跟随 stage（`width/height: 100% !important`）
- **实测**：DOM 测量 `docScrollWidth == innerWidth`，横向零溢出

### B8 ✅ 配色统一：矿灯紫琥珀
- 发现 **CSS 里根本没有紫色** —— 截图里那条紫顶栏是 Windows 系统强调色画的标题栏
- 应用原本是「米色纸 + 珊瑚红 + 暖棕描边」的手绘风，与新的紫琥珀吉祥物**不协调**
- 已改为「矿灯紫琥珀」：墨紫描边统一全站线条、琥珀做强调、冷纸白做底，
  主色按钮保留珊瑚红保证辨识度
- 对比图见 `_test-artifacts/preview/palette-compare.png`
- **备选**：B 森林手账（上游暖调，需重做吉祥物描边色）/ C 夜矿深色（需重做整套插画）

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

## D. 新增功能建议（想让产品比上游更好用）

> 现状：**核心功能与上游 Mac 版 100% 持平**，并有 2 项超过上游（原生菜单跨平台、系统代理跨平台）。
> 下列是按「投入产出比」排序的候选。

### D1. ✅ 补上游短板 —— 低成本、高感知（0.4.0 已完成）

> 失败重试、结果排序、快捷键、拖拽链接、重命名模板中的前四项已实现；
> 「批量重命名模板」尚未做。

| 功能 | 说明 | 上游 |
| --- | --- | --- |
| **下载失败自动重试** ✅ | 指数退避重试，可设次数；结果页列出重试按钮 | 无 |
| **结果排序** ✅ | 按分辨率 / 时长 / 文件名排序 | 无 |
| **键盘快捷键** ✅ | `Ctrl+V` 粘贴、`Ctrl+A` 全选、`Ctrl+,` 设置、`Esc` 取消/返回 | 无 |
| **拖拽链接到窗口** ✅ | 把浏览器地址栏的链接拖进来直接翻找 | 无 |
| **批量重命名模板** | `{site}` `{index}` `{kind}` `{name}` 占位符 | 无 |
| **剪贴板直读** | 一键读取剪贴板里的链接（现在需手动粘贴） | 部分 |

### D2. Windows 平台独有机会

| 功能 | 说明 | 为什么只有 Windows 值得做 |
| --- | --- | --- |
| **CDP 网络层抓取** | 挂 CDP 的 `Network` / `Fetch` 事件，在网络层捕获媒体 | 能补上上游明确抓不到的 `blob:`（MSE 流）、iframe 内部资源、接口直链；Tauri 在 Windows 上直接暴露 `ICoreWebView2Controller` |
| **浏览器扩展** | Chrome / Edge 扩展：右键「用掘掘熊翻找此页」 | Windows 用户主力在 Edge/Chrome，扩展是分发利器 |
| **资源管理器右键菜单** | 右键文件夹 →「用掘掘熊翻找此文件夹」 | Windows 独享 |
| **系统托盘常驻** ✅ | 托盘图标 + 「翻找剪贴板链接」快捷项 | 适合当常驻小工具 |
| **多网址队列** ✅ | 一次提交多个网址排队翻找，串行或并行 | macOS 版也能做，但托盘/右键这些是 Windows 特色 |

### D3. 体验增强

| 功能 | 说明 |
| --- | --- |
| **深色模式** ✅ | 随系统切换。**上游也没有**，是共同短板；已有 3 套配色方案可复用 |
| **配色主题切换** ✅ | 矿灯紫琥珀 / 森林手账 / 夜矿深色 —— 做成设置项即可 |
| **历史记录与收藏** ✅ | 常翻的站点一键再来；最近翻找记录 |
| **结果清单导出** ✅ | 导出 CSV / JSON，方便进素材库 |
| **磁盘空间预警** ✅ | 下载前检查目标盘剩余空间，不够时提前提示 |
| **完成通知** ✅ | 走 Windows 通知中心提示下载完成 |
| **重复页面命中缓存** | 同一 URL 二次翻找先读缓存，秒出结果 |

### D4. 工程与质量

| 项 | 说明 |
| --- | --- |
| 单元测试补齐 | 上游只有部分模块有测试；`crawler/`、`downloader/` 的核心逻辑仍缺覆盖 |
| 端到端测试 | 用本地 fixture 站点做抓取回归（上游有 fixture，但没进 CI） |
| 性能基线 | 记录大页面（1000+ 资源）的抓取耗时，作为回归基准 |

### D5. 建议的推进顺序

```
1. D1 全套（一天内可完成，立刻提升体验）
2. D2 的 CDP 网络层抓取（补上游最大短板，有技术含量）
3. D3 的深色模式 + 主题切换（有了色板，成本低）
4. D2 的浏览器扩展（做分发渠道）
5. D4（长期）
```

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
| 品牌图标 | 即梦 Seedream 4.6 生成熊头原稿，`scripts/make_icon_ai.py` 派生 32/128/256/ICO/ICNS + 顶栏 logo |
| 窗口尺寸 | 运行时按显示器工作区夹紧，物理 1550x990 完整可见 |
| 高度响应式 | 两档断点 + safe center，DOM 实测零溢出 |
| 配色 | 全站改「矿灯紫琥珀」，与吉祥物同色系 |
| 主题系统 | 3 套配色（矿灯紫琥珀 / 森林手账 / 夜矿深色），`src/theme.ts` 为唯一真相源 |
| 托盘与通知 | 系统托盘常驻 + 下载完成通知中心提醒 |
| 历史与收藏 | `core/history.rs`，历史与收藏落盘，首页一键直达 |
| 剪贴板直读 | 首页剪贴板按钮 + 托盘「翻找剪贴板链接」 |
| 多网址队列 | 批量排队翻找，结果自动合并 |
| 打包流水线 | `scripts/build_windows.ps1` 一条命令出 NSIS + MSI |