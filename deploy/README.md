# Deploying to a custom domain

This works for **any domain** — nothing in the app or these scripts is tied to a specific one.
Substitute your real domain for `YOUR_DOMAIN` everywhere below.

Target: a **Debian** server that already has Node.js (18+) and PostgreSQL installed and running,
with `sudo` access, and `YOUR_DOMAIN` (and `www.YOUR_DOMAIN`, if you use it) DNS already pointing
at the server's IP. (`01-setup-db.sh` and `05-setup-nginx.sh` use `apt-get`, which matches
Debian/Ubuntu.)

Before running `04-setup-service.sh`, double-check the server's PostgreSQL is reachable on the
`DB_HOST`/`DB_PORT` in `deploy/server.env` (defaults to `127.0.0.1:5432`, the standard Debian
`postgresql` package port) and that the `postgres` superuser exists.

## 0. Edit `deploy/server.env` for your domain

Open `deploy/server.env` and replace the `YOUR_DOMAIN_HERE` placeholder in `TWILIO_WEBHOOK_URL`
with your real domain, e.g.:

```
TWILIO_WEBHOOK_URL=https://YOUR_DOMAIN/api/voice/twilio/incoming
```

Also review `ADMIN_EMAIL`/`ADMIN_PASSWORD` and the Twilio/OpenAI credentials. `03-configure-env.sh`
refuses to proceed if the placeholder is still present.

## 1. Package the app (run locally, on the dev machine)

```powershell
powershell -File deploy\00-package.ps1
```

This runs the test suite, builds the production frontend bundle, and creates
`medai-deploy.zip` at the project root (containing `dist/`, `server/`, `package.json`,
`package-lock.json` — no `node_modules`, no `.env`).

## 2. Upload to the server

```powershell
scp medai-deploy.zip user@YOUR_DOMAIN:~
scp -r deploy user@YOUR_DOMAIN:~
```

The second command copies the whole `deploy/` folder (scripts, `server.env`, nginx/systemd
templates) to `~/deploy` on the server, so the numbered scripts below can find their sibling
files no matter where you keep them.

## 3. On the server, run the numbered scripts in order

```bash
bash ~/deploy/01-setup-db.sh                    # sets the Postgres password to match server.env
bash ~/deploy/02-unpack-app.sh                   # unpacks ~/medai-deploy.zip to /opt/medai, npm install
bash ~/deploy/03-configure-env.sh                # installs deploy/server.env as /opt/medai/.env
bash ~/deploy/04-setup-service.sh                # creates the medai system user + systemd service
bash ~/deploy/05-setup-nginx.sh YOUR_DOMAIN      # installs nginx + HTTPS via certbot for YOUR_DOMAIN
```

`05-setup-nginx.sh` takes every hostname that should serve this app, e.g.
`bash ~/deploy/05-setup-nginx.sh example.com www.example.com` if you also use the `www` subdomain
(only pass domains that actually have DNS pointing here, since certbot verifies each one).

## 4. Verify

```bash
curl -I https://YOUR_DOMAIN/api/health
```

Sign in at `https://YOUR_DOMAIN` with the `ADMIN_EMAIL`/`ADMIN_PASSWORD` from
`deploy/server.env`, then immediately change that password from the User Management page.

## Updating a deployed instance

Re-run step 1-2, then on the server:

```bash
sudo systemctl stop medai
sudo rm -rf /opt/medai/dist /opt/medai/server /opt/medai/package.json /opt/medai/package-lock.json
bash ~/deploy/02-unpack-app.sh
sudo systemctl start medai
```

`/opt/medai/.env` and `node_modules` are left in place; only app code/assets are replaced.

## Moving to a different domain later

If you later point the same deployment at a different domain: update `TWILIO_WEBHOOK_URL` in
`/opt/medai/.env` (and your Twilio console's webhook URL), restart with
`sudo systemctl restart medai`, then re-run `05-setup-nginx.sh` with the new domain(s).

## Notes

- `deploy/server.env` contains real secrets (Twilio, Postgres, JWT, admin password). Keep it out
  of source control, delete it from the server's home directory after `03-configure-env.sh` runs
  (it's moved, not copied, into `/opt/medai/.env` with `chmod 600`), and rotate the credentials
  if this file is ever exposed.
- The Node server itself serves the built frontend and `/api/*` in production
  (`NODE_ENV=production`, set in `server.env`); nginx only reverse-proxies to it, so there is no
  separate static web root to keep in sync.
- `/api/voice/twilio/*` webhook endpoints stay unauthenticated (Twilio calls them directly); every
  other `/api/*` route requires a signed-in session.
