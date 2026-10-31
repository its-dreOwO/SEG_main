#!/usr/bin/env bash
# Build web (if present), upload via tar over ssh, install server deps, restart shop-api.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${DEPLOY_HOST:-admin@13.251.153.23}"
KEY="${DEPLOY_KEY:-$HOME/.ssh/aws-vps.pem}"
SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes "$HOST")
WEBROOT=/var/www/shop.kodingkat.xyz

# --- web ---
if [ -d web ]; then
  (cd web && npm ci && npm run build)
  WEB_SRC=web/dist
else
  echo "web/ not present yet; uploading placeholder page"
  WEB_SRC=$(mktemp -d)
  trap 'rm -rf "$WEB_SRC"' EXIT
  cat > "$WEB_SRC/index.html" <<'H'
<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Tech Store</title></head><body><h1>Tech Store</h1><p>Coming soon.</p></body></html>
H
fi
"${SSH[@]}" "sudo mkdir -p $WEBROOT && sudo chown -R admin:admin $WEBROOT && find $WEBROOT -mindepth 1 -delete"
tar -C "$WEB_SRC" -cf - . | "${SSH[@]}" "tar -C $WEBROOT -xf -"
"${SSH[@]}" "chmod -R u=rwX,go=rX $WEBROOT"

# --- server ---
tar -C server --exclude=node_modules --exclude=test -cf - . | "${SSH[@]}" \
  "sudo mkdir -p /opt/shop-api && sudo chown -R admin:admin /opt/shop-api && tar -C /opt/shop-api -xf -"
"${SSH[@]}" "cd /opt/shop-api && npm ci --omit=dev --no-audit --no-fund"

# --- db (schema + seed scripts; not run here). db/seed.js imports ../server/src, so link server -> . on the VPS.
# Seed later with: cd /opt/shop-api && set -a && . /etc/shop-api.env && set +a && SEED_PASSWORD=... node db/seed.js
tar -cf - db | "${SSH[@]}" "tar -C /opt/shop-api -xf - && ln -sfn . /opt/shop-api/server"

# --- service ---
cat deploy/shop-api.service | "${SSH[@]}" "sudo tee /etc/systemd/system/shop-api.service >/dev/null && sudo systemctl daemon-reload && sudo systemctl enable shop-api >/dev/null 2>&1 && sudo systemctl restart shop-api"
sleep 2
"${SSH[@]}" "systemctl is-active shop-api"
