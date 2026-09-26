#!/usr/bin/env bash
# Creates a verifiable backup of the database and the media library.
#
#   DATABASE_URL=... MEDIA_STORAGE_ROOT=... scripts/backup.sh <output-dir>
#
# Writes <output-dir>/rivana-<UTC timestamp>/ containing:
#   database.dump        pg_dump custom format (no owners or grants)
#   media-images.tar.gz  <media-root>/images (quarantine is never backed up)
#   media-files.sha256   checksum of every image file, by storage key
#   SHA256SUMS           checksums of the files above
#   backup-info.txt      when, what, and from which release
#
# Copy the whole directory off the server. Restore with scripts/restore.sh.
set -euo pipefail

fail() { echo "backup: $*" >&2; exit 1; }

[[ $# -eq 1 ]] || fail "usage: scripts/backup.sh <output-dir>"
: "${DATABASE_URL:?backup: set DATABASE_URL}"
: "${MEDIA_STORAGE_ROOT:?backup: set MEDIA_STORAGE_ROOT}"
[[ -d "$MEDIA_STORAGE_ROOT/images" ]] ||
  fail "no images directory under MEDIA_STORAGE_ROOT"
command -v pg_dump >/dev/null || fail "pg_dump is not on PATH"

if command -v sha256sum >/dev/null; then sha() { sha256sum "$@"; }
else sha() { shasum -a 256 "$@"; }; fi

# libpq rejects Prisma-only URL parameters; keep only sslmode.
pg_url() {
  local base="${1%%\?*}" query="" sslmode
  [[ "$1" == *\?* ]] && query="${1#*\?}"
  sslmode=$(tr '&' '\n' <<<"$query" | grep -E '^sslmode=' || true)
  echo "${base}${sslmode:+?$sslmode}"
}

stamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$1/rivana-$stamp"
[[ -e "$target" ]] && fail "$target already exists"
umask 077
mkdir -p "$target"

echo "backup: dumping database"
pg_dump --format=custom --no-owner --no-privileges \
  --file="$target/database.dump" "$(pg_url "$DATABASE_URL")"

echo "backup: archiving media"
tar -C "$MEDIA_STORAGE_ROOT" -czf "$target/media-images.tar.gz" images
(cd "$MEDIA_STORAGE_ROOT" && find images -type f -print0 | sort -z |
  xargs -0 -r sh -c 'if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi' sh) \
  >"$target/media-files.sha256"

{
  echo "created_at=$stamp"
  echo "release=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "pg_dump=$(pg_dump --version)"
  echo "media_files=$(wc -l <"$target/media-files.sha256" | tr -d ' ')"
} >"$target/backup-info.txt"

(cd "$target" && sha database.dump media-images.tar.gz media-files.sha256 \
  backup-info.txt >SHA256SUMS)

echo "backup: complete: $target"
cat "$target/backup-info.txt"
