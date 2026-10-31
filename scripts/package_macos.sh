#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist"
if [ -n "${TAURI_TARGET:-}" ]; then
  APP="$ROOT/apps/desktop/src-tauri/target/${TAURI_TARGET}/release/bundle/macos/DigBear.app"
else
  APP="$ROOT/apps/desktop/src-tauri/target/release/bundle/macos/DigBear.app"
fi
ZIP="$DIST/DigBear-macOS.zip"
PKG="$DIST/DigBear-macOS.pkg"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/digbear-release.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT

cd "$ROOT"
# Always start from a clean release folder; dist/ is ignored by git.
rm -rf "$DIST"
mkdir -p "$DIST"
if [ -n "${TAURI_TARGET:-}" ]; then
  pnpm --filter @dig-bear/desktop exec tauri build --target "$TAURI_TARGET" --bundles app
else
  pnpm build:desktop
fi

# Tauri/linker leaves an incomplete ad-hoc signature on the bundle. Re-sign the
# whole bundle so macOS reports "unidentified developer" instead of "damaged".
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"

cp -R "$APP" "$STAGE/DigBear.app"
cp "$ROOT/docs/INSTALL-macOS.md" "$STAGE/安装说明.md"

rm -f "$ZIP"
# Zip the contents, not the staging directory itself.
(cd "$STAGE" && ditto -c -k --sequesterRsrc . "$ZIP")

# Installer package: copies the app to /Applications automatically.
mkdir -p "$STAGE/pkg-root"
cp -R "$APP" "$STAGE/pkg-root/DigBear.app"
VERSION="$(node -p "require('$ROOT/apps/desktop/src-tauri/tauri.conf.json').version")"
rm -f "$PKG"
pkgbuild \
  --root "$STAGE/pkg-root" \
  --scripts "$ROOT/scripts/pkg-scripts" \
  --identifier "com.digbear.desktop" \
  --version "$VERSION" \
  --install-location "/Applications" \
  "$PKG"

echo
echo "Built: $ZIP"
shasum -a 256 "$ZIP"
echo
echo "Built: $PKG"
shasum -a 256 "$PKG"
