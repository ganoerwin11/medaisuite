#!/bin/bash
set -e

# Run on the server after uploading the deploy/ folder (see deploy/README.md step 2).
# Looks for server.env next to this script, so it works wherever deploy/ was uploaded.

ENV_SRC="$(dirname "$0")/server.env"
if [ ! -f "$ENV_SRC" ]; then
  echo "$ENV_SRC not found. Upload deploy/server.env alongside the other deploy scripts first." >&2
  exit 1
fi

if grep -q "YOUR_DOMAIN_HERE" "$ENV_SRC"; then
  echo "$ENV_SRC still has the YOUR_DOMAIN_HERE placeholder in TWILIO_WEBHOOK_URL." >&2
  echo "Edit it to your real domain (e.g. https://example.com/api/voice/twilio/incoming) first." >&2
  exit 1
fi

mv "$ENV_SRC" /opt/medai/.env
chmod 600 /opt/medai/.env

echo "Environment file installed at /opt/medai/.env with restrictive permissions."
echo "Reminder: change ADMIN_PASSWORD after the first login, and keep this file out of source control."
