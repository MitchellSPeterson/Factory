#!/bin/bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/desktop/FactoryMenu"
swiftc -O -framework AppKit -o "$out" "$root/desktop/FactoryMenu.swift"
echo "Built $out"
echo "Run: $out \"$root\""
