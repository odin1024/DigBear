# 开发规范

面向所有参与掘掘熊 DigBear 的人（也包括未来的自己）。

## 一、分支模型

| 分支 | 用途 | 合并到 |
| --- | --- | --- |
| `main` | 始终可发布的稳定版本 | — |
| `feature/<简述>` | 新功能 | `main` |
| `fix/<简述>` | 缺陷修复 | `main` |
| `chore/<简述>` | 构建、依赖、工具链 | `main` |

- 分支名用小写与连字符，简述控制在 6 个词以内：`feature/cdp-network-capture`
- 单个 PR 尽量聚焦一件事；混入无关改动会被要求拆分
- `main` 只接受通过 CI 的 PR，**不直接向 `main` 推送**

## 二、提交信息

遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)：

```
<类型>(<作用域>): <主题>

[正文]

[脚注]
```

**类型**

| 类型 | 用于 |
| --- | --- |
| `feat` | 新功能 |
| `fix` | 缺陷修复 |
| `perf` | 性能优化 |
| `refactor` | 重构，不改变行为 |
| `style` | 格式调整（不改变逻辑） |
| `docs` | 文档 |
| `test` | 测试 |
| `build` | 构建系统、依赖 |
| `ci` | 流水线 |
| `chore` | 杂项 |

**作用域**用模块名：`feat(crawler)`、`fix(downloader)`、`docs(website)`。

**主题**：祈使句、50 字以内、不加句号。

```
feat(crawler): 用 CDP 捕获网络层媒体请求，补上 blob: 流
fix(downloader): 修正 Windows 下结尾空格文件名与磁盘不一致
docs: 补充 Windows 版的构建前置依赖
```

破坏性变更用 `!` 标记并在脚注写 `BREAKING CHANGE:`。

## 三、代码规范

### Rust

```bash
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings
```

- 平台差异必须用 `#[cfg(...)]` 隔离，且**两边的分支都要能编译**
- 平台相关的常量、路径、命令要抽到同一处，不要散落在多个文件
- 公开函数写 `///` 文档注释，说明「为什么这么做」而不只是「做了什么」
- 新增依赖前先确认 crates.io 上已有等价实现

### TypeScript / React

```bash
pnpm --filter @dig-bear/desktop exec tsc --noEmit
```

- 组件保持单一职责；`features/` 按业务分目录，`shared/` 只放跨功能复用的东西
- 设计令牌集中在 `src/styles.css` 的 `:root` 与 `src/theme.ts`，**不要在组件里写死颜色**
- 交互元素必须有键盘可达性与 `aria` 标注

### Python（脚本）

```bash
python scripts/make_icon.py --help
```

- 脚本要能独立运行，参数用 `argparse`
- 写文件用 UTF-8、LF 换行，且**不写 BOM**（Rust / JSON 不接受 BOM）

## 四、测试要求

| 改动类型 | 必须补的测试 |
| --- | --- |
| 修缺陷 | 一个能复现该缺陷的单元测试 |
| 加纯函数 | 对应的 `#[cfg(test)]` 测试 |
| 改平台分支 | **两个平台都要编译通过**，并尽量实机验证 |
| 改抓取逻辑 | 用本地 fixture 站点验证，断言资源条数与类型 |

```bash
pnpm test:rust        # cargo test --lib
```

跨层改动（抓取 → 下载）必须实机跑一遍完整链路：

```powershell
$env:DIGBEAR_TEST_URL = "https://www.rust-lang.org/"
$env:DIGBEAR_TEST_DOWNLOAD = "1"
$env:DIGBEAR_TEST_MEASURE = "1"    # 顺便输出布局测量
& ".\apps\desktop\src-tauri\target\debug\dig-bear.exe"
```

## 五、文档要求

| 改动 | 要同步的文档 |
| --- | --- |
| 新增 / 移除 Tauri 命令 | `docs/API_CONTRACT.md` |
| 新增 / 移除设置项 | `docs/API_CONTRACT.md` 的 `AppSettings` |
| 改动设计令牌 | `docs/design.md`、`src/styles.css`、`src/theme.ts` |
| 新增站点解析器 | `docs/media-extraction.md` |
| 用户可见行为变化 | `README.md`、`CHANGELOG.md` 的「未发布」段落 |
| 平台差异 | `PORTING.md` |

## 六、版本号

**功能合并进 `main` 时不要改版本号**。版本号只在发版时统一改（见 `docs/RELEASES.md`）。

## 七、PR 流程

1. 从 `main` 切分支
2. 提交（遵循 Conventional Commits）
3. 本地跑通：`pnpm test:rust` + `pnpm build`
4. 开 PR，描述里写清：**改了什么、为什么、怎么验证**
5. 等 CI 通过 + 评审通过 → 合并
6. 合并后删分支

### PR 描述模板

```markdown
## 改动
（做了什么，一两句话）

## 原因
（对应的 issue 或问题现象）

## 验证
- [ ] `pnpm test:rust` 通过
- [ ] `pnpm build` 通过
- [ ] 实机验证：（做了什么操作，看到什么结果）

## 截图
（界面有变化时必填）
```