#!/bin/bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
release=0
for arg in "$@"; do
  case "$arg" in
    --release) release=1 ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

bin="$root/desktop/FactoryMenu"
app="$root/desktop/FactoryMenu.app"
macos="$app/Contents/MacOS"
version="$(git -C "$root" describe --tags --always --dirty 2>/dev/null || echo 0.0.1)"
arch="$(uname -m)"

swiftc -O -framework AppKit -o "$bin" "$root/desktop/FactoryMenu.swift"

rm -rf "$app"
mkdir -p "$macos"
cp "$bin" "$macos/FactoryMenu"
cat > "$app/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>FactoryMenu</string>
  <key>CFBundleIdentifier</key>
  <string>app.factory.menu</string>
  <key>CFBundleName</key>
  <string>Factory</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>$version</string>
  <key>CFBundleVersion</key>
  <string>$version</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
EOF
codesign --force --deep -s - "$app" >/dev/null

echo "Built $app"
echo "Run: open \"$app\""
echo "Or:  \"$app/Contents/MacOS/FactoryMenu\" \"$root\""

if [ "$release" -eq 0 ]; then
  exit 0
fi

zip="$root/desktop/FactoryMenu-macos-${arch}.zip"
rm -f "$zip"
ditto -c -k --norsrc --noextattr --keepParent "$app" "$zip"
# ponytail: zip is the Release artifact; fail if the app executable is missing.
python3 -c "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert any(n.endswith('MacOS/FactoryMenu') for n in z.namelist())" "$zip"
echo "Release zip: $zip"
