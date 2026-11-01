# 更新日志

本文件记录 **掘掘熊 DigBear** 的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

本项目从上游 [Crawl Bear（超级爬爬熊）](https://github.com/xw-meow/crawl-bear) 移植而来。
上游使用 GitHub Releases 管理版本，没有 CHANGELOG；`0.3.2` 及更早的变更请查阅
[上游 Releases](https://github.com/xw-meow/crawl-bear/releases)。

## [未发布]

> 新内容先记在这里，发版时按 `ddocs/RELEASES.md` 的流程整理到正式版本段落。

### 新增 · 官网托管到 GitHub Pages

- 新增 `.github/workflows/pages.yml`：构建后直接部署到 GitHub Pages，
  免费、免服务器，地址 <https://odin1024.github.io/DigBear/>
- 删除原来的腾讯云 COS 部署工作流（需要额外密钥，已被 Pages 取代）
- 新增 `scripts/make_og_cover.py`：生成 1200×630 社交分享封面
- README 顶部加「官网 / 下载 / 反馈」快捷入口，仓库主页也指向官网

### 修复

- 官网 `index.html` 的标题、描述、OG 标签**还是上游的**（写着 macOS、超级爬爬熊），
  全部换成掘掘熊与 Windows 定位
- 官网 4 处图片引用指向仓库里并不存在的 `assets/generated/*.png`，
  每个页面白发出 4 个 404 —— 现在按需探测，不再请求不存在的文件
- 官网遗留的上游标识：包名 `@crawl-bear/website` → `@dig-bear/website`、
  语言存储键 `crawl-bear-locale` → `digbear-locale`、样式表头注释
- `ocs/RELEASES.md` 与实现脱节：版本号校验点 5→8 处、去掉已不再产出的 macOS 产物要求
- `scripts/build_windows.ps1` 写死了本机的 GNU 工具链，别人 clone 下来编不了；
  现在检测不到 GNU 工具链时自动回退到系统 MSVC
- 删掉 `apps/desktop/public/assets` 里 7 张没人引用的 PNG（约 3.6 MB）：
  前端实际只用 WebP，这些 PNG 只是白白撑大安装包

## [0.4.0] - 2026-11-01

Windows 移植版的首个正式发布版。相对上游 `0.3.2`，补齐了全部 Windows 平台分支，
重做了全部自有品牌资产，并在功能与体验上做了自己的扩展。

### 新增 · YouTube 页面级支持

- YouTube 观看页里没有 `<video src>`，光扫 DOM 一个视频都拿不到；
  现在抓取到这类页面时，会补一个指向页面本身的视频资源，
  下载阶段由解析器去问 innertube 要最高清的 H.264 视频流与 AAC 音轨，再用 FFmpeg 合并
- innertube 支持多客户端身份轮换（VISIONOS → ANDROID → IOS）：
  单个身份被 IP 级风控挡下时（`Sign in to confirm you're not a bot`）还有下一次机会
- 解析请求会带上应用内登录留下的 Cookie：
  `PageVideoResolver` 现在能拿到 `AppHandle`，登录过 YouTube 之后不再容易被判成机器人

### 改进 · 抓取更稳更快

- WebView 等待条件加「软期限」：不少 SPA 永远等不到 `readyState == complete`
  （长连接、轮询、被限速的第三方脚本），但 DOM 早就可读了 —— 内容够了就动手
- 实测 X（`x.com/NASA`）抓取从 **77 秒（超时后走 HTML 兜底）降到 18 秒**，
  资源从 14 张图增到 25 张，且不再走兜底路径
- 页面加载超时从 35 秒放宽到 60 秒，重站点（YouTube、电商首页）不再被误判

### 工程 · 无头自动测试

- 新增 `DIGBEAR_TEST_HEADLESS=1`：跑自动化抓取时藏起主窗口，不打扰正在用电脑的人
- 新增 `DIGBEAR_TEST_AUTOEXIT=1`：测完自动退出，不用手动关进程
- 新增 `DIGBEAR_TEST_KINDS=video,image`：只下载指定类型的资源
- 新增 `DIGBEAR_TEST_RESOLVE=1`：只解析不下载，用来诊断直链是否取得到
- `devtest.rs` 的 FFmpeg 安装分支也支持自动退出

### 其它

- 仓库地址填为 `https://github.com/odin1024/DigBear`：应用内「开源仓库」、
  官网源码链接、README 与 CHANGELOG 的比较链接都用它

### 新增 · 恢复出厂设置

- 设置页新增「数据与关于」卡片，底部一个「恢复出厂设置」按钮：
  一次清空历史记录、收藏、下载清单、登录状态（Cookie）与全部设置，
  让应用回到刚装好的样子
- 二次确认弹窗明确说明「不可撤销」，按钮为危险色
- 新增 `reset_all_data` 命令、`HistoryStore::clear_favorites`、
  `DownloadManifest::clear` 与 `session::clear_all_sessions`

### 改进 · 免安装预览版与正式版数据隔离

- 预览版 exe 同目录放一个 `digbear-preview.marker` 标记文件，
  应用据此把配置写到 `<配置目录>/preview` 子目录
- 开发时在预览版翻找出的历史与收藏，不会再出现在用户装好的正式版里

### 修复

- 设置页「关于」卡片里的版本号一直写死 `v0.3.2`，改为读 `APP_VERSION`
- 浏览器预览模式下设置页只显示一行报错，改为说明「这是界面预览」并给出提示

### 改进 · 顶部层级去重

- 关于页去掉了大 logo 横幅卡片，改成一行页头（标题 + 一句说明 + 版本 chip）：
  整页的 logo 只剩顶部导航一处，窗口标题栏那枚算系统自己的
- 原生菜单栏去掉与页内导航重复的「翻找」，只保留设置 / 关于 / 退出、编辑、
  主题切换、源码仓库 —— 菜单栏只管应用级操作，页面切换交给顶部导航
- 关于页内容垂直居中（`safe center`），上下留白均衡，不再上挤下空
- 底部信息合并成一行：去设置登录站点 · 上游致谢

### 修复

- 顶部导航栏的 GitHub 图标点了没反应：之前用的是 `<a href>`，
  Tauri 会拦截 webview 内的外链导航。改成按钮 + `api.openUrl()` 走系统浏览器，
  浏览器预览模式下退化为 `window.open`

### 改进 · 关于页排版

- 关于页改成三列平铺，标题区压缩成一行：
  默认一屏就能看完全部内容，不再有右侧滚动条
- 三张卡片改为**等高**（网格 stretch + 卡片弹性列），标题下统一加虚线分隔线，
  文案精简到不会有孤字成行，行距与留白重新调过
- 移除卡片里的「查看源代码」按钮，改成**顶部导航栏右侧的 GitHub 图标链接**，
  圆形描边按钮，和导航项同一套视觉
- 页面底部补一行上游致谢
- 二维码换成真的公众号二维码（桌面端与官网各一份）

### 工程 · 排版自查工具

- 新增 `scripts/shoot_about.mjs`：用无头浏览器渲染「关于」页并截图，
  同时输出三张卡片的位置尺寸与是否溢出，用于排版回归
- `devtest` 的布局测量支持 `DIGBEAR_TEST_VIEW=about|settings`，可切页后测量

### 新增 · 浏览器扩展、深链与资源管理器右键菜单

- 新增 `apps/extension`（Manifest V3）：浏览器里一键把当前页交给掘掘熊翻找
- 注册 `digbear://` 协议：扩展唤起、外部链接都能直接触发翻找
- 新增 `tauri-plugin-single-instance`：已经在运行时再次唤起不再开第二个窗口，
  而是把网址转交给已有窗口并把它叫到前台
- 资源管理器文件夹右键菜单「用掘掘熊翻找链接」：新增 `--folder <path>`，
  扫描文件夹里的 `.url` 快捷方式与文本文件中的网址，直接排进翻找队列
- 新增 `core/folder.rs`：本地文件夹网址扫描（URL 快捷方式 + 文本正则提取）

### 新增 · 关于页与联系入口

- 原来的「关于」弹窗改成独立的**关于页**，顶部导航新增「关于」页签，
  原生菜单的「关于」也改为跳转到同一页，两边体验统一
- 关于页新增公众号二维码卡片：扫一扫即可给作者反馈问题与建议
- 关于页同时展示版本号、许可证、项目简介与隐私须知
- 官网页脚新增「扫码联系作者」二维码与引导语，方便从项目介绍页直接反馈
- 二维码素材统一放在 `assets/author-qr.png`（桌面端与官网各一份），
  目前是占位图，替换同名文件即可生效

### 改进 · 菜单与版本号

- 原生菜单栏扩充为「DigBear / 编辑 / 视图 / 帮助」：
  - DigBear：翻找、设置、关于、退出
  - 视图：三套主题（矿灯紫琥珀 / 森林手账 / 夜矿深色）可直接切换
  - 帮助：开源仓库入口（仓库地址公布后可直接点开）
- 顶部导航栏与原生菜单项一一对应，界面里的每个入口在菜单里都能找到
- 版本号改为单一来源：新增 `apps/website/src/version.ts`，
  官网安装包名与页脚版本号不再硬编码
- `scripts/check_version.py` 校验点从 6 处增加到 8 处
  （新增官网版本常量与浏览器扩展 `manifest.json`）

### 工程

- `scripts/run_unit_tests.py` 内置 GNU 工具链环境变量（RUSTUP_HOME / CARGO_HOME /
  RUSTUP_TOOLCHAIN / PATH），不再依赖外部手工设置即可运行
- 单元测试增加到 31 个（新增本地文件夹网址扫描用例）

### 新增 · 多网址批量翻找队列

- 首页输入框旁新增「加入队列」按钮，可把多个网址排进队列
- 队列非空时点「开始翻找」按顺序逐个翻找，结果合并成一份清单
- 队列条目可单独移除，也可一键清空
- 队列翻找同样会逐条写进历史记录

### 新增 · 历史记录与收藏

- 新增 `core/history.rs`：历史与收藏分别落在配置目录的 `history.json` / `favorites.json`
- 历史记录同一网址只保留最新一条，最多 100 条，重复翻找会顶到最前面
- 结果页顶栏新增「收藏」按钮，一键把常翻的站点存下来
- 首页展示「收藏的站点」与「最近翻找」两组快捷入口，点一下就填进输入框
- 收藏可单独取消，历史可一键清空

### 新增 · 剪贴板直读

- 新增 `tauri-plugin-clipboard-manager`，首页输入框旁新增剪贴板按钮，一键读出网址
- 系统托盘菜单「翻找剪贴板链接」此前只发了事件、前端没接 —— 现在真正可用：
  读出剪贴板、识别出网址后直接开始翻找

### 修复

- 首页内容变高后顶部被裁：吉祥物气泡与标题会被 `justify-content: center` 切掉，
  改用首尾子元素的 auto margin 实现居中，内容超高时改为从顶部排、完整可滚动
- 关于弹窗里的版本号一直写着 `v0.3.2`，与实际版本脱节；
  改为读 `src/shared/version.ts` 的 `APP_VERSION`，并纳入 `scripts/check_version.py` 的校验
- `pnpm install` 在 pnpm 12 下会因 esbuild 的构建脚本未授权而失败，
  `pnpm-workspace.yaml` 的 `allowBuilds` 已补齐
- pnpm 会跳过 `@tauri-apps/cli` 的 Windows 平台二进制包，导致 `tauri` 命令不可用；
  改为在 `apps/desktop/package.json` 的 `optionalDependencies` 里显式声明

### 新增 · 一键全收下与下载清单

- 结果页工具栏新增「全收下（N）」：把当前筛选出来的资源一次收进采集袋，不用逐个勾选
- 新增 `core/manifest.rs`：下载完成的资源记进配置目录的 `downloads.json`
- 再次翻到同一个页面时，已经下过、文件还在的资源直接跳过，不再重走一遍网络；
  结果页提示里会说明「N 件之前下过，已跳过」
- 下载清单每完成 5 件落一次盘，长任务中途被打断也不丢记录

### 新增 · 只看大图与按类型分目录

- 结果页工具栏新增「只看大图」筛选：可按最小宽度过滤（320 / 640 / 1280 / 1920），
  尺寸未知的资源（视频、字体等）照常保留
- 设置页新增「按类型分目录」：开启后同一站点下再分 `images` / `videos` /
  `audio` / `fonts` 四个子目录，每个类型用独立的路径规划器，不会互相覆盖

### 新增 · 抓得更全：iframe 与 Shadow DOM

- 注入脚本新增 `scanMediaIn()`：同源 `<iframe>` 与开放模式的 Shadow DOM 里的
  图片、视频、字体、poster 现在都会被收进来 —— 上游版本抓不到这两层
- 同源 iframe 以自身的地址解析相对路径，不会把资源算到顶层页面的域名上
- 跨域 iframe 读不到内容时会记一条提示，说明为什么少了一部分素材
- 补充 `<track>`、`<object data>`、`<embed src>` 的资源发现
- 资源来源新增 `iframe` / `shadow` 两种标记，结果里能看出素材来自哪一层

### 修复 · 下载稳定性

- 去掉 curl 自带的 `--retry 3`：它会和外层重试层叠加，一个文件最坏要等 3×900 秒才放弃
- 改用 `--speed-limit/--speed-time`：连接长时间零速时快速失败，而不是干等
- 单文件时间上限从 900 秒放宽到 1800 秒，慢速网络下的大文件能下完
- **断点续传**：重试时用 `curl -C -` 接着已有的半成品继续下，
  服务器不支持 Range 时自动删掉半成品从头再来
- 读取 JSON 配置时剥掉 UTF-8 BOM：Windows 记事本与 PowerShell 写出的 BOM
  会让 serde_json 直接报「expected value at line 1 column 1」

### 工程

- 新增 `scripts/build_windows.ps1`：把源码同步到纯 ASCII 路径的构建目录，
  自动修正 GNU 工具链下的 `crate-type` 与 `beforeBuildCommand`，编译、打包并收集安装包
- `scripts/check_version.py` 增加 `src/shared/version.ts` 版本号校验


Windows 移植版首个正式版本。相对上游 `0.3.2`，补齐了全部 Windows 平台分支，
并重做了全部自有品牌资产。

### 平台 · Windows 移植

- WebView UA 拆分为平台常量（`SAFARI_USER_AGENT` → `BROWSER_USER_AGENT`），
  浏览器与 HTTP 下载器共用同一身份，避免 CDN 看到两个不同的客户端
- 新增 WinINET 系统代理读取（`HKCU\...\Internet Settings`），环境变量优先于系统设置
- 文件名规则补齐 Windows 专属约束：DOS 保留设备名（`CON`/`NUL`/`COM1`…）、
  结尾点与空格（Windows 会静默丢弃）、260 字符路径预算
- 默认下载目录改用 known-folder API，修复上游在 Windows 上因缺少 `HOME` 环境变量
  而退化成 `./Downloads/…` 的问题
- `curl.exe` 定位改用 `System32`；`explorer /select,` 与 `cmd /C start` 替代 macOS 的 `open`
- FFmpeg 扩展改用 Windows 发行包 `ffmpeg-win32-x64.gz`，可执行文件名改为 `ffmpeg.exe`
- 打包目标加入 NSIS 与 MSI，配置 WebView2 运行时引导（`downloadBootstrapper`）与中英文 NSIS 语言包
- CI 矩阵加入 `windows-2022`；Release 流水线拆分为 `windows` 与 `macos` 两个独立 job

### 平台 · 窗口与布局

- 新增 `fit_window_to_work_area()`：启动时按主显示器工作区把窗口夹紧并居中。
  修复上游硬编码 `1240×900` 在 1920×1080 / 125% 缩放下**窗口大于屏幕**、
  标题栏与上下边框被顶掉的问题
- `.home-page` 改用 `justify-content: safe center` 并允许滚动，
  修复矮屏下内容溢出被直接裁掉的问题
- 新增 `≤860px` / `≤720px` 两档高度断点，收紧留白并按比例缩小吉祥物
- `Mascot` 组件尺寸不再写死，改为跟随 `.hero__mascot-stage`，修复矮屏下内部溢出 60px

### 新增 · 实用功能

- **下载失败自动重试**：网络抖动、CDN 限流、签名链接过期这类瞬时失败不再直接判死。
  指数退避重试（400ms → 800ms → 1600ms），次数可在设置里调（0–5，默认 2 次）。
  格式非法、协议不支持这类确定性错误不消耗重试次数
- **结果排序**：除分类筛选外，可按「分辨率 / 时长 / 文件名」排序，默认保持发现顺序
- **重试失败项**：结果页列出没收到的文件与失败原因，并提供「重试全部」一键重下
- **键盘快捷键**：`Ctrl/Cmd+V` 粘贴、`Ctrl/Cmd+A` 全选当前、`Ctrl/Cmd+,` 打开设置、
  `Esc` 取消下载 / 返回首页 / 清空输入
- **拖拽链接**：把浏览器地址栏的链接直接拖进窗口即可翻找
- **设置项「失败重试」**：与「同时下载」「单次最多」并列，可调每件失败文件的重试次数

### 品牌

- 项目更名为 **掘掘熊 DigBear**，标识 `com.digbear.desktop`
- 应用图标、标题栏图标、顶栏 logo 全部重做：即梦 Seedream 4.6 生成熊头原稿，
  经 `scripts/make_icon_ai.py` 派生 32/128/256 PNG、ICO、ICNS 与 WebP
- 六只吉祥物（hero / crawl / empty / happy / error / login）全部重做，
  与图标共用同一套设计语言：奶油毛 + 琥珀矿工帽 + 深紫描边
- 配色统一为「矿灯紫琥珀」：墨紫描边统一全站线条，琥珀做强调，冷纸白做底，
  主色按钮保留珊瑚红以保证辨识度（`styles.css` 22 处 + `theme.ts` 18 处）
- 新增品牌资产流水线脚本：`make_icon.py`、`make_icon_ai.py`、`gen_mascots.py`、
  `install_mascots.py`、`jimeng_gen.py`、`_imgutil.py`

### 修复

- **白屏**：直接用 `cargo build` 产出时缺少 `custom-protocol` feature，
  前端被指向 `localhost:1420` 而无法加载。正式构建须走 `tauri build`
- Windows 上系统代理完全失效（上游仅有 macOS 分支）
- Windows 保留设备名文件无法创建；结尾点/空格的文件名与磁盘实际名字不一致
- 路径超过 260 字符时创建失败
- `jimeng_gen.py` 不识别 `binary_data_base64` 返回，且会把 MB 级响应整体打印到终端

### 工程

- 自测钩子 `devtest` 由 `#[cfg(debug_assertions)]` 改为常编译，release 版也可用于排查问题
- 新增 `DIGBEAR_TEST_MEASURE=1`：输出窗口内各关键容器的实际宽度与溢出量
- 新增 `DIGBEAR_TEST_RESIZE=<px>`：以指定物理宽度调整窗口，用于验证响应式断点
- 新增 `docs/ROADMAP.md`：按「必做 / 该做 / 增强」三档维护待优化清单
- 新增 `docs/PREVIEW.md`、`docs/RELEASES.md`、`docs/CONTRIBUTING.md`
- 继承自上游的 6 份文档补充「来源说明」开头，原始 MIT 声明保留在 `LICENSE`

### 验证

- `cargo check --lib` 通过；Windows 专属单元测试 10/10 通过
- 新增 URL 预校验单元测试 3 例（格式非法 / 非 http(s) 协议 / 正常地址）全部通过
- 旧版 `settings.json`（无 `retry_count` 字段）可被新版本正常读取并下载成功，向后兼容
- 真实抓取 `https://www.rust-lang.org/`：16 张图片 + 90 个字体，零 warning
- 真实下载 106 个文件全部成功，零字节文件 0 个
- 全中文配置目录 + 全中文下载目录下，抓取与下载均通过
- 布局 DOM 实测 `documentElement.scrollWidth == innerWidth`，横向零溢出

### 已知限制

- 尚未产出 Windows 安装包（缺 Microsoft C++ Build Tools）
- X / YouTube 高清流、需要登录的站点、FFmpeg 扩展安装流程尚未在 Windows 上实机验证
- `apps/website` 官网仍为上游品牌，待改造
- 应用未做代码签名

[未发布]: https://github.com/odin1024/DigBear/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/odin1024/DigBear/releases/tag/v0.4.0