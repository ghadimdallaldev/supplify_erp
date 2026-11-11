# HORECA demo: part of the main Supplify deployment

Updated 2026-11-11. This replaces the former standalone Next.js/Railway plan.

## URLs

- Dev: https://app-dev.supplifyerp.com/demo/
- Preprod: https://app-preprod.supplifyerp.com/demo/
- Production: https://app.supplifyerp.com/demo/
- `/horeca` redirects to `/demo/`, preserving QR/UTM parameters.
- Lead review: `/demo/admin/` with the existing Supplify admin login and ADMIN_GROWTH permission.

## Build and deploy

Use the existing web/API Railway services and their existing domains. Do not create a HORECA service, database, custom domain, or campaign admin password.

The normal web Vite build emits both the ERP index and `dist/demo/index.html`. Nginx serves `/demo/` and its assets, including video byte-range requests. Demo CSS and initialization are isolated from the ERP shell by the separate HTML entry in the same build. All assets are bundled under `apps/web/static/demo/`; no media API or Next image server is needed.

The existing API owns the public campaign submission/event endpoints and admin-protected lead management. Startup migration `0231_demo_campaign.sql` creates the two campaign tables in each environment's existing database. No new required environment variables are introduced. Existing API/database/Redis/auth configuration remains authoritative. Lead requests are stored for manual follow-up; no meeting or notification email is automatically sent by this integration.

Commit the full release to dev, verify it, then promote dev → preprod → prod with the repository's existing promotion script. Use an isolated release checkout so pruning cannot remove local ignored worktrees or authoring files. Android and iOS contracts are kept in sync and their full dev changes follow the same branch sequence. No direct main/prod development or force push is required.

## Checks before sharing the QR code

1. Check each environment's API `/ready` and `/health`, main web page, and public `/demo/` route independently.
2. Verify the API deployment applied migration 0231. Validate a demo submission without creating an ERP tenant. Confirm campaign admin endpoints reject anonymous visitors.
3. Play the film, verify byte ranges, complete both seven-step walkthroughs, and check a phone viewport. Confirm `/horeca` retains attribution on redirect.
4. Generate the production QR set with `python scripts/horeca/qr/generate.py --base-url https://app.supplifyerp.com/demo`, then run `python scripts/horeca/qr/verify.py`.
5. Share `/demo/qr/supplify-horeca2026-general_phone.png` on a phone, or print the corresponding `_A5.pdf`/`_A4.pdf`. All three role variants encode the production demo URL, not an environment-specific temporary domain.

## Source and tests

See `docs/features/demo-experience.md` for API contracts, security boundaries, data handling and mobile parity. `pnpm test:demo` runs the main-build browser checks against a preview (override with `DEMO_BASE_URL`). Focused API tests cover validation, consent, deduplication, privacy, lead updates, CSV safety and admin permission resolution. Normal web/API suites and mobile typechecks remain release gates.

`apps/horeca-experience/` is a retired local archive whose original runtime/configuration is ignored. Nothing in Cookie Dough Solutions is needed for this deployment.
