# Push Notifications (Web Push / PWA)

Browser-native **Web Push** via VAPID. Complements in-app `notification_log` entries; does not use Twilio or FCM.

## Configuration

Set in `apps/api/.env`:

```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=notifications@yourdomain.com
```

### Generate VAPID keys

From `apps/api`:

```bash
npx web-push generate-vapid-keys
```

Copy the public and private keys into environment variables. `VAPID_EMAIL` must be a `mailto:` contact (stored as the address only in config; the service prefixes `mailto:`).

If keys are missing, `/api/push/vapid-public-key` returns `503` and push delivery is skipped.

## API

| Method | Path                         | Auth | Description                                                |
| ------ | ---------------------------- | ---- | ---------------------------------------------------------- |
| GET    | `/api/push/vapid-public-key` | No   | Public VAPID key for `pushManager.subscribe()`             |
| POST   | `/api/push/subscribe`        | Yes  | Save subscription (`endpoint`, `keys.p256dh`, `keys.auth`) |
| DELETE | `/api/push/unsubscribe`      | Yes  | Remove subscription by `endpoint`                          |

**Subscribe body:**

```json
{
  "endpoint": "https://fcm.googleapis.com/...",
  "keys": {
    "p256dh": "...",
    "auth": "..."
  }
}
```

## Delivery

After each in-app notification is written to `notification_log`, `notification.service.js` calls `sendWebPushToUser` when:

- VAPID keys are configured
- User preference `push_enabled` is true

Push is fire-and-forget (does not block the API response). Stale endpoints (`410` / `404` from the push service) delete the `push_subscriptions` row automatically.

**Payload shape (JSON string):**

```json
{
  "title": "New Order Received",
  "body": "Order #abc…",
  "url": "/app/orders/…",
  "referenceId": "…",
  "referenceType": "ORDER"
}
```

## Database

Migration: `0073_push_subscriptions.sql` — table `push_subscriptions` keyed by `(user_id, endpoint)`.

## Frontend (planned)

- `usePushNotifications` hook: permission banner, subscribe via service worker
- Service worker `push` handler for notification display and click-through
- Settings → Notifications: **Push** toggle maps to `push_enabled`

Prompt for permission only after ~30 seconds of activity.

## User preferences

`notification_preferences.push_enabled` defaults to `false` in API behavior (opt-in). Enable in Settings when the UI toggle is wired.
