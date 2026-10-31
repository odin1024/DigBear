# 发布规范

本文件定义掘掘熊 DigBear 的版本号策略、发布流程与产物要求。

## 一、版本号策略

遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/)：`主版本.次版本.修订号`。

| 变更类型 | 版本位 | 示例 |
| --- | --- | --- |
| 不兼容的 API / 配置变更、移除功能 | 主版本 | `1.0.0` |
| 新增功能、向后兼容 | 次版本 | `0.5.0` |
| 缺陷修复、性能优化、文档 | 修订号 | `0.4.1` |

### 预览版约定

正式发布前，功能已可用但未完成打包验证的版本，用 **次版本号 + `-pre.N` 预发布后缀**：

```
0.4.0-pre.1    首个候选版，功能冻结，只修缺陷
0.4.0-pre.2    验证中
0.4.0          正式版
```

预发布版**不写进 CHANGELOG 的正式段落**，只保留在 GitHub Releases 的预发布标签里。

### 版本号写在哪

版本号出现在 5 个地方，**发布时必须同步**（`scripts/check_version.py` 会校验）：

```
package.json                        "version"
apps/desktop/package.json           "version"
apps/website/package.json           "version"
apps/desktop/src-tauri/Cargo.toml   version = "..."
apps/desktop/src-tauri/tauri.conf.json  "version"
```

`Cargo.lock` 由 `cargo` 自动更新，不要手改。

## 二、发布流程

```
feature/* ──► PR ──► main ──► 打 tag ──► CI 构建 ──► GitHub Release
   │            │                    │
   │            └─ 评审 + CI 通过     └─ v0.4.0
   └─ Conventional Commits 提交信息
```

### 具体步骤

1. **冻结功能**：确认 CHANGELOG 的「未发布」段落已整理为正式版本段落
2. **同步版本号**：按上一节改 5 个文件，跑 `python scripts/check_version.py` 确认一致
3. **跑测试**：
   ```bash
   pnpm install
   pnpm test:rust          # Rust 单元测试
   pnpm build              # 前端构建
   ```
4. **打标签**：
   ```bash
   git tag -a v0.4.0 -m "掘掘熊 DigBear v0.4.0"
   git push origin main --tags
   ```
   标签必须是 `v` 前缀 + 纯版本号，不带任何后缀
5. **CI 自动构建**：`.github/workflows/release.yml` 监听 `v*` 标签，产出
   - Windows：NSIS 安装包 + MSI（`x64`）
   - macOS：`.pkg` + `.zip`（universal）
6. **发布**：CI 自动创建 GitHub Release 并上传产物与 `SHA256SUMS`
7. **人工复核**：下载产物实机安装一遍，确认能启动、能卸载

### 标签规则

| 标签 | 含义 | 是否公开 |
| --- | --- | --- |
| `v0.4.0` | 正式版 | 是 |
| `v0.4.0-pre.1` | 候选版 | 否（GitHub 勾选 prerelease） |
| `v0.4.0-rc.1` | RC，介于 pre 与正式之间 | 否 |

## 三、产物要求

| 平台 | 格式 | 文件名 | 备注 |
| --- | --- | --- | --- |
| Windows | NSIS | `DigBear_<version>_x64-setup.exe` | 推荐给个人用户 |
| Windows | MSI | `DigBear_<version>_x64_<locale>.msi` | 企业批量部署 |
| macOS | pkg | `DigBear-macOS.pkg` | 拖到 `/Applications` |
| macOS | zip | `DigBear-macOS.zip` | 便携分发 |

每个平台都必须附带 `SHA256SUMS`（CI 自动生成）。

## 四、代码签名

| 平台 | 现状 | 发布要求 |
| --- | --- | --- |
| macOS | 未公证、未签名 | 分发前需 Apple 公证，否则用户首次打开被拦 |
| Windows | 未签名 | 建议购买 OV 证书（约 $70/年）并用 `signtool` 签名 NSIS 与 MSI |

未签名时，必须在 Release 说明里明确写出：

> 应用未做代码签名，首次运行 Windows SmartScreen 会拦截，点「更多信息 → 仍要运行」。

## 五、发布检查清单

- [ ] CHANGELOG 的「未发布」段落已整理为正式段落，日期已填
- [ ] 5 处版本号一致（`scripts/check_version.py` 通过）
- [ ] `pnpm test:rust` 与 `pnpm build` 通过
- [ ] 实机安装并启动一次，确认界面正常、核心流程可用
- [ ] 产物齐全（对应平台的全部格式）+ `SHA256SUMS`
- [ ] Release 说明包含：功能亮点、已知限制、签名状态、系统要求
- [ ] 官网 / README 的下载链接指向新版本
- [ ] 打标签并推送

## 六、兼容性承诺

- **配置向后兼容**：旧版本 `settings.json` 必须能被新版本读取。
  Rust 侧新增字段一律加 `#[serde(default)]`
- **数据目录兼容**：`%APPDATA%\com.digbear.desktop` 下的配置、扩展、登录态在同一
  大版本内保持可用
- **破坏性变更**必须提升主版本，并在 CHANGELOG 的「破坏性变更」段落写明迁移方式