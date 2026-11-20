# Development Plan — AI Healthcare Voice Intake System

This plan reflects the actual state of the `medai-suite-dashboard` project after inspecting the
existing codebase, and adapts the full system specification to what is already built. It is
updated after each phase of work.

## 1. Existing foundation (before this plan)

The project already implements a working subset of the system, using a **flat-file, dual-mode**
architecture (not the routes/controllers/services layout suggested by the original spec — see
"Architecture conventions" below):

- **Backend** ([server/](../server)): Express app in [server.js](../server/server.js), Sequelize
  models in [db.js](../server/db.js), the questionnaire engine ([questionnaire.js](../server/questionnaire.js)),
  AI call-flow/branching logic ([callFlow.js](../server/callFlow.js)), and intake persistence
  ([saveIntake.js](../server/saveIntake.js)).
- **Telephony/AI**: Twilio voice webhooks (incoming call, speech gather, call status, recording
  status) and OpenAI-generated greetings, already wired end-to-end.
- **Questionnaire data**: A-G and custom questions are loaded from the `questionnaire_questions`
  table and edited from the dashboard's Question Setup page; there is no static questionnaire
  definitions module.
- **Database**: `patients`, `calls`, `call_transcripts`, `intake_records`, `questionnaire_answers`,
  `ai_summaries`, `providers`, `availability_slots`, `appointments`, `orders`, `receptionist_settings`.
- **Frontend** ([client/src/App.jsx](../client/src/App.jsx)): AdminLTE-style dashboard (Bootstrap-free,
  custom CSS) with AI Receptionist and Question Setup views, Twilio status/test-call controls, and
  a recent-calls/transcript viewer.
- **Dual-mode design**: every data-backed feature already works against PostgreSQL **or** an
  in-memory fallback when PostgreSQL is unreachable (`pgReady` flag), so the app and its test suite
  run without a live database.

### Gaps identified against the full specification

No authentication, no dedicated patient/appointment/emergency-alert admin pages, no configurable
questionnaire builder UI (admin only edits prompts, not branching/sections), no emergency-detection
rules engine, no notifications module, no Redis/BullMQ background jobs, no S3 recording storage, no
Sequelize migrations (schema is created via `sequelize.sync()`), and limited automated test coverage.

## 2. Architecture conventions (follow these, do not restructure)

- **Flat server modules**, not routes/controllers/services folders: one file per concern
  (`db.js`, `callFlow.js`, `saveIntake.js`, `auth.js`, ...), all routes declared
  directly in `server.js`.
- **Dual-mode data access**: every new admin feature must behave sensibly both with PostgreSQL
  connected (`pgReady === true`) and without it (in-memory fallback), matching the existing pattern
  for orders, calls, and receptionist settings/questions.
- **ESM throughout** (`"type": "module"`), native `fetch` on the client (no axios), raw
  `node:test` + `node --test` for backend tests (`npm test`).
- **Sequelize models default to auto-incrementing integer IDs** (not UUIDs as the original spec
  suggested) — follow the existing `Patient`/`IntakeRecord`/`Appointment` convention.

## 3. Phased plan

### Phase 1 — Foundation: Authentication & User Management — ✅ Done (this session)
- Added a `users` table/model (`fullName`, `email`, `passwordHash`, `role: admin|staff`, `active`,
  `lastLoginAt`).
- Added [server/auth.js](../server/auth.js): bcrypt hashing, JWT sign/verify, `requireAuth` /
  `requireRole` middleware, and a dual-mode login path (real DB users, or an in-memory demo admin
  when PostgreSQL is not connected — consistent with the rest of the app).
- Seeds a default administrator from `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME` on first boot.
- New endpoints: `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`,
  `GET/POST /api/auth/users`, `PATCH /api/auth/users/:id` (admin-only for user management).
- Protected all dashboard/admin-facing endpoints with `requireAuth` (orders, calls, receptionist
  settings/questions/intake, Twilio status/test-call, transcript/transfer); left Twilio/telephony
  **webhook** endpoints public since providers call them directly.
- Frontend: `AuthContext` (token storage, session restore, `apiFetch` wrapper that signs out on
  401), a Login screen, a Logout control and real user info in the sidebar, and an admin-only
  "User Management" page to list/create/enable/disable/re-role staff accounts.
- Added `.env.example`, `JWT_SECRET`/`JWT_EXPIRES_IN`/`ADMIN_*` variables, and a `test` npm script.
- Verified with the automated test suite (9/9 passing) and a manual end-to-end pass against the
  real local PostgreSQL instance (login, `/me`, 401 enforcement, admin-only 403 enforcement,
  account create/disable).

### Phase 2 — Patient & Call Management admin pages (not started)
Dedicated dashboard pages for browsing/searching patients and full call history (the data model
already exists; only the UI and supporting read endpoints are missing).

### Phase 3 — Questionnaire Configuration UI upgrade (not started)
Extend the existing Question Setup page to manage sections, branching (`showIf`), required/optional
flags, and answer-choice options, instead of only prompt text.

### Phase 4 — Emergency Detection & Escalation (not started)
A deterministic keyword/intent rules engine (not solely LLM-based), call interruption, urgent-alert
generation, and a staff-facing emergency alerts page.

### Phase 5 — Call Processing hardening (not started)
Idempotent webhook handling (duplicate Twilio events), recording storage via S3-compatible storage,
and background summarization via Redis/BullMQ instead of inline processing.

### Phase 6 — Dashboard expansion (not started)
Intake records view, AI summary view, appointment management page, notifications/activity log.

### Phase 7 — Testing & Security hardening (ongoing)
Expand automated coverage (branching logic, emergency rules, webhook idempotency, authorization),
and a security pass once Phases 2-6 land.

### Phase 8 — Documentation & Deployment (not started)
Full README setup/deployment instructions, migration documentation, voice-provider configuration
guide.

See [TASKS.md](../TASKS.md) for the checkbox-level breakdown.

## 9. New phase — OpenAI Voice Chat and Embeddable Widget Platform

The specification requires a separate reusable assistant/widget platform while preserving the
existing clinic receptionist, Twilio, patient, intake, and authentication features.

### 9.1 Existing reusable foundations

- Express route and middleware structure in `server.js`.
- Sequelize/PostgreSQL schema in `db.js`, with `sequelize.sync()` and a demo fallback.
- JWT authentication, role middleware, and a default administrator.
- OpenAI and Twilio server dependencies.
- React/Vite dashboard and existing custom CSS.
- Existing call, transcript, summary, and consent records.

### 9.2 Target additions

- A normalized assistant configuration model, with widgets and widget domains as separate records.
- Conversation and message records distinct from Twilio call records.
- Voice-session lifecycle records and usage/API/security logs.
- Administrator endpoints for assistant and widget CRUD, duplication, activation, identifier
  rotation, domain allowlists, embed code, conversations, and analytics.
- Public widget endpoints for configuration, short-lived sessions, text chat, and voice setup.
- OpenAI Realtime/Responses integration implemented only on the server; the permanent API key must
  never enter browser or embed code.
- A standalone widget bundle loaded by an async `loader.js` script and rendered in Shadow DOM.
- Dashboard text/voice chat controls, live widget preview, conversation management, and analytics.
- Domain authorization combined with short-lived public credentials and server-side abuse controls.

### 9.3 Implementation sequence

1. Add voice-platform models and associations; verify PostgreSQL and fallback behavior.
2. Add assistant management APIs/UI.
3. Add server-side text chat and persisted conversations/messages.
4. Add short-lived voice credentials and dashboard voice controls.
5. Add widget builder, customization, domains, embed-code generation, and identifier controls.
6. Build the standalone isolated widget bundle and loader.
7. Add public-session validation, rate limits, security events, and usage limits.
8. Add conversation management, export/delete controls, analytics, and privacy retention controls.
9. Run tests/build and document deployment; test only external voice behavior against real
   credentials and a real browser.

### 9.4 Important compatibility constraints

- Do not replace or remove existing Twilio clinic call flows.
- Reuse existing auth conventions and role middleware.
- Keep all assistant and widget CRUD admin-only.
- Keep public widget responses free of API keys and privileged configuration.
- Prefer JSON fields only for settings/response metadata that are not better represented by
  normalized columns.
- Keep PostgreSQL unavailable behavior explicit and testable; do not silently claim persistence.
