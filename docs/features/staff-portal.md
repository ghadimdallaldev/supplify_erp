# Staff portal access (operational staff)

Operational staff (waiters, cashiers, chefs, drivers, kitchen) are **separate** from platform/team users managed under **Settings → Team → Roles**.

## User types

| Type              | Managed from            | App role                                 | Login                               | Access                    |
| ----------------- | ----------------------- | ---------------------------------------- | ----------------------------------- | ------------------------- |
| Platform / team   | Settings → Team         | `RESTAURANT` + tenant RBAC               | `/login` → `/app`                   | Admin app per permissions |
| Operational staff | `/app/staff` → Team tab | `STAFF_PORTAL` (Keycloak `staff_portal`) | `/staff/login` → `/staff/dashboard` | Staff self-service only   |

**Dual access:** A person can be a platform user and also linked as staff (`staff_member.user_id`) without changing their platform role. Portal self-service uses `/api/staff/self/*`; they still use `/login` for `/app`.

## Manager controls (`/app/staff` → Team)

Per staff member with `STAFF_EDIT` / `STAFF_MANAGE`:

- Create portal account (Keycloak + `app_user` + link)
- Send login invite email
- Copy staff login link (`/staff/login`)
- Reset access (temporary password, re-enable Keycloak user)
- Disable portal access
- View status and last login

## Staff self-service

Authenticated (`/api/staff/self/*`) or legacy magic link (`/api/public/staff/*`):

- Clock in / out
- Upcoming shifts (own only)
- PTO requests
- Shift swap requests
- Availability
- Announcement acknowledgments
- Own documents and time entries

## Security

- `requireAuth` blocks `STAFF_PORTAL` users from all APIs except `/auth/me`, logout/refresh, and `/api/staff/self/*`
- `requireStaffPortalAuth` scopes every self route to the linked `staff_member` row
- Staff cannot call `/api/staff/members` or other tenants’ admin routes
- Frontend `AuthGuard` redirects `STAFF_PORTAL` away from `/app`

## Database

Migration `0108_staff_portal_accounts.sql`:

- `staff_member.user_id`, `portal_access_enabled`, invite/login timestamps
- `app_user.role` includes `STAFF_PORTAL`

## Keycloak

Realm role: `staff_portal` (not `restaurant` / `supplier`). Provisioned on account create via Admin API.
