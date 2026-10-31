# macOS 安装与首次打开

CrawlBear 没有购买 Apple Developer Program（$99/年），因此发布包没有经过 Apple 公证。macOS 的 Gatekeeper 会拦截首次打开，这是预期的，不代表文件真的损坏。

## 方式一：安装包（推荐，自动放进「应用程序」）

1. 下载 `CrawlBear-macOS.pkg`；
2. 在 Finder 里**右键点按**安装包 →「打开」；
3. 如果提示“无法验证开发者”，去「系统设置 → 隐私与安全性」点「仍要打开」，再运行安装包；
4. 如果安装包完全打不开，先在终端执行：
   ```bash
   xattr -dr com.apple.quarantine ~/Downloads/CrawlBear-macOS.pkg
   ```
   然后双击安装包；
5. 安装器会自动完成：
   - 把 `CrawlBear.app` 放进 `/Applications`；
   - 清除应用隔离属性；
   - 重新做本地 ad-hoc 签名；
   - 安装完成后直接从「应用程序」打开即可。

> 安装包本身没有 Apple 公证，首次运行时仍可能被 Gatekeeper 拦一次；右键「打开」或「仍要打开」即可。若被 MDM 限制，见文末。


## 方式二：手动拖入（zip 包）

1. 解压 `CrawlBear-macOS.zip`。
2. 把 `CrawlBear.app` 拖进「应用程序」文件夹。
3. 如果双击提示“已损坏”“无法验证开发者”或“来自身份不明的开发者”，执行下面任一方式。

## 方式 A：右键打开（最简单）

1. 在 Finder 里找到 `CrawlBear.app`；
2. 按住 Control 键点按（或右键）→「打开」；
3. 弹窗里再点一次「打开」。

如果只看到“移到废纸篓”，用方式 B。

## 方式 B：终端移除 quarantine

打开「终端」，复制执行：

```bash
xattr -dr com.apple.quarantine /Applications/CrawlBear.app
open /Applications/CrawlBear.app
```

如果应用不在「应用程序」文件夹，把路径换成实际路径。

## 方式 C：重新做本地临时签名

仅当仍提示“已损坏”时使用：

```bash
xattr -dr com.apple.quarantine /Applications/CrawlBear.app
codesign --force --deep --sign - /Applications/CrawlBear.app
open /Applications/CrawlBear.app
```

这是本机临时签名，不会上传任何东西，也不需要开发者账号。

## 如果以上都无效

截图里的「允许以下来源的应用程序：App Store 与已知开发者」且显示“此设置已由描述文件配置”，说明这台 Mac 安装了 MDM / 企业描述文件，限制策略优先于个人设置。终端命令也可能被策略拦截。

这种情况下需要：

- 让设备管理员在 MDM 里允许该应用 / 放宽 Gatekeeper；或
- 使用管理员账号在「系统设置 → 隐私与安全性」中查看是否允许「仍要打开」；或
- 换一台没有 MDM 限制的 Mac。

不要为了安装应用关闭整个系统的 Gatekeeper（例如 `spctl --master-disable`），那会影响整台电脑的安全性。

## 为什么不做公证

Apple 公证要求付费开发者账号。项目当前采用：

- 构建后做 ad-hoc 签名，保证 `.app` 内部签名完整（避免真正的“已损坏”）；
- 分发时附上本说明；
- 用户首次打开时手动放行。

如果以后项目有预算/有发行需求，再考虑 Developer ID 签名 + notarization。
