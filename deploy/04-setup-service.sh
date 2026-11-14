#!/bin/bash
set -e

# Creates a dedicated, unprivileged system user and installs the medai systemd service.
# Run after deploy/02-unpack-app.sh and deploy/03-configure-env.sh.
# Assumes Node.js and PostgreSQL are already installed on this server.

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "node was not found on PATH. Install Node.js (or add it to PATH) before continuing." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node.js $NODE_MAJOR detected; this app needs Node 18 or newer (top-level await, etc.)." >&2
  exit 1
fi
echo "Using node at $NODE_BIN ($(node -v))."

if ! id -u medai >/dev/null 2>&1; then
  sudo useradd --system --no-create-home --shell /usr/sbin/nologin medai
fi

sudo chown -R medai:medai /opt/medai
sed "s|__NODE_BIN__|$NODE_BIN|" "$(dirname "$0")/medai.service" | sudo tee /etc/systemd/system/medai.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable medai
sudo systemctl restart medai
sleep 2
sudo systemctl status medai --no-pager

echo "medai service installed and started. Check logs with: sudo journalctl -u medai -f"
