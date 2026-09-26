#!/usr/bin/env bash
# Restores a scripts/backup.sh backup into a target database and media root,
# then verifies it.
#
#   RESTORE_DATABASE_URL=... RESTORE_MEDIA_ROOT=... \
#     scripts/restore.sh <backup-dir> [--replace]
#
# By default the target database must have no tables and the target media
# root no images, so a drill can never overwrite live data by mistake.
# --replace is for a real recovery: it drops and recreates restored objects
# and replaces the images directory. Afterwards, delete .next/cache/fetch-cache
# and restart the application.
set -euo pipefail

fail() { echo "restore: $*" >&2; exit 1; }

[[ $# -ge 1 && $# -le 2 ]] ||
  fail "usage: scripts/restore.sh <backup-dir> [--replace]"
backup=$(cd "$1" && pwd) || fail "no backup directory $1"
replace=false
if [[ $# -eq 2 ]]; then
  [[ "$2" == "--replace" ]] || fail "unknown option $2"
  replace=true
fi
: "${RESTORE_DATABASE_URL:?restore: set RESTORE_DATABASE_URL}"
: "${RESTORE_MEDIA_ROOT:?restore: set RESTORE_MEDIA_ROOT}"
[[ "$RESTORE_MEDIA_ROOT" == /* ]] || fail "RESTORE_MEDIA_ROOT must be absolute"
for tool in pg_restore psql; do
  command -v "$tool" >/dev/null || fail "$tool is not on PATH"
done

if command -v sha256sum >/dev/null; then shacheck() { sha256sum -c --quiet "$@"; }
else shacheck() { shasum -a 256 -c --quiet "$@"; }; fi

pg_url() {
  local base="${1%%\?*}" query="" sslmode
  [[ "$1" == *\?* ]] && query="${1#*\?}"
  sslmode=$(tr '&' '\n' <<<"$query" | grep -E '^sslmode=' || true)
  echo "${base}${sslmode:+?$sslmode}"
}
db=$(pg_url "$RESTORE_DATABASE_URL")
query() { psql "$db" -XAtqc "$1"; }

echo "restore: verifying backup checksums"
(cd "$backup" && shacheck SHA256SUMS) || fail "backup checksums do not match"

tables=$(query "select count(*) from pg_tables where schemaname = 'public'")
if [[ "$tables" != "0" && "$replace" != true ]]; then
  fail "target database already has $tables tables; use --replace for a real recovery"
fi
if [[ -d "$RESTORE_MEDIA_ROOT/images" && "$replace" != true ]] &&
  [[ -n "$(find "$RESTORE_MEDIA_ROOT/images" -type f -print -quit)" ]]; then
  fail "target media root already has images; use --replace for a real recovery"
fi

echo "restore: restoring database"
pg_restore --no-owner --no-privileges --exit-on-error \
  $([[ "$replace" == true ]] && echo "--clean --if-exists") \
  --dbname="$db" "$backup/database.dump"

echo "restore: restoring media"
mkdir -p "$RESTORE_MEDIA_ROOT/quarantine"
chmod 750 "$RESTORE_MEDIA_ROOT"
staging=$(mktemp -d "$RESTORE_MEDIA_ROOT/.restore-XXXXXX")
tar -C "$staging" -xzf "$backup/media-images.tar.gz"
(cd "$staging" && shacheck "$backup/media-files.sha256") ||
  { rm -rf "$staging"; fail "restored media files do not match their checksums"; }
if [[ -d "$RESTORE_MEDIA_ROOT/images" ]]; then
  mv "$RESTORE_MEDIA_ROOT/images" "$staging/images.previous"
fi
mv "$staging/images" "$RESTORE_MEDIA_ROOT/images"
find "$RESTORE_MEDIA_ROOT/images" -type d -exec chmod 750 {} +
find "$RESTORE_MEDIA_ROOT/images" -type f -exec chmod 640 {} +
rm -rf "$staging"

echo "restore: checking every ready image is present"
missing=0
while IFS= read -r key; do
  [[ -f "$RESTORE_MEDIA_ROOT/$key" ]] || { echo "missing: $key" >&2; missing=$((missing + 1)); }
done < <(query "select \"storageKey\" from \"MediaAsset\" where status = 'READY'")
[[ $missing -eq 0 ]] || fail "$missing ready image(s) have no file"

echo "restore: complete"
query "select 'rooms=' || count(*) from \"Room\"
       union all select 'facilities=' || count(*) from \"Facility\"
       union all select 'pages=' || count(*) from \"Page\"
       union all select 'media_ready=' || count(*) from \"MediaAsset\" where status = 'READY'
       union all select 'enquiries=' || count(*) from \"ContactEnquiry\"
       union all select 'staff=' || count(*) from \"User\""
echo "restore: now delete .next/cache/fetch-cache and restart the application"
