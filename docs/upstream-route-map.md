# Staff BFF upstream route map

Base URLs:

- **BFF:** `{STAFF_BFF_URL}` (default `http://localhost:3010`)
- **Express:** `{ENS_BACKEND_URL}/api`

All protected BFF routes expect `Authorization: Bearer <staffAccessToken>` unless marked **Public**.

## Auth

| BFF route | Method | Upstream | Notes |
|-----------|--------|----------|-------|
| `/staff/v1/auth/login` | POST | `POST /staff-auth/login` | **Public** |
| `/staff/v1/auth/me` | GET | `GET /staff-auth/me` | |
| `/staff/v1/auth/logout` | POST | `POST /staff-auth/logout` | |

## Health

| BFF route | Method | Upstream | Notes |
|-----------|--------|----------|-------|
| `/staff/v1/health` | GET | — | **Public**, `{ status, service }` |
| `/health/live` | GET | — | **Public** |
| `/health` | GET | — | **Public**, Terminus |

## Orders & capabilities

| BFF route | Method | Upstream | Notes |
|-----------|--------|----------|-------|
| `/staff/v1/capabilities` | GET | `GET /staff-auth/me` (role) | BFF presenter |
| `/staff/v1/orders` | GET | Role-dependent | See below |
| `/staff/v1/orders/:id` | GET | `GET /menus/:menuId/activity-logs/:activityLogId`, `GET /staff-auth/table-calls/:id` | Query: `menuId`, `activityLogId` |
| `/staff/v1/orders/:id/actions` | POST | Waiter: `PATCH /staff-auth/table-calls/:id/status`; Cashier: `POST /menus/:menuId/activity-logs/:logId/actions` | Body: `action`, optional `menuId`, `activityLogId` |
| `/staff/v1/orders/:id/items` | PATCH | `PATCH /staff-auth/table-calls/:id/items` | Body: `menuId`, `items[]`, optional `activityLogId`. Table orders only (`canEditItems`). |
| `/staff/v1/menu/catalog` | GET | `GET /public/menu/:slug/catalog` | Slug from `GET /staff-auth/me`. Query: `locale`, `page`, `limit`, `categoryId`. |

### `GET /staff/v1/orders` by role

**Waiter**

| Query `scope` | Upstream |
|---------------|----------|
| `active` (default) | `GET /staff-auth/table-calls` |
| `history` | `GET /staff-auth/table-calls/history` (waiter) or `GET /menus/:menuId/activity-logs?channel=table` (cashier) |

Common query: `channel` (`table` \| `delivery`), `page`, `limit`.

**Table history only:** `dateFrom`, `dateTo` (`YYYY-MM-DD`, default today). BFF filters to delivered/cancelled and paginates after scope filter. Waiter path scans up to 500 upstream rows when Express history has no date params.

**Cashier**

| Upstream | Query forwarded |
|----------|-----------------|
| `GET /menus/:menuId/activity-logs` | `page`, `limit`, `channel`, `q`, `dateFrom`, `dateTo`, `status` |

If `menuId` is omitted, BFF resolves it via `GET /staff-auth/me` → `menu.id`.

## Headers (BFF → Express)

| Header | Source |
|--------|--------|
| `Authorization` | Forwarded from client |
| `Accept-Language` | Forwarded from client |
| `x-api-key` | Injected by BFF when `SECRET_KEY` is set |

## Not exposed in V1

| Gateway / legacy idea | Staff BFF V1 |
|-----------------------|--------------|
| Online order item editing | **Not implemented** |
