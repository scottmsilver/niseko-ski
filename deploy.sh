#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration — edit these variables, not the rest of the script
# ---------------------------------------------------------------------------
CONTAINER="skilifts"
CONTAINER_IP="10.182.70.241"
HOSTNAME="skilifts.oursilverfamily.com"
TUNNEL_NAME="skilifts"
TUNNEL_CONFIG="$HOME/.cloudflared/config-skilifts.yml"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
INCUS="sg incus-admin -c"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
info()  { printf '\033[1;34m==> %s\033[0m\n' "$*"; }
ok()    { printf '\033[1;32m  OK: %s\033[0m\n' "$*"; }
warn()  { printf '\033[1;33m  WARN: %s\033[0m\n' "$*"; }
die()   { printf '\033[1;31m  FATAL: %s\033[0m\n' "$*" >&2; exit 1; }

run_in() {
  # Run a command inside the container
  # $* joins all args into one string — required because sg ... -c takes a single command string.
  $INCUS "incus exec $CONTAINER -- $*"
}

push_file() {
  # Push a local file into the container
  # Single quotes inside double quotes are literal characters and preserve the quoting
  # needed by the `sg incus-admin -c` wrapper. This is intentional and fragile.
  local src="$1" dst="$2"
  $INCUS "incus file push '$src' '$CONTAINER$dst'"
}

push_dir() {
  # Push a local directory into the container (recursive)
  # Single quotes inside double quotes are literal characters and preserve the quoting
  # needed by the `sg incus-admin -c` wrapper. This is intentional and fragile.
  local src="$1" dst="$2"
  $INCUS "incus file push -r '$src' '$CONTAINER$dst'"
}

# ---------------------------------------------------------------------------
# Phase 1: Container (idempotent)
# ---------------------------------------------------------------------------
phase1_container() {
  info "Phase 1: Container"

  if $INCUS "incus list --format csv -c n" | grep -q "^${CONTAINER}$"; then
    ok "Container '$CONTAINER' already exists"

    # Make sure it's running
    local state
    state=$($INCUS "incus list --format csv -c ns" | grep "^${CONTAINER}," | cut -d, -f2)
    if [ "$state" != "RUNNING" ]; then
      info "Starting container"
      $INCUS "incus start $CONTAINER"
      sleep 3
    fi
  else
    info "Creating container '$CONTAINER'"
    $INCUS "incus launch images:ubuntu/noble $CONTAINER"

    # Wait for network to come up
    info "Waiting for network..."
    for i in $(seq 1 30); do
      if $INCUS "incus list $CONTAINER --format csv -c 4" | grep -q '[0-9]'; then
        break
      fi
      sleep 1
    done

    # Set static IP
    info "Setting static IP to $CONTAINER_IP"
    $INCUS "incus config device override $CONTAINER eth0 ipv4.address=$CONTAINER_IP"

    # Boot autostart
    $INCUS "incus config set $CONTAINER boot.autostart=true"

    # Security nesting (needed for Chromium in LXC)
    $INCUS "incus config set $CONTAINER security.nesting=true"

    # Restart to pick up static IP
    info "Restarting container for static IP"
    $INCUS "incus restart $CONTAINER"
    sleep 5

    # Wait for network again
    for i in $(seq 1 30); do
      if $INCUS "incus list $CONTAINER --format csv -c 4" | grep -q '[0-9]'; then
        break
      fi
      sleep 1
    done

    # Install packages
    info "Installing packages (this takes a minute)..."
    run_in "apt-get update -qq"
    run_in "apt-get install -y -qq nginx supervisor curl ca-certificates gnupg"

    # Install Chrome dependencies (for Puppeteer's bundled Chromium — not the snap)
    info "Installing Chromium dependencies"
    run_in "apt-get install -y -qq libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2t64 libatspi2.0-0t64"

    # Install Node.js 20.x via nodesource
    info "Installing Node.js 20.x"
    run_in "bash -c 'curl -fsSL https://deb.nodesource.com/setup_20.x | bash -'"
    run_in "apt-get install -y -qq nodejs"

    # Remove default nginx site
    run_in "rm -f /etc/nginx/sites-enabled/default"

    # Enable services
    run_in "systemctl enable nginx"
    run_in "systemctl enable supervisor"

    ok "Container provisioned"
  fi

  # Verify container is reachable
  if ! $INCUS "incus exec $CONTAINER -- true" 2>/dev/null; then
    die "Cannot exec into container '$CONTAINER'"
  fi
  ok "Container is running"
}

# ---------------------------------------------------------------------------
# Phase 2: Deploy code (always runs)
# ---------------------------------------------------------------------------
phase2_deploy() {
  info "Phase 2: Deploy code"

  # Ensure directories exist
  run_in "mkdir -p /usr/share/nginx/html/data /app/scraper"

  # Static web files
  info "Pushing static files"
  push_file "$REPO_DIR/index.html"    "/usr/share/nginx/html/index.html"
  push_file "$REPO_DIR/style.css"     "/usr/share/nginx/html/style.css"
  push_file "$REPO_DIR/app.js"        "/usr/share/nginx/html/app.js"
  push_file "$REPO_DIR/yotei.png"     "/usr/share/nginx/html/yotei.png"
  push_file "$REPO_DIR/trail-map.jpg" "/usr/share/nginx/html/trail-map.jpg"

  # Data files
  for f in "$REPO_DIR"/data/*; do
    push_file "$f" "/usr/share/nginx/html/data/$(basename "$f")"
  done

  # Nginx config
  info "Pushing nginx config"
  push_file "$REPO_DIR/nginx.conf" "/etc/nginx/conf.d/default.conf"

  # Scraper
  info "Pushing scraper"

  # Check if package.json changed (to avoid unnecessary npm install)
  local need_npm=0
  if run_in "test -f /app/scraper/package.json" 2>/dev/null; then
    # Compare checksums
    local local_sum remote_sum
    local_sum=$(md5sum "$REPO_DIR/scraper/package.json" | cut -d' ' -f1)
    remote_sum=$($INCUS "incus exec $CONTAINER -- md5sum /app/scraper/package.json" | cut -d' ' -f1)
    if [ "$local_sum" != "$remote_sum" ]; then
      need_npm=1
    fi
  else
    need_npm=1
  fi

  push_file "$REPO_DIR/scraper/package.json" "/app/scraper/package.json"
  push_file "$REPO_DIR/scraper/index.js"     "/app/scraper/index.js"

  if [ "$need_npm" -eq 1 ]; then
    info "Running npm install (package.json changed)"
    run_in "bash -c 'cd /app/scraper && npm install --production'"
    info "Installing Puppeteer's bundled Chrome"
    run_in "bash -c 'cd /app/scraper && npx puppeteer browsers install chrome'"
  else
    ok "package.json unchanged, skipping npm install"
  fi

  # Supervisor config for scraper
  info "Pushing supervisor config"
  local supervisor_conf
  supervisor_conf=$(mktemp)
  cat > "$supervisor_conf" << 'SUPERVISOREOF'
[program:scraper]
command=node /app/scraper/index.js
autorestart=true
stdout_logfile=/var/log/scraper.log
stderr_logfile=/var/log/scraper-err.log
SUPERVISOREOF
  push_file "$supervisor_conf" "/etc/supervisor/conf.d/app.conf"
  rm -f "$supervisor_conf"

  # Reload services
  info "Reloading nginx"
  run_in "nginx -t"
  run_in "systemctl reload nginx"

  info "Restarting scraper via supervisor"
  run_in "supervisorctl reread"
  run_in "supervisorctl update"
  run_in "supervisorctl restart scraper" || run_in "supervisorctl start scraper" || true

  ok "Code deployed"
}

# ---------------------------------------------------------------------------
# Phase 3: Tunnel (idempotent)
# ---------------------------------------------------------------------------
phase3_tunnel() {
  info "Phase 3: Cloudflare Tunnel"

  # Check if tunnel exists
  local tunnel_id=""
  if cloudflared tunnel list 2>/dev/null | grep -w -q "$TUNNEL_NAME"; then
    tunnel_id=$(cloudflared tunnel list 2>/dev/null | grep -w "$TUNNEL_NAME" | awk '{print $1}')
    ok "Tunnel '$TUNNEL_NAME' already exists (ID: $tunnel_id)"
  else
    info "Creating tunnel '$TUNNEL_NAME'"
    cloudflared tunnel create "$TUNNEL_NAME"
    tunnel_id=$(cloudflared tunnel list 2>/dev/null | grep -w "$TUNNEL_NAME" | awk '{print $1}')
    ok "Tunnel created (ID: $tunnel_id)"
  fi

  if [ -z "$tunnel_id" ]; then
    die "Could not determine tunnel ID"
  fi

  # Generate tunnel config
  info "Writing tunnel config to $TUNNEL_CONFIG"
  local creds_file="$HOME/.cloudflared/${tunnel_id}.json"
  cat > "$TUNNEL_CONFIG" << EOF
tunnel: ${tunnel_id}
credentials-file: ${creds_file}

ingress:
  - hostname: ${HOSTNAME}
    service: http://${CONTAINER_IP}:80
  - service: http_status:404
EOF
  ok "Tunnel config written"

  # DNS route (use UUID to avoid default config name resolution issues)
  local dns_output
  dns_output=$(cloudflared --overwrite-dns tunnel route dns "$tunnel_id" "$HOSTNAME" 2>&1)
  if echo "$dns_output" | grep -q "already configured"; then
    ok "DNS route for $HOSTNAME already exists"
  else
    ok "DNS route created for $HOSTNAME"
  fi

  # Start tunnel if not running
  if pgrep -f "config-skilifts" > /dev/null 2>&1; then
    ok "Tunnel process already running"
  else
    info "Starting tunnel in background"
    nohup cloudflared tunnel --config "$TUNNEL_CONFIG" run "$TUNNEL_NAME" > /tmp/skilifts-tunnel.log 2>&1 &
    sleep 2
    if pgrep -f "config-skilifts" > /dev/null 2>&1; then
      ok "Tunnel started (PID: $(pgrep -f 'config-skilifts'))"
    else
      warn "Tunnel may not have started — check /tmp/skilifts-tunnel.log"
    fi
  fi
}

# ---------------------------------------------------------------------------
# Phase 4: Verify
# ---------------------------------------------------------------------------
phase4_verify() {
  info "Phase 4: Verify"

  # Check nginx + scraper via container IP
  sleep 2
  if curl -sf "http://$CONTAINER_IP/health" > /dev/null 2>&1; then
    ok "Health check passed (http://$CONTAINER_IP/health)"
  else
    warn "Health check failed — scraper may still be starting up"
  fi

  # Check tunnel routing
  if curl -sf "https://$HOSTNAME/resorts" > /dev/null 2>&1; then
    ok "Tunnel routing works (https://$HOSTNAME/resorts)"
  else
    warn "Tunnel check failed — may take a moment for DNS to propagate"
  fi

  echo
  info "Deployment complete!"
  echo "  Container: $CONTAINER ($CONTAINER_IP)"
  echo "  Public URL: https://$HOSTNAME"
  echo "  Tunnel config: $TUNNEL_CONFIG"
  echo "  Scraper logs: incus exec $CONTAINER -- tail -f /var/log/scraper.log"
  echo "  Tunnel logs: /tmp/skilifts-tunnel.log"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
phase1_container
phase2_deploy
phase3_tunnel
phase4_verify
