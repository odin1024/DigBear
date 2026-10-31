<div align="center">

# 掘掘熊 · DigBear

**输入一个网址，把网页里的图片、视频、音乐与字体收进本地文件夹。**

<img alt="Windows 10+" src="https://img.shields.io/badge/Windows-10%2B-0078D4?style=flat-square&labelColor=FFF7E8" />
<img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-F9C74F?style=flat-square&labelColor=FFF7E8" />
<img alt="Rust" src="https://img.shields.io/badge/Rust-2021-33261D?style=flat-square&labelColor=FFF7E8" />
<img alt="React" src="https://img.shields.io/badge/React-18-7FB6C9?style=flat-square&labelColor=FFF7E8" />
<img alt="只读 · 本机" src="https://img.shields.io/badge/%E5%8F%AA%E8%AF%BB-%E6%9C%AC%E6%9C%BA-5E9C68?style=flat-square&labelColor=FFF7E8" />
<img alt="MIT License" src="https://img.shields.io/badge/License-MIT-33261D?style=flat-square&labelColor=FFF7E8" />

</div>

## 这是什么

掘掘熊（DigBear）是一个跑在 **Windows** 本机的网页媒体翻找工具。粘贴任意网页地址，
它会打开一个不可见的浏览器窗口，扫描页面里的图片、视频、音乐与字体，让你筛选后批量保存到本地。

没有云端、没有账号、没有遥测；需要登录的站点也只在你自己的 WebView 里手动登录，
Cookie 不会离开这台电脑。

> 本项目是 [Crawl Bear（超级爬爬熊）](https://github.com/xw-meow/crawl-bear) 的 Windows 移植版，
> 上游为 macOS 版本，采用 MIT 许可证。**技术分析与逐文件改动说明见 [`PORTING.md`](./PORTING.md)。**

## 功能

- **通用发现**：不绑定特定网站，任意 `http(s)` 地址都能扫出媒体资源。
- **四类资源**：图片、视频、音频、字体 —— 分别来自 DOM、CSSOM、`performance` 资源计时、
  以及页面源码里的 HLS/DASH 清单，共 12 种采集来源。
- **勾选下载**：按类型过滤、预览、批量保存；直链走 `curl`，HLS/DASH 走 FFmpeg 重封装。
- **需要登录的站点**：在应用内打开的窗口里手动登录一次即可，登录态保存在本机 WebView 数据目录。
- **高清优先**：X（Twitter）优先取 master playlist；YouTube 走 innertube 接口取最高清的
  H.264 视频流与 AAC 音轨，再合并。
- **系统代理**：支持 `HTTPS_PROXY` 等环境变量，以及 Windows 的 WinINET 系统代理设置。

## 先试试看（不用装任何东西）

仓库里带了一个可直接双击运行的预览版：

```
build-preview\dig-bear.exe
```

双击即可运行，窗口标题是「掘掘熊 · DigBear」。
（旁边的三个 DLL 不能删、不能移动。）

> 这个预览版是 GNU 工具链编的 release 构建，体积 16 MB，仅用于先体验功能；
> 正式安装包需要 MSVC Build Tools，额外产出 NSIS / MSI 安装程序。
> 详细说明见 [`docs/PREVIEW.md`](./docs/PREVIEW.md)。

## 下载

安装包见 [Releases](https://github.com/your-org/dig-bear/releases)：

| 格式 | 说明 |
| --- | --- |
| `DigBear_*_x64-setup.exe` | NSIS 安装包，推荐个人使用 |
| `DigBear_*_x64_*.msi` | MSI，便于企业批量部署 |

> 应用**未做代码签名**，首次运行 Windows SmartScreen 会拦截，
> 点「更多信息 → 仍要运行」即可。

## 从源码构建

### 前置依赖

| 依赖 | 说明 |
| --- | --- |
| **Microsoft C++ Build Tools** | 安装 **「使用 C++ 的桌面开发」** 工作负载（含 MSVC 链接器与 Windows SDK）。**缺 `link.exe` 会直接编译失败** |
| Node.js ≥ 20 | 构建前端 |
| pnpm 12 | 依赖管理 |
| Rust stable（`x86_64-pc-windows-msvc`） | 后端 |
| WebView2 Runtime | 运行时；Win11 自带，Win10 可能需要单独安装 |

安装 Build Tools：

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools `
  --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

### 命令

```bash
pnpm install
pnpm test:rust              # Rust 单元测试
pnpm build:desktop:windows  # 产出 NSIS + MSI
```

产物：

```
apps/desktop/src-tauri/target/release/bundle/nsis/DigBear_0.4.0_x64-setup.exe
apps/desktop/src-tauri/target/release/bundle/msi/DigBear_0.4.0_x64_en-US.msi
```

### FFmpeg（可选）

HLS/DASH 下载与音视频合并需要 FFmpeg。应用内
**设置 → 扩展管理** 提供一键安装，安装的是应用私有的副本，不会污染系统 `PATH`。

## 隐私

- 只做只读发现，不向远程页面注入 Tauri IPC，不上传任何数据。
- 下载只允许 `http` / `https`，拒绝 `file:`、`javascript:`、`data:`。
- 登录信息只存在本机的 WebView 数据目录，不上传、不导出。

## 已知限制

- 第三方追踪像素（无扩展名的 `<img>`）会被识别为图片，需要手动过滤。
- `blob:` 流（MSE / 实时 HLS）、iframe 内部资源、closed shadow DOM 抓不到。
- 脚本在提取之后才设置的背景图抓不到。

## 开发与发布

```bash
pnpm install
pnpm test:rust           # Rust 单元测试
pnpm build               # 前端构建
pnpm check-version       # 校验 5 处版本号一致
pnpm build:desktop:windows
```

| 文档 | 内容 |
| --- | --- |
| [`CHANGELOG.md`](./CHANGELOG.md) | 更新日志（Keep a Changelog 格式） |
| [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md) | 开发规范：分支、提交信息、代码风格、测试要求 |
| [`docs/RELEASES.md`](./docs/RELEASES.md) | 发布规范：版本策略、发布流程、产物要求 |
| [`docs/ROADMAP.md`](./docs/ROADMAP.md) | 待优化清单 |
| [`PORTING.md`](./PORTING.md) | 从 macOS 到 Windows 的分析与实施记录 |

提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)。

## 致谢

上游作者 [xw-meow](https://github.com/xw-meow) 与所有贡献者。许可与致谢见 [`NOTICE.md`](./NOTICE.md)。