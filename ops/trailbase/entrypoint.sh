#!/bin/sh
set -eu

# Ensure depot exists
mkdir -p /app/traildepot

# Always apply repo-managed config from the image.
if [ -f /opt/readest-traildepot/config.textproto ]; then
  cp /opt/readest-traildepot/config.textproto /app/traildepot/config.textproto
fi

# Copy migrations into the depot only if missing (never clobber existing files).
if [ -d /opt/readest-traildepot/migrations ]; then
  mkdir -p /app/traildepot/migrations
  (cd /opt/readest-traildepot/migrations && find . -type f -print) | while IFS= read -r f; do
    src="/opt/readest-traildepot/migrations/$f"
    dst="/app/traildepot/migrations/$f"
    mkdir -p "$(dirname "$dst")"
    if [ ! -f "$dst" ]; then
      cp "$src" "$dst"
    fi
  done
fi

exec "$@"
