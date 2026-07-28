# Identity uniqueness and normalization

Phase 1 enforces case-insensitive global email uniqueness for `app_user`.

- Shared normalization: [`identity-normalize.js`](../../apps/api/src/lib/identity-normalize.js).
- Database source of truth: migration `0193_identity_hardening.sql`, using `LOWER(TRIM(email))` in a unique index.
- The migration fails closed and reports only the number of duplicate normalized-email groups; it does not commit raw email addresses.
- Account upsert, Keycloak-admin email handling, invitation identity handling, registration, and consumer signup use the shared email normalizer.
- Database unique races map to a safe conflict response or callback error; SQL details are not returned.
- `app_user.is_active` is enforced by authenticated lookup; deactivated accounts cannot authenticate.
- Consumer usernames are normalized to lowercase and reserved names are rejected. Existing restaurant-scoped consumer username/email uniqueness remains database-backed.

Deferred to Phase 2: global `app_user.username` and `app_user.phone` columns/constraints, provider-specific email alias policy, and a full phone-number library rollout. Local phone input is rejected unless an international country code is supplied.
