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

Managers cannot save a shift that starts and ends at the same time, or that overlaps another non-cancelled shift for the same person. An end time earlier than the start finishes the next day, so a closing shift can cross midnight. Time-off dates default to the local calendar day. Clock-out must be after clock-in, cannot be in the future, and a break cannot be longer than the shift. A person can have only one open punch (migration `0222`); a second clock-in is refused, including when two requests arrive together. An already closed punch cannot be closed again. Payroll preview counts an open shift only up to the current time, capped at the restaurant’s local end of the pay period, and a punch just after local midnight stays on that local day. Time off cannot end before it starts, and a pending or approved request cannot overlap another one for the same person. A shift swap can be requested only by the person on that shift, and only while the shift is not cancelled. Approving it once moves the shift to the chosen cover. A second decision is refused, and approval without a cover does not mark the swap done. Approving a shift swap will not move someone onto a shift that overlaps a shift they already have. An hourly rate of zero stays zero on the staff profile and in the payroll preview instead of looking like a missing rate. Approved time off blocks a new shift, a clock-in, and a swap onto that person for those days. Time off cannot be approved while that person already has a shift or a time punch in the same days. An inactive or archived person cannot be scheduled, clocked in, given time off, or approved onto a shift. Cancelling their existing shift is still allowed.

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
