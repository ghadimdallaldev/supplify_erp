# Staff & Labour Control Center — Audit

Last updated: 2026-06-11 (implementation in progress)

## 1. Purpose

Operational audit and improvement tracker for the Supplify **Staff operations** manager module (`/app/staff`) and **staff portal** (`/staff/dashboard`). This is **not** an HRMS — no accrual engines, policy workflows, or tax/compliance claims.

## 2. Constraints

- Extend existing tabs, routes, and lazy-load pattern — no module rewrite.
- **Platform users** (`RESTAURANT` + RBAC → `/app`) vs **operational staff** (`STAFF_PORTAL` → `/staff/dashboard`).
- **Honest metrics**: show "Not available" when data cannot be derived.

## 3. Audit summary matrix

| Area                               | Status       | Notes                                                                    |
| ---------------------------------- | ------------ | ------------------------------------------------------------------------ |
| **Manager UI — Labour Today**      | IMPROVED     | New default tab with KPI cards and Needs attention alerts.               |
| **Manager UI — Team tab**          | IMPROVED     | Per-row clock loading; portal access panel unchanged.                    |
| **Manager UI — Schedule tab**      | PARTIAL      | Create shifts + swap approve/decline; swap approval now reassigns shift. |
| **Manager UI — PTO tab**           | IMPROVED     | Dialog for manager notes; decision notifications to staff.               |
| **Manager UI — Announcements tab** | IMPROVED     | Tab label fixed to "Announcements".                                      |
| **Manager UI — Docs tab**          | PARTIAL      | URL-based docs; expiring-doc alerts in Labour Today summary.             |
| **Manager UI — Payroll tab**       | IMPROVED     | Preview endpoint, DRAFT workflow, hours/cost breakdown in UI.            |
| **Needs attention alerts**         | DONE         | Server-computed in `GET /api/staff/labour-summary`.                      |
| **Staff portal — core flows**      | DONE         | Clock, shifts, PTO, swap, docs, time history wired.                      |
| **Staff portal — mobile UX**       | IMPROVED     | Sticky clock bar, teammate picker, ack/availability, logout.             |
| **Staff portal auth wall**         | DONE         | `requireAuth` whitelist + `requirePlatformAppAccess`.                    |
| **Dual-role login preservation**   | FIXED        | Platform roles preserved over `STAFF_PORTAL` on upsert.                  |
| **PTO flow E2E**                   | IMPROVED     | Staff notified on approve/decline.                                       |
| **Shift swap approval**            | FIXED        | Reassigns `staff_shift.staff_id`; status `COMPLETED`.                    |
| **Swap cover validation (self)**   | FIXED        | Same-restaurant, active, not-self checks on portal submit.               |
| **Time tracking intelligence**     | IMPROVED     | Late / missed clock-out / no-shift alerts in summary API.                |
| **Labour cost calculation**        | IMPROVED     | Hourly estimate in summary + payroll preview (not legal OT).             |
| **Payroll export**                 | IMPROVED     | Server preview rollup; DRAFT → APPROVED → EXPORTED.                      |
| **Manager summary API**            | DONE         | `GET /api/staff/labour-summary`.                                         |
| **Tests**                          | IMPROVED     | Summary service, routes, RBAC, portal access, UI smoke tests.            |
| **Mobile native app**              | OUT OF SCOPE | Web staff portal polish only.                                            |

## 4. Manual QA checklist (14 items)

| #   | Scenario                                          | Expected                                               | Pass |
| --- | ------------------------------------------------- | ------------------------------------------------------ | ---- |
| 1   | Manager opens `/app/staff`                        | Labour Today is default tab; KPI cards load            |      |
| 2   | Late staff (assigned shift, clock-in after grace) | Late count + warning alert on Labour Today             |      |
| 3   | Open entry from yesterday                         | Missed clock-out critical alert                        |      |
| 4   | Pending PTO / swap                                | Counts on KPI cards; alerts link to PTO / Schedule tab |      |
| 5   | Hourly staff with rates                           | Estimated labour cost today shows sum                  |      |
| 6   | No hourly wages / unassigned shifts               | "Not available" on late or cost where appropriate      |      |
| 7   | Approve PTO with note                             | Dialog (not prompt); staff portal shows updated status |      |
| 8   | Approve swap with cover                           | Shift reassigned to cover; swap COMPLETED              |      |
| 9   | Dual-role user login                              | Keeps `/app` access (RESTAURANT not downgraded)        |      |
| 10  | Staff portal swap cover picker                    | Teammate Select, not UUID field                        |      |
| 11  | Staff portal ack announcement                     | Ack button works (Keycloak + magic link)               |      |
| 12  | Payroll preview + export                          | Hours/cost breakdown; export starts DRAFT              |      |
| 13  | Team tab clock in/out                             | Only clicked row shows loading                         |      |
| 14  | Staff portal sign out                             | Keycloak logout or magic-link session cleared          |      |

## 5. APIs

| Method | Path                                               | Description                                 |
| ------ | -------------------------------------------------- | ------------------------------------------- |
| GET    | `/api/staff/labour-summary?date=`                  | Manager KPI counts + alerts                 |
| GET    | `/api/staff/payroll/preview?periodStart&periodEnd` | Hours/cost rollup preview                   |
| POST   | `/api/staff/payroll`                               | Create export (`usePreview`, default DRAFT) |
| PATCH  | `/api/staff/payroll/:id`                           | Status transitions                          |
| POST   | `/api/staff/swaps/:id/decision`                    | Approve reassigns shift → COMPLETED         |
| GET    | `/api/staff/self/dashboard`                        | Includes `teammates` for swap picker        |

## 6. Remaining risks

- Late detection requires assigned shifts; unassigned → late metric unavailable.
- Overtime uses >8h/day heuristic — not jurisdiction-specific OT law.
- Salary/contract staff excluded from hourly cost estimates.
- Open time entries included in today's hours with operational caveat.
- Swap without proposed cover: approval records decision; manager edits shift manually.
- Magic link token in localStorage remains a known tradeoff.

## 7–9. Implementation log

_See sections 10–13 after test run._

## 10. What already worked

- Staff portal clock, PTO submit, swap request, docs, time history.
- Manager directory, schedule creation, PTO approve/decline, announcements publish.
- Auth wall separating `STAFF_PORTAL` from `/app` manager APIs.

## 11. What was fixed / added

- **Labour Today tab** (`StaffTodayTab`) as default manager view with KPI cards, alerts, and tab deep-links.
- **`GET /api/staff/labour-summary`** with late/missed clock-out/pending/expiring-doc rules.
- **Payroll preview** (`GET /api/staff/payroll/preview`), DRAFT exports, `PATCH /api/staff/payroll/:id`.
- **Swap approval** reassigns `staff_shift.staff_id` and sets status `COMPLETED`.
- **PTO/swap decision notifications** to linked staff users (`notifyStaffPtoDecision`, `notifyStaffSwapDecision`).
- **Dual-role RBAC** preserves `RESTAURANT`/`ADMIN`/`SUPPLIER` over `STAFF_PORTAL` on login.
- **Portal swap cover validation** (same restaurant, active, not self).
- **Staff portal mobile polish**: sticky clock bar, teammate picker, availability/ack, sign out, URL token cleanup.
- **Team tab** per-row clock loading; **Announcements** tab label fix; **PTO dialog** replaces `window.prompt`.

## 12. Test results

| Suite                                                                      | Result           |
| -------------------------------------------------------------------------- | ---------------- |
| `npx vitest run staff-labour-summary staff.routes staff-portal rbac` (API) | **97/97 passed** |
| `npx vitest run StaffToday` (web)                                          | **2/2 passed**   |

New/updated: `staff-labour-summary.service.test.js`, `staff.routes.test.js`, `rbac.test.js` (dual-role), `StaffTodayTab.test.tsx`, `staff-portal-access.test.js`.

## 13. Security / RBAC notes

- `requirePlatformAppAccess` wired on manager staff router (`staff/index.js`) — blocks `STAFF_PORTAL` from `/api/staff/*` manager routes.
- Self routes remain under `/api/staff/self` and magic-link public routes; no manager API exposure on portal.
- Swap cover tenant validation on portal submit prevents cross-restaurant cover IDs.
- Dual-role users with existing platform role are not downgraded to portal-only on Keycloak upsert.
