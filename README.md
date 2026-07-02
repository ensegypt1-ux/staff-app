# Ensmenu Staff BFF

Standalone NestJS backend-for-frontend for the ENS Menu **Staff** Flutter app. It proxies staff auth and order flows to the legacy Express API (`ENS_BACKEND_URL/api/*`), enriches order payloads for the mobile client, and applies role-based routing (waiter vs cashier).

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
| `CORS_ORIGINS` | Yes | `*` or comma-separated origins |
| `SECRET_KEY` | Yes | HMAC secret for `x-api-key` on legacy `/api/*` calls |
| `API_KEY_TIME_OFFSET_SECONDS` | No | Clock skew offset for API key (default `30`) |
| `UPSTREAM_DEBUG_LOG` | No | Log upstream requests (`true` / `false`) |
| `UPSTREAM_TIMEOUT_MS` | No | Axios timeout (default `30000`) |

See [docs/upstream-route-map.md](docs/upstream-route-map.md) for BFF → Express route mapping.

## Upstream mapping (summary)

| Staff BFF | Express upstream |
|-----------|------------------|
| `POST /staff/v1/auth/login` | `POST /api/staff-auth/login` |
| `GET /staff/v1/auth/me` | `GET /api/staff-auth/me` |
| `POST /staff/v1/auth/logout` | `POST /api/staff-auth/logout` |
| `GET /staff/v1/capabilities` | BFF-computed from role |
| `GET /staff/v1/orders` | Waiter: `GET /api/staff-auth/table-calls` or `.../history`; Cashier: `GET /api/menus/:menuId/activity-logs` |
| `GET /staff/v1/orders/:id` | `GET /api/menus/:menuId/activity-logs/:id` and/or `GET /api/staff-auth/table-calls/:id` |
| `POST /staff/v1/orders/:id/actions` | Waiter: `PATCH /api/staff-auth/table-calls/:id/status`; Cashier: `POST /api/menus/:menuId/activity-logs/:id/actions` |
| `PATCH /staff/v1/orders/:id/items` | `PATCH /api/staff-auth/table-calls/:id/items` (table orders, pending/confirmed) |
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
   - `CORS_ORIGINS=*` or your app origins
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