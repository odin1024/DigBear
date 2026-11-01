# -*- coding: utf-8 -*-
"""在独立的小 crate 里跑纯逻辑单元测试。

主 crate 依赖 Tauri / WebView2，直接 `cargo test` 会因为加载 WebView2
运行库失败（0xC0000139）。这里把不依赖桌面能力的模块复制到一个临时
crate 里跑测试 —— 这些模块本来就是纯逻辑，单独测更轻更快。

用法：
    python scripts/run_unit_tests.py
"""
import io
import os
import shutil
import subprocess
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "apps", "desktop", "src-tauri", "src")

# 需要被测的模块（不依赖 tauri）
COPIED = [
    os.path.join("core", "models.rs"),
    os.path.join("core", "naming.rs"),
    os.path.join("core", "classify.rs"),
    os.path.join("core", "url.rs"),
    os.path.join("core", "history.rs"),
    os.path.join("core", "manifest.rs"),
    os.path.join("downloader", "paths.rs"),
]

STUB_ERROR = '''//! 测试用的错误类型（去掉 tauri 依赖）。

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
}

impl AppError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self { code: code.into(), message: message.into() }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new("internal_error", message)
    }

    pub fn invalid_url(message: impl Into<String>) -> Self {
        Self::new("invalid_url", message)
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        Self::internal(format!("文件操作失败: {value}"))
    }
}

impl From<serde_json::Error> for AppError {
    fn from(value: serde_json::Error) -> Self {
        Self::internal(format!("数据格式错误: {value}"))
    }
}

impl From<url::ParseError> for AppError {
    fn from(value: url::ParseError) -> Self {
        Self::invalid_url(format!("链接格式不正确: {value}"))
    }
}
'''

CARGO_TOML = '''[package]
name = "dig-bear-unit-tests"
version = "0.0.0"
edition = "2021"

[dependencies]
url = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
percent-encoding = "2"
dirs = "7"
regex = "1"
'''

LIB_RS = '''pub mod core {
    pub mod error;
    pub mod models;
    pub mod naming;
    pub mod classify;
    pub mod url;
    pub mod history;
    pub mod manifest;
}
pub mod downloader;
'''


def workspace_dir():
    """临时 crate 放哪儿。

    优先用 DIGBEAR_TEST_DIR，其次复用构建用的 ASCII 盘（E:），
    最后才落到仓库内的 _test-artifacts —— C 盘空间紧张，尽量别往那儿写。
    """
    override = os.environ.get("DIGBEAR_TEST_DIR")
    if override:
        return override
    for candidate in ("E:\\digbear-build", "D:\\digbear-build"):
        if os.path.isdir(candidate):
            return os.path.join(candidate, "unit-harness")
    return os.path.join(ROOT, "_test-artifacts", "unit-harness")


def main():
    target = workspace_dir()
    if os.path.isdir(target):
        shutil.rmtree(target, ignore_errors=True)
    os.makedirs(os.path.join(target, "src"), exist_ok=True)

    for relative in COPIED:
        src = os.path.join(SRC, relative)
        dst = os.path.join(target, "src", relative)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(src, dst)

    with io.open(os.path.join(target, "src", "core", "error.rs"), "w", encoding="utf-8") as handle:
        handle.write(STUB_ERROR)
    with io.open(os.path.join(target, "src", "downloader", "mod.rs"), "w", encoding="utf-8") as handle:
        handle.write("pub mod paths;\n")
    with io.open(os.path.join(target, "src", "lib.rs"), "w", encoding="utf-8") as handle:
        handle.write(LIB_RS)
    with io.open(os.path.join(target, "Cargo.toml"), "w", encoding="utf-8") as handle:
        handle.write(CARGO_TOML)

    env = dict(os.environ)
    env.setdefault("CARGO_TARGET_DIR", os.path.join(target, "target"))
    print("unit test crate: %s" % target, flush=True)
    result = subprocess.run(
        ["cargo", "test", "--quiet"],
        cwd=target,
        env=env,
    )
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())