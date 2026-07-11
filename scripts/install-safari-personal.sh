#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="${SAFARI_APP_NAME:-哔哩哔哩历史记录保存与分析}"
INSTALL_DIR="${SAFARI_INSTALL_DIR:-$HOME/Applications}"
DERIVED_DATA="$ROOT_DIR/.output/safari-personal-build"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Safari 版本只能在 macOS 上构建。" >&2
  exit 1
fi

if [[ -z "${DEVELOPER_DIR:-}" ]]; then
  for candidate in \
    "/Volumes/MacSSD/Applications/Xcode.app/Contents/Developer" \
    "/Applications/Xcode.app/Contents/Developer"; do
    if [[ -x "$candidate/usr/bin/xcodebuild" ]]; then
      export DEVELOPER_DIR="$candidate"
      break
    fi
  done
fi

if ! xcrun --find xcodebuild >/dev/null 2>&1; then
  echo "没有找到完整 Xcode。请先从 Apple 安装 Xcode，并至少启动一次。" >&2
  exit 1
fi

TEAM_ID="${SAFARI_TEAM_ID:-}"
if [[ -z "$TEAM_ID" ]]; then
  TEAM_ID="$(defaults read com.apple.dt.Xcode IDEProvisioningTeamByIdentifier 2>/dev/null | plutil -convert json -o - -- - 2>/dev/null | node -e '
    let input = "";
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      const root = JSON.parse(input || "{}");
      const teams = root.IDEProvisioningTeamByIdentifier || root;
      for (const accounts of Object.values(teams)) {
        for (const team of Array.isArray(accounts) ? accounts : []) {
          if (team.teamID) process.stdout.write(team.teamID + "\n");
        }
      }
    });
  ' | head -n 1)"
fi

if [[ -z "$TEAM_ID" ]]; then
  echo "Xcode 中没有可用团队。请打开 Xcode > Settings > Apple Accounts，登录 Apple Account。" >&2
  exit 1
fi

cd "$ROOT_DIR"
corepack pnpm build:safari
bash scripts/create-safari-project.sh

PROJECT="$(find "$ROOT_DIR/.output/safari-xcode" -name '*.xcodeproj' -print -quit)"
if [[ -z "$PROJECT" ]]; then
  echo "没有找到生成的 Safari Xcode 工程。" >&2
  exit 1
fi

rm -rf "$DERIVED_DATA"
xcodebuild \
  -project "$PROJECT" \
  -scheme "$APP_NAME" \
  -configuration Release \
  -derivedDataPath "$DERIVED_DATA" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_STYLE=Automatic \
  -allowProvisioningUpdates \
  build

BUILT_APP="$DERIVED_DATA/Build/Products/Release/$APP_NAME.app"
INSTALLED_APP="$INSTALL_DIR/$APP_NAME.app"
TEMP_EXTENSION="$BUILT_APP/Contents/PlugIns/$APP_NAME Extension.appex"

mkdir -p "$INSTALL_DIR"
rm -rf "$INSTALLED_APP"
ditto "$BUILT_APP" "$INSTALLED_APP"
codesign --verify --deep --strict "$INSTALLED_APP"

# Safari may list both the installed app and Xcode's temporary build. Keep only
# the installed copy after registration.
open "$INSTALLED_APP"
sleep 2
pluginkit -r "$TEMP_EXTENSION" 2>/dev/null || true
rm -rf "$DERIVED_DATA"

echo
echo "安装完成：$INSTALLED_APP"
echo "接下来打开 Safari > Settings > Extensions，启用“${APP_NAME}”。"
