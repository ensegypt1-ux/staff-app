# Staff BFF upstream route map

Base URLs:

- **BFF:** `{STAFF_BFF_URL}` (default `http://localhost:3010`)
- **Express:** `{ENS_BACKEND_URL}/api`

All protected BFF routes expect `Authorization: Bearer <staffAccessToken>` unless marked **Public**.

## Auth

| BFF route | Method | Upstream | Notes |
|-----------|--------|----------|-------|
| `/staff/v1/auth/login` | POST | `POST /staff-auth/login` | **Public** |
| `/staff/v1/auth/me` | GET | `GET /staff-auth/me` | Returns `permissions[]`, `role`, `staff` |
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
| `/staff/v1/capabilities` | GET | `GET /staff-auth/me` | Maps `permissions[]` → granular + legacy capability flags |
| `/staff/v1/orders` | GET | Permission-dependent | See below |
| `/staff/v1/orders/:id` | GET | Table-calls and/or activity-logs | Query: `menuId`, `activityLogId`, optional `scope` |
| `/staff/v1/orders/:id/actions` | POST | See action routing | Body: `action`, optional `menuId`, `activityLogId` |
| `/staff/v1/orders/:id/items` | PATCH | `PATCH /staff-auth/table-calls/:id/items` | Requires `orders:edit_items` + pending/confirmed |
| `/staff/v1/menu/catalog` | GET | `GET /public/menu/:slug/catalog` | Slug from `GET /staff-auth/me`. Query: `locale`, `page`, `limit`, `categoryId`. |

### Authorization source of truth

- JWT: staff identity + `menuId` scope (unchanged).
- `/staff-auth/me` `permissions[]`: all product gates.
- `staffJobRole`: deprecated display metadata only.

### `GET /staff/v1/orders` by permission

**Table (`channel=table`, requires `orders:view`)**

| Query `scope` | Upstream |
|---------------|----------|
| `active` (default) | `GET /staff-auth/table-calls` (+ merge confirmed/prepared from `/history`) |
| `history` | `GET /staff-auth/table-calls/history` (date-filtered in BFF) |

Table lists **never** use `activity-logs`.

**Delivery (`channel=delivery`, requires `delivery:view`)**

| Upstream | Query forwarded |
|----------|-----------------|
| `GET /menus/:menuId/activity-logs` | `page`, `limit`, `channel`, `q`, `dateFrom`, `dateTo`, `status` |

`menuId` comes from verified JWT scope (optional client value must match).

### `POST /staff/v1/orders/:id/actions` routing

| Action | Upstream |
|--------|----------|
| `TABLE_CALL_CONFIRMED` / `TABLE_CALL_CANCELLED` | `PATCH /staff-auth/table-calls/:id/status` (table); delivery with log → activity-logs actions |
| `TABLE_CALL_PREPARED` | **`PATCH /staff-auth/table-calls/:id/prepare`** when a table call exists (not activity-logs) |
| `TABLE_CALL_DELIVERED` | `POST /menus/:menuId/activity-logs/:logId/actions` when an activity log is resolved |

Permission gates: `orders:confirm`, `orders:cancel`, `orders:prepare`, `orders:deliver`.

Self-accept denial: actor has `orders:confirm` and **not** `orders:deliver`, and created the pending table order.

### `GET /staff/v1/capabilities` response shape

```json
{
  "permissions": ["orders:view", "orders:confirm", "orders:cancel", "orders:edit_items"],
  "roleName": "Waiter",
  "roleId": 1,
  "staffJobRole": "waiter",
  "capabilities": {
    "orders:view": true,
    "orders:confirm": true,
    "orders:cancel": true,
    "orders:edit_items": true,
    "orders:prepare": false,
    "orders:deliver": false,
    "orders:complete": false,
    "delivery:view": false,
    "menu:view": false,
    "menu:categories": false,
    "menu:items": false,
    "menu:tables": false,
    "menu:import": false,
    "analytics:view": false,
    "staff:manage": false,
    "settings:manage": false,
    "canViewKitchen": false,
    "staffJobRole": "waiter",
    "canProcessOrders": false,
    "canViewDelivery": false,
    "canViewHistory": true,
    "canEditItems": true,
    "channels": ["table"]
  }
}
```

## Headers (BFF → Express)

| Header | Source |
|--------|--------|
| `Authorization` | Forwarded from client |
| `Accept-Language` | Forwarded from client |
| `x-api-key` | Injected by BFF when `SECRET_KEY` is set |

## Not exposed in V1

| Gateway / legacy idea | Staff BFF V1 |
|-----------------------|--------------|
| Online order item editing without `orders:edit_items` | Denied |
