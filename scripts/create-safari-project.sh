#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
EXTENSION_DIR="$ROOT_DIR/.output/safari-mv2"
PROJECT_DIR="${SAFARI_PROJECT_DIR:-$ROOT_DIR/.output/safari-xcode}"
BUNDLE_ID="${SAFARI_BUNDLE_ID:-com.rmqg.bilibili-history-save-analysis}"
APP_NAME="${SAFARI_APP_NAME:-哔哩哔哩历史记录保存与分析}"
DEPLOYMENT_TARGET="${SAFARI_DEPLOYMENT_TARGET:-13.0}"
BUILD_NUMBER="${SAFARI_BUILD_NUMBER:-1}"
MARKETING_VERSION="$(node -p "JSON.parse(require('fs').readFileSync('$ROOT_DIR/package.json', 'utf8')).version")"

if [[ ! -f "$EXTENSION_DIR/manifest.json" ]]; then
  echo "缺少 Safari 构建，请先运行 pnpm build:safari" >&2
  exit 1
fi

if ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  echo "没有找到 Safari Web Extension 转换工具，请先安装完整 Xcode。" >&2
  exit 1
fi

xcrun safari-web-extension-converter "$EXTENSION_DIR" \
  --project-location "$PROJECT_DIR" \
  --app-name "$APP_NAME" \
  --bundle-identifier "$BUNDLE_ID" \
  --macos-only \
  --copy-resources \
  --no-open \
  --no-prompt \
  --force

PROJECT_FILE="$(find "$PROJECT_DIR" -name project.pbxproj -print -quit)"
if [[ -z "$PROJECT_FILE" ]]; then
  echo "转换完成，但没有找到 Xcode project.pbxproj。" >&2
  exit 1
fi

# Xcode 26 may derive the host bundle ID from the Chinese app name and replace
# every character with a dash. Set both targets explicitly after conversion.
SAFARI_BUNDLE_ID="$BUNDLE_ID" perl -0pi -e '
  s{PRODUCT_BUNDLE_IDENTIFIER = "[^"]+";}{
    $& =~ /\.Extension";/
      ? qq{PRODUCT_BUNDLE_IDENTIFIER = "$ENV{SAFARI_BUNDLE_ID}.Extension";}
      : qq{PRODUCT_BUNDLE_IDENTIFIER = "$ENV{SAFARI_BUNDLE_ID}";}
  }ge
' "$PROJECT_FILE"

SAFARI_DEPLOYMENT_TARGET="$DEPLOYMENT_TARGET" \
SAFARI_MARKETING_VERSION="$MARKETING_VERSION" \
SAFARI_BUILD_NUMBER="$BUILD_NUMBER" \
perl -0pi -e '
  s/MACOSX_DEPLOYMENT_TARGET = [^;]+;/MACOSX_DEPLOYMENT_TARGET = $ENV{SAFARI_DEPLOYMENT_TARGET};/g;
  s/MARKETING_VERSION = [^;]+;/MARKETING_VERSION = $ENV{SAFARI_MARKETING_VERSION};/g;
  s/CURRENT_PROJECT_VERSION = [^;]+;/CURRENT_PROJECT_VERSION = $ENV{SAFARI_BUILD_NUMBER};/g;
' "$PROJECT_FILE"

echo "Safari Xcode 项目已生成：$PROJECT_DIR"
echo "Bundle ID：$BUNDLE_ID"
echo "版本：$MARKETING_VERSION ($BUILD_NUMBER)"
echo "最低 macOS：$DEPLOYMENT_TARGET"
