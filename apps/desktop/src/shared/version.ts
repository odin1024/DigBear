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
 * 仓库正式公开前留空：应用与官网都会显示「仓库地址待公布」，
 * 发布时只改这一处，两边同步生效。
 */
export const REPO_URL = "";