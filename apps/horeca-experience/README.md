# Retired standalone HORECA app

The campaign is now part of the main Supplify deployment:

- UI: `apps/web/src/demo/`, built through `apps/web/demo/index.html`.
- Video/images/fonts/QR assets: `apps/web/static/demo/`.
- Public page: `/demo/`; `/horeca` redirects there and preserves attribution.
- Lead management: `/demo/admin/`, using existing Supplify admin authentication and `ADMIN_GROWTH` access.
- API: `apps/api/src/routes/demo-campaign.routes.js`; migration `0231_demo_campaign.sql`.
- QR tools: `scripts/horeca/qr/`.

No separate Next.js server, campaign database, Railway service, domain, or campaign admin password is needed. Local authoring files in this directory are ignored and retained only as an archive. See `docs/features/demo-experience.md` and `docs/marketing/railway-deployment.md`.
