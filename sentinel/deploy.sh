#!/usr/bin/env bash
#
# Sentinel v0 — VPS Deployment Script
#
# Sets up the sentinel worker and ponder indexer as systemd services.
# Run as root on the OVHcloud VPS.
#
# Usage: sudo bash sentinel/deploy.sh
#

set -euo pipefail

REPO_DIR="/opt/tapioca"
ENV_FILE="/etc/sentinel/.env"
SERVICE_USER="tapioca"

echo "=== Sentinel v0 Deployment ==="

# 1. Ensure service user exists
if ! id "$SERVICE_USER" &>/dev/null; then
  useradd -r -s /bin/false "$SERVICE_USER"
  echo "Created service user: $SERVICE_USER"
fi

# 2. Ensure env file directory exists
mkdir -p /etc/sentinel
if [ ! -f "$ENV_FILE" ]; then
  echo "WARNING: $ENV_FILE does not exist. Create it with required env vars."
  echo "Required: DATABASE_URL, REDIS_URL, ERPC_URL, PAGERDUTY_ROUTING_KEY,"
  echo "          RESEND_API_KEY, ZERODEV_PROJECT_ID, ZERODEV_BUNDLER_URL,"
  echo "          PAYMASTER_URL, SESSION_ENCRYPTION_KEY"
fi
chmod 640 "$ENV_FILE" 2>/dev/null || true
chown root:"$SERVICE_USER" "$ENV_FILE" 2>/dev/null || true

# 3. Install/update repo
if [ ! -d "$REPO_DIR" ]; then
  echo "ERROR: $REPO_DIR does not exist. Clone the repo first."
  exit 1
fi

cd "$REPO_DIR"
pnpm install --frozen-lockfile

# 4. Build sentinel worker
cd sentinel
if command -v tsup &>/dev/null || npx tsup --version &>/dev/null; then
  npx tsup worker.ts --format cjs --out-dir dist --external viem --external @zerodev --external @neondatabase
else
  echo "tsup not found, installing..."
  pnpm add -D tsup
  npx tsup worker.ts --format cjs --out-dir dist --external viem --external @zerodev --external @neondatabase
fi
cd "$REPO_DIR"

# 5. Create systemd units
cat > /etc/systemd/system/sentinel-worker.service << 'EOF'
[Unit]
Description=Sentinel Worker — DeFi circuit breaker
After=network.target

[Service]
Type=simple
User=tapioca
WorkingDirectory=/opt/tapioca
ExecStart=/usr/bin/node sentinel/dist/worker.js
EnvironmentFile=/etc/sentinel/.env
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=sentinel-worker

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/sentinel-ponder.service << 'EOF'
[Unit]
Description=Sentinel Ponder Indexer
After=network.target

[Service]
Type=simple
User=tapioca
WorkingDirectory=/opt/tapioca/sentinel/ponder
ExecStart=/usr/bin/npx ponder start
EnvironmentFile=/etc/sentinel/.env
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=sentinel-ponder

[Install]
WantedBy=multi-user.target
EOF

# 6. Reload and enable services
systemctl daemon-reload
systemctl enable sentinel-worker sentinel-ponder

echo ""
echo "=== Deployment complete ==="
echo "Start services with:"
echo "  sudo systemctl start sentinel-ponder"
echo "  sudo systemctl start sentinel-worker"
echo ""
echo "Check logs with:"
echo "  journalctl -u sentinel-worker -f"
echo "  journalctl -u sentinel-ponder -f"
