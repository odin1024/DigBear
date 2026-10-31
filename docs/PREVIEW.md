# 预览版使用说明（Windows）

`build-preview/` 里是一个**可以直接双击运行**的预览版，用来先体验功能。
它用 **GNU 工具链**编出来的 **release 优化版本**，**不是正式安装包**。

## 目录内容

```
build-preview/
├─ dig-bear.exe              ← 双击这个（16 MB）
├─ WebView2Loader.dll        ← WebView2 加载器（必须和 exe 同目录）
├─ libgcc_s_seh-1.dll        ← GNU 运行库
└─ libwinpthread-1.dll       ← GNU 运行库
```

> 三个 DLL **不能删、不能移动**。这是 GNU 工具链的运行依赖；
> 正式安装包用 MSVC 编译，不带这些。

## 运行

直接双击 `dig-bear.exe`。窗口标题应该是 **「掘掘熊 · DigBear」**。

如果双击没反应或者闪退，看下面几条：

| 现象 | 处理 |
| --- | --- |
| 提示缺少 `WebView2Loader.dll` | 确认三个 DLL 还在同目录 |
| 提示缺少 `VCRUNTIME140.dll` | 装 VC++ 运行库：<https://aka.ms/vs/17/release/vcr_redist.x64.exe> |
| 窗口空白 | 确认已安装 WebView2 运行时：<https://developer.microsoft.com/microsoft-edge/webview2/> |
| 杀毒软件拦截 | 未做代码签名，选「仍要运行」或加白名单 |

## 怎么用

1. 顶部输入框粘贴网址 → 回车。
2. 后台会打开一个**看不见的浏览器窗口**扫描页面，扫完列出图片/视频/音频/字体。
3. 用分类标签筛选，点卡片能预览。
4. 勾选想保存的 → 点下载 → 批量存到本地。

**需要登录的站点**：设置 → 登录管理 → 添加站点 → 打开，在弹出的窗口里手动登录一次，关闭即可（登录态存在本机）。

## 下载目录

默认落在 `%USERPROFILE%\Downloads\DigBear\<站点域名>`。

**C 盘紧张的话**，去 **设置 → 下载目录** 改成 F 盘，比如：

```
F:\自媒体\AI编程\掘掘熊DigBear\_test-artifacts\downloads
```

## 这个预览版的已知限制

| 限制 | 说明 |
| --- | --- |
| 没有安装/卸载 | 直接 exe 运行，不写注册表、不进开始菜单 |
| 未做代码签名 | 部分杀毒软件可能提示 |
| 不含 FFmpeg | HLS/DASH 视频和音视频合并需要它：在 **设置 → 扩展管理** 里一键安装（应用会下载 Windows 版，约 30 MB） |
| 不含官网 | `apps/website` 还是上游品牌，未改造 |

## 已经实测过的

这台机器上跑通过的：

- 真实抓取 `https://www.rust-lang.org/` → 16 张图片 + 90 个字体，零 warning
- 真实下载 106 个文件 → 全部成功，0 失败
- GUI 窗口正常创建（标题「掘掘熊 · DigBear」）

## 接下来怎么出正式安装包

正式版需要 **Microsoft C++ Build Tools**（装「使用 C++ 的桌面开发」工作负载），
然后在项目根目录：

```powershell
pnpm install
pnpm build:desktop:windows
```

产物：

```
apps/desktop/src-tauri/target/release/bundle/nsis/DigBear_0.4.0_x64-setup.exe
apps/desktop/src-tauri/target/release/bundle/msi/DigBear_0.4.0_x64_en-US.msi
```

详细背景见 [`../PORTING.md`](../PORTING.md)。