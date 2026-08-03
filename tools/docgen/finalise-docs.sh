#!/usr/bin/env bash
# Promote freshly rendered documents over the originals.
# Run this after closing Microsoft Word, which locks open .docx files.
set -e
cd "$(dirname "$0")/../.."
for f in docs/specs/build/*.docx; do
  n=$(basename "$f")
  if cp "$f" "docs/specs/$n" 2>/dev/null; then echo "updated  $n"; else echo "LOCKED   $n (close it in Word)"; fi
done
