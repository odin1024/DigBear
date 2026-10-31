# 更新日志

本文件记录 **掘掘熊 DigBear** 的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

本项目从上游 [Crawl Bear（超级爬爬熊）](https://github.com/xw-meow/crawl-bear) 移植而来。
上游使用 GitHub Releases 管理版本，没有 CHANGELOG；`0.3.2` 及更早的变更请查阅
[上游 Releases](https://github.com/xw-meow/crawl-bear/releases)。

## [未发布]

> 此处记录尚未发布的变更。发布时按 `docs/RELEASES.md` 的流程整理到正式版本段落。

## [0.4.0] - 2026-10-31

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
- 真实抓取 `https://www.rust-lang.org/`：16 张图片 + 90 个字体，零 warning
- 真实下载 106 个文件全部成功，零字节文件 0 个
- 全中文配置目录 + 全中文下载目录下，抓取与下载均通过
- 布局 DOM 实测 `documentElement.scrollWidth == innerWidth`，横向零溢出

### 已知限制

- 尚未产出 Windows 安装包（缺 Microsoft C++ Build Tools）
- X / YouTube 高清流、需要登录的站点、FFmpeg 扩展安装流程尚未在 Windows 上实机验证
- `apps/website` 官网仍为上游品牌，待改造
- 应用未做代码签名

[未发布]: https://github.com/your-org/dig-bear/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/your-org/dig-bear/releases/tag/v0.4.0