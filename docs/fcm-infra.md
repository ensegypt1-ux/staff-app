# FCM infrastructure checklist (Staff BFF)

## Postgres

1. Create a dedicated database (local: `docker compose up -d` → port **55433**).
2. Set `DATABASE_URL` (see `.env.example`).
3. Run migrations:
   ```bash
   npx prisma migrate deploy
   # or during development:
   npx prisma migrate dev
   ```

## JWT_ACCESS_SECRET parity

- Staff BFF and Express **must** share the same `JWT_ACCESS_SECRET` (min 32 chars).
- The FCM Worker mints short-lived staff JWTs for Express `staff:join` using that secret.
- Claims match Express `TokenPayload`: `{ id, userId, email, role: "staff", menuId, staffRoleId }`.
- Verify: login via BFF → decode JWT → same secret verifies on Express socket join.

## Firebase

1. Create a Firebase project; enable Cloud Messaging.
2. Register Android app `com.ensmenu.ens_staff_app` and iOS `com.ensmenu.ensStaffApp`.
3. Create a service account with Firebase Admin privileges.
4. Set on the **Worker** (and `PROCESS_ROLE=all` locally):
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY` (escaped `\n`), **or**
   - `FIREBASE_SERVICE_ACCOUNT_JSON`
5. Place Flutter configs:
   - Android: `ens-staff-app/android/app/google-services.json`
   - iOS: `ens-staff-app/ios/Runner/GoogleService-Info.plist`
6. Upload APNs key to Firebase for iOS.

## Process roles

| Role | Command / env | Purpose |
|------|---------------|---------|
| API | `PROCESS_ROLE=api` | Public REST including device register |
| Worker | `PROCESS_ROLE=worker` | Socket relays + FCM send |
| All (dev) | `PROCESS_ROLE=all` | Single process — **not** for production |

```bash
# API
PROCESS_ROLE=api npm run start:prod

# Worker
PROCESS_ROLE=worker npm run start:worker
```

## Feature flags

- `FCM_ENABLED=true` — Worker joins sockets and sends (or dry-runs).
- `FCM_DRY_RUN=true` — Log payloads; do not call Firebase.
- API readiness must **not** depend on Worker/Firebase.
