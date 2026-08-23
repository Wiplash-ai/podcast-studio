#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
project="$repo_root/apps/ios/Porchcast.xcodeproj"
common=(
  -project "$project"
  -configuration Debug
  -sdk iphoneos
  CODE_SIGNING_ALLOWED=NO
  EXCLUDED_SOURCE_FILE_NAMES=Assets.xcassets
  SWIFT_TREAT_WARNINGS_AS_ERRORS=YES
)

xcodebuild "${common[@]}" -target Porchcast build
xcodebuild "${common[@]}" -target PorchcastTests build
