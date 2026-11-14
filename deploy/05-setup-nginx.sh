#!/bin/bash
set -e

# Installs nginx, deploys a reverse-proxy site for the given domain(s), and provisions HTTPS
# via certbot. Run after deploy/04-setup-service.sh (the Node app must already be reachable
# on 127.0.0.1:3001 before nginx/certbot can proxy and verify it).
#
# Usage: bash 05-setup-nginx.sh example.com [www.example.com ...]
# Pass every hostname that should serve this app and has DNS pointing at this server;
# "www" is only included if you pass it explicitly, since not every domain has that record.

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <domain> [additional-domain ...]  (e.g. $0 example.com www.example.com)" >&2
  exit 1
fi

PRIMARY_DOMAIN="$1"
SERVER_NAMES="$*"
CERTBOT_DOMAIN_ARGS=()
for domain in "$@"; do
  CERTBOT_DOMAIN_ARGS+=(-d "$domain")
done

sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx

sed "s/__SERVER_NAMES__/$SERVER_NAMES/g" "$(dirname "$0")/nginx-site.conf.template" | sudo tee "/etc/nginx/sites-available/$PRIMARY_DOMAIN" >/dev/null
sudo ln -sf "/etc/nginx/sites-available/$PRIMARY_DOMAIN" "/etc/nginx/sites-enabled/$PRIMARY_DOMAIN"
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t
sudo systemctl reload nginx

echo "nginx configured for: $SERVER_NAMES (HTTP). Requesting a certificate now..."
sudo certbot --nginx "${CERTBOT_DOMAIN_ARGS[@]}"

echo "Done. Verify with: curl -I https://$PRIMARY_DOMAIN/api/health"
