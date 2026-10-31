# -*- coding: utf-8 -*-
"""校验各处的版本号是否一致。

发布前必须通过：python scripts/check_version.py
"""
import io, json, os, re, sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(p):
    with io.open(os.path.join(ROOT, p), "r", encoding="utf-8") as f:
        return f.read()


def pkg_version(path):
    return json.loads(read(path)).get("version")


def toml_version(path):
    m = re.search(r'^version\s*=\s*"([^"]+)"', read(path), re.M)
    return m.group(1) if m else None


def conf_version(path):
    return json.loads(read(path)).get("version")


def ts_version(path):
    m = re.search(r'APP_VERSION\s*=\s*"([^"]+)"', read(path))
    return m.group(1) if m else None


SOURCES = [
    ("package.json", pkg_version),
    ("apps/desktop/package.json", pkg_version),
    ("apps/website/package.json", pkg_version),
    ("apps/desktop/src-tauri/Cargo.toml", toml_version),
    ("apps/desktop/src-tauri/tauri.conf.json", conf_version),
    ("apps/desktop/src/shared/version.ts", ts_version),
]


def main():
    versions = {}
    for path, fn in SOURCES:
        v = fn(path)
        if v is None:
            print("[FAIL] 无法从 %s 读到版本号" % path)
            return 1
        versions[path] = v

    unique = set(versions.values())
    if len(unique) != 1:
        print("[FAIL] 版本号不一致：")
        for path, v in versions.items():
            print("    %-42s %s" % (path, v))
        return 1

    version = unique.pop()
    if not re.match(r"^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$", version):
        print("[FAIL] 版本号不符合语义化版本：%s" % version)
        return 1

    print("[OK] 版本号一致：%s" % version)
    for path, v in versions.items():
        print("    %-42s %s" % (path, v))
    return 0


if __name__ == "__main__":
    sys.exit(main())