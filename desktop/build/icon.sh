#!/bin/sh
# Regenerates the icon files from make-icon.mjs. Needs rsvg-convert (librsvg),
# iconutil (macOS) and magick (ImageMagick) on PATH. electron-builder picks
# up icon.icns, icon.ico and icon.png from this folder with no configuration.
set -e
cd "$(dirname "$0")"
node make-icon.mjs > icon.svg
rsvg-convert -w 1024 -h 1024 icon.svg -o icon.png
rm -rf icon.iconset && mkdir icon.iconset
for s in 16 32 128 256 512; do
  rsvg-convert -w $s -h $s icon.svg -o icon.iconset/icon_${s}x${s}.png
  rsvg-convert -w $((s*2)) -h $((s*2)) icon.svg -o icon.iconset/icon_${s}x${s}@2x.png
done
iconutil -c icns icon.iconset -o icon.icns
rm -rf icon.iconset
magick icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
ls -la icon.png icon.icns icon.ico
