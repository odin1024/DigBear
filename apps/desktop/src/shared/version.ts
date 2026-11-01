/**
 * 应用版本号。
 *
 * 与 `package.json`、`Cargo.toml`、`tauri.conf.json` 保持一致；
 * 发布前用 `python scripts/check_version.py` 校验。
 */
export const APP_VERSION = "0.4.0";

/**
 * 开源仓库地址。
 *
 * 应用里的「开源仓库」入口、官网上的源码链接都指向这里；
 * 仓库地址变更时只改这一处。
 */
export const REPO_URL = "https://github.com/odin1024/DigBear";