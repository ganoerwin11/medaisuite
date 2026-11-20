# Tasks

See [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) for context and architecture notes.

## Phase 9 — OpenAI Voice Chat and Embeddable Widget Platform

### 9A — Inspection and planning

- [x] Inspect repository structure and existing conventions
- [x] Identify React/Vite, Express, Sequelize/PostgreSQL, auth, OpenAI, and Twilio foundations
- [x] Create and update implementation plan
- [ ] Review the existing database and route surface before model additions

### 9B — Foundation and database

- [x] Add `Assistant` and `AssistantConfiguration` models and associations
- [x] Add `Widget` and `WidgetDomain` models
- [x] Add `Conversation`, `Message`, and `VoiceSession` models
- [x] Add `UsageLog`, `ApiLog`, and `SecurityLog` models
- [x] Add foreign keys, unique constraints, indexes, timestamps, and demo fallbacks
- [ ] Replace or supplement `sequelize.sync()` with a migration workflow
- [ ] Add model/domain/authorization tests

### 9C — Assistant management

- [x] Add admin assistant list/create/view/update/delete endpoints
- [x] Add duplicate operation
- [ ] Add activate/deactivate operations
- [x] Add initial assistant dashboard management UI
- [ ] Validate instructions, model, voice, language, behavior, tools, and limits

### 9D — OpenAI text chat

- [x] Add a server-side OpenAI Responses API service
- [ ] Add dashboard text chat endpoint and UI
- [x] Add public widget text chat endpoint
- [x] Persist conversations and messages with duplicate-processing protection
- [x] Add provider/network/status/error handling
- [x] Add consent-aware intake mode using the existing A-G questionnaire engine
- [x] Persist confirmed widget intake records through `saveQuestionnaire`

### 9E — OpenAI realtime voice chat

- [x] Add backend-mediated ephemeral Realtime API credential initialization
- [ ] Add credential refresh endpoints
- [x] Add voice-session end endpoint
- [x] Persist voice session lifecycle and usage
- [ ] Add microphone, transcript, status, mute, interrupt, and reconnection UI
- [ ] Verify browser permission and network error handling

### 9F — Widget builder

- [x] Add widget CRUD and public-ID operations
- [x] Add authorized domain allowlist management
- [ ] Add live preview and appearance/behavior controls
- [x] Generate async embed snippets
- [x] Add immediate disable
- [x] Add identifier revoke/regenerate operations

### 9G — Standalone widget

- [ ] Add a separate optimized production bundle build
- [x] Serve an async `loader.js`
- [x] Use Shadow DOM isolation
- [x] Implement text chat
- [ ] Implement browser voice UI
- [ ] Test on standalone HTML and a separate host page

### 9H — Public security and abuse controls

- [ ] Add exact/subdomain domain validation
- [ ] Add short-lived public widget/session tokens
- [ ] Add public API rate limiting and per-assistant/widget limits
- [ ] Record API, usage, and security events
- [ ] Validate Origin/Referer only as supplemental host evidence

### 9I — Conversations and analytics

- [ ] Add conversation list/detail/search/filter/delete/export endpoints
- [ ] Add dashboard conversation management UI
- [ ] Add analytics overview and date/assistant/widget/domain filters
- [ ] Track voice/text counts, duration, usage, failures, and domains
- [ ] Enforce transcript retention and consent/privacy settings

### 9J — Testing and deployment

- [ ] Add authentication and assistant/widget API integration tests
- [ ] Add domain authorization and public-session tests
- [ ] Add text and voice session unit tests
- [ ] Run frontend/build tests and standalone embed checks
- [ ] Document environment, deployment, OpenAI credentials, and privacy controls
- [ ] Do not claim real voice/embed success until browser and credential tests pass

## Phase 1 — Foundation: Authentication & User Management

- [x] Inspect existing project structure and conventions
- [x] Add `User` Sequelize model (`server/db.js`)
- [x] Add password hashing, JWT signing/verification, auth middleware (`server/auth.js`)
- [x] Seed a default administrator account on first boot
- [x] `POST /api/auth/login`
- [x] `GET /api/auth/me`
- [x] `POST /api/auth/logout`
- [x] `GET /api/auth/users`, `POST /api/auth/users`, `PATCH /api/auth/users/:id` (admin-only)
- [x] Protect dashboard/admin API endpoints with `requireAuth` (keep Twilio webhooks public)
- [x] Frontend `AuthContext` + token-aware `apiFetch`
- [x] Login screen
- [x] Sidebar: real signed-in user, working logout
- [x] Admin-only "User Management" page (list/create/enable/disable/re-role)
- [x] `.env.example`, `JWT_SECRET`/`ADMIN_*` variables
- [x] `npm test` script
- [x] Automated tests: login success/failure, `/me`, 401 without token, 403 for non-admin,
      existing receptionist/intake/question tests updated to authenticate
- [x] Manual end-to-end verification against the real local PostgreSQL instance

## Phase 2 — Patient & Call Management admin pages

- [ ] `GET /api/patients` (search/paginate), `GET /api/patients/:id`
- [ ] Patients list + detail page in the dashboard
- [ ] Full call-history page (beyond the current receptionist call list)

## Phase 3 — Questionnaire Configuration UI upgrade

- [ ] Section management (add/reorder/enable-disable sections)
- [ ] Branching (`showIf`) editor
- [ ] Answer-choice / question-type editor (single/multi-select, scale, medication/allergy list)
- [ ] Per-visit-type question applicability

## Phase 4 — Emergency Detection & Escalation

- [ ] Deterministic keyword/intent rules engine (not LLM-only)
- [ ] Call-flow interruption on detected emergency
- [ ] Urgent alert generation + staff notification
- [ ] Emergency Alerts dashboard page

## Phase 5 — Call Processing hardening

- [ ] Idempotent Twilio webhook handling (duplicate event protection)
- [ ] S3-compatible storage for call recordings
- [ ] Background job queue (Redis/BullMQ) for summarization and notifications

## Phase 6 — Dashboard expansion

- [ ] Intake records page
- [ ] AI summary view
- [ ] Appointment management page
- [ ] Notifications / activity log

## Phase 7 — Testing & Security

- [ ] Branching-logic test coverage
- [ ] Emergency-rules test coverage
- [ ] Webhook idempotency tests
- [ ] Security review pass (after Phases 2-6)

## Phase 8 — Documentation & Deployment

- [ ] Full README setup/deployment instructions
- [ ] Database migration documentation (move off `sequelize.sync()`)
- [ ] Voice provider configuration guide

## Deployment — generic domain deploy tooling

- [x] Production static-file serving in `server.js` (serves `dist/` + SPA fallback when
      `NODE_ENV=production`; API still requires auth, webhooks stay public)
- [x] Packaging script (`deploy/00-package.ps1`): tests, builds, zips `dist/` + `server/` +
      manifests (no `node_modules`, no secrets)
- [x] `deploy/03-configure-env.sh`: installs the uploaded env file as `/opt/medai/.env` (0600);
      refuses to proceed if the `YOUR_DOMAIN_HERE` webhook placeholder wasn't replaced
- [x] `deploy/medai.service` + `deploy/04-setup-service.sh`: dedicated system user, systemd unit,
      auto-restart, auto-detects the `node` binary path and version (no assumed Node install method)
- [x] `deploy/nginx-site.conf.template` + `deploy/05-setup-nginx.sh <domain> [domain...]`: nginx
      reverse proxy + certbot HTTPS for any domain(s) passed as arguments (not hardcoded)
- [x] `deploy/server.env` updated with `JWT_SECRET`/`ADMIN_*`/`NODE_ENV=production`; domain is a
      placeholder (`YOUR_DOMAIN_HERE`) filled in per deployment, not hardcoded
- [x] `deploy/README.md`: end-to-end deploy/update walkthrough, domain-agnostic
- [x] Verified locally: production build serves correctly, SPA fallback works, API still enforces
      auth, packaging script produces a working zip
- [ ] Not yet done (no server provisioned): actually running these scripts against a live host
