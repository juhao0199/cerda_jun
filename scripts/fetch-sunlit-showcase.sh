#!/usr/bin/env bash
# Download only the public Sunlit portfolio assets from their verified original URLs.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/frontend/public/showcase/sunlit"
command -v curl >/dev/null
command -v sips >/dev/null || { echo 'This asset preparation script requires macOS sips.' >&2; exit 1; }
mkdir -p "$out"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
for name in menu1 menu2 menu3 menu4 ingredient-meat ingredient-seafood ingredient-veg ingredient-mushroom interior-dining night-exterior; do
  echo "Preparing $name ..."
  curl --fail --silent --show-error --proto '=https' --connect-timeout 10 --max-time 60 --max-filesize 25000000 \
    "https://www.sunlit-hotpot-bkk.com/images/$name.png" -o "$work/$name.png"
  sips -s format jpeg -s formatOptions 82 -Z 960 "$work/$name.png" --out "$work/$name.jpg" >/dev/null
  test -s "$work/$name.jpg"
done
# Do not replace existing local assets until the entire download/conversion succeeds.
for name in menu1 menu2 menu3 menu4 ingredient-meat ingredient-seafood ingredient-veg ingredient-mushroom interior-dining night-exterior; do
  mv "$work/$name.jpg" "$out/$name.jpg"
done
printf 'Sunlit portfolio assets prepared in %s\n' "$out"
