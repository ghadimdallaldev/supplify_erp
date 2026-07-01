# Release checklists

Pre-deploy sign-off documents for coordinated releases (migrations + UI + legal).

| Release                                                                                      | Scope                                                                                                         |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [2026-07-01-recipe-costing-v1-checklist.md](./2026-07-01-recipe-costing-v1-checklist.md)     | Migration `0186`, recipe costing V1 (web), `recipe_recalc` cron, `RECIPES_*` RBAC                             |
| [2026-06-17-supplier-ops-wave-2-checklist.md](./2026-06-17-supplier-ops-wave-2-checklist.md) | Migrations `0176`–`0179`, run sheet, pick lists, POD, quote lock, accounting export, i18n                     |
| [2026-06-12-pre-deploy-checklist.md](./2026-06-12-pre-deploy-checklist.md)                   | B2C storefront/hours, `delivery_zone` unify (`0164`/`0165`), supplier delivery board 500 fix                  |
| [2026-06-09-pre-deploy-checklist.md](./2026-06-09-pre-deploy-checklist.md)                   | Migrations `0144`/`0145` (plan audit), Deals/Boosts UI wording, legal pack `2026-06-09` + login re-acceptance |

Deploy order: **dev → preprod → prod** — see [../operations/railway-environments.md](../operations/railway-environments.md).
