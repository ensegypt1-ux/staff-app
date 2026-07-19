# Ensmenu Staff BFF

Standalone NestJS backend-for-frontend for the ENS Menu **Staff** Flutter app. It proxies staff auth and order flows to the Express API (`ENS_BACKEND_URL/api/*`), enriches order payloads for the mobile client, and authorizes actions from Express `/staff-auth/me` **`permissions[]`** (not legacy waiter/cashier role strings).

## Run locally

```bash
cp .env.example .env
npm install
npm run start:dev
```

Default listen port: **3010**.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | HTTP port (default `3010`) |
| `NODE_ENV` | Yes | `development` / `production` |
| `ENS_BACKEND_URL` | Yes | Express base URL (no trailing slash) |
| `ASSET_PUBLIC_BASE_URL` | Yes | Public base for rewriting asset URLs in JSON |
| `CORS_ORIGINS` | Yes | `*` in development only; explicit allowlist in production |
| `SECRET_KEY` | Yes | HMAC secret for `x-api-key` on legacy `/api/*` calls |
| `JWT_ACCESS_SECRET` | Yes in production (min 32) | Same as Express — verifies staff Bearer JWTs (HS256) |
| `TRUST_PROXY_HOPS` | No | Reverse-proxy hops for client IP (0–5; prod default 1) |
| `THROTTLE_*` | No | Global / auth / health rate limits |
| `API_KEY_TIME_OFFSET_SECONDS` | No | Clock skew offset for API key (default `0`) |
| `UPSTREAM_DEBUG_LOG` | No | Log upstream requests (`true` / `false`) |
| `UPSTREAM_TIMEOUT_MS` | No | Axios timeout (default `30000`) |

**Security:** Protected routes require a cryptographically verified staff JWT. Login and health are public. Client `menuId` cannot override the JWT menu scope. Product capabilities come from verified upstream `permissions[]`.

See [docs/upstream-route-map.md](docs/upstream-route-map.md) for BFF → Express route mapping.

## Authorization model

1. JWT proves `role=staff` and menu scope (`menuId`).
2. BFF loads `GET /api/staff-auth/me` once per request (`resolveStaffAuth`).
3. Decisions use `permissions[]` only (`orders:view`, `orders:confirm`, `orders:prepare`, `delivery:view`, …).
4. `staffJobRole` remains as **deprecated display metadata** for older Flutter clients.

| Permission | Effect in Staff BFF |
|------------|---------------------|
| `orders:view` | Table order lists/detail/history via `staff-auth/table-calls` |
| `orders:confirm` / `orders:cancel` | Accept / reject |
| `orders:edit_items` | Item PATCH (pending/confirmed) |
| `orders:prepare` | Prepare → `PATCH staff-auth/table-calls/:id/prepare` |
| `orders:deliver` | Mark delivered |
| `orders:complete` | Exposed in capabilities (completion UX) |
| `delivery:view` | Delivery lists/detail via `menus/:menuId/activity-logs` |

Self-accept block: `orders:confirm` **and not** `orders:deliver` on own staff-created pending table orders.

## Upstream mapping (summary)

| Staff BFF | Express upstream |
|-----------|------------------|
| `POST /staff/v1/auth/login` | `POST /api/staff-auth/login` |
| `GET /staff/v1/auth/me` | `GET /api/staff-auth/me` |
| `POST /staff/v1/auth/logout` | `POST /api/staff-auth/logout` |
| `GET /staff/v1/capabilities` | BFF-mapped from `/staff-auth/me` permissions |
| `GET /staff/v1/orders` (table) | `GET /api/staff-auth/table-calls` (+ `/history`) |
| `GET /staff/v1/orders` (delivery) | `GET /api/menus/:menuId/activity-logs` when `delivery:view` |
| `GET /staff/v1/orders/:id` | Table-calls and/or activity-logs (by channel + permissions) |
| `POST /staff/v1/orders/:id/actions` | Confirm/cancel → table-calls status; prepare → table-calls prepare; delivery actions → activity-logs |
| `PATCH /staff/v1/orders/:id/items` | `PATCH /api/staff-auth/table-calls/:id/items` |
| `GET /staff/v1/menu/catalog` | `GET /api/public/menu/:slug/catalog` (slug from staff `/me`) |
| `GET /health/live` | Local liveness |
| `GET /health` | Terminus health |
| `GET /staff/v1/health` | Local service probe |

## QA

Staff app V1 QA checklist (table + **online orders**): [../ens-staff-app/docs/v1-qa-checklist.md](../ens-staff-app/docs/v1-qa-checklist.md)

## Deploy (production)

1. Copy `.env.example` → `.env` on the server and set:
   - `NODE_ENV=production`
   - `ENS_BACKEND_URL=https://ensapi.ensbot.net`
   - `SECRET_KEY` — same value as the mobile gateway (HMAC for Express `x-api-key`)
   - `JWT_ACCESS_SECRET` — same as Express / Owner Gateway (min 32 characters)
   - `CORS_ORIGINS` — explicit allowlist (`*` is rejected in production)
   - `TRUST_PROXY_HOPS` — match your reverse-proxy hop count
   - `API_KEY_TIME_OFFSET_SECONDS=0` (clock sync handles skew automatically)

2. Build and run:

```bash
npm ci
npm run build
PORT=3010 node dist/main.js
```

Or use PM2 / systemd behind nginx at e.g. `https://staffapi.ensbot.net`.

3. Health checks:
   - `GET /health/live` — process liveness
   - `GET /staff/v1/health` — staff module probe

4. Point the Flutter app at production:

```powershell
flutter build appbundle `
  --dart-define=STAFF_BFF_URL=https://staffapi.ensbot.net `
  --dart-define=SOCKET_BASE_URL=https://ensapi.ensbot.net
```

**Note:** Only one process should bind port 3010 locally (`EADDRINUSE` if a stale instance is running).
