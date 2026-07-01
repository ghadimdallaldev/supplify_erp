# Recipe Costing V1 — pre-deploy checklist

**Migration:** `0186_recipe_costing.sql`  
**Plan feature:** `recipe_costing` (restaurant Gold, Platinum; Free Trial inherits Gold gates)  
**Deploy order:** `dev` → `preprod` → `prod` — [branching.md](../operations/branching.md)

## Pre-deploy (each environment)

```bash
npm run db:migrate
npm run db:sync-roles
```

## Smoke (Gold restaurant tenant)

- [ ] Sidebar shows **Recipes** and **Recipe costing**
- [ ] `GET /api/recipes` → 200; Silver tenant → 403
- [ ] Create recipe with supplier-product ingredient → cost breakdown (or `MISSING_DATA` if no price)
- [ ] Post receiving for mapped SKU → recipe cost updates within ~3 min (`recipe_recalc` cron)
- [ ] `/app/recipe-costing/price-impact` lists supplier price changes when applicable
- [ ] Purchaser role: recipes OK, cost fields hidden without `RECIPES_VIEW_COSTS`

## Automated tests (dev)

```cmd
node scripts/pnpm-run.mjs --filter @supplify/api test:run -- money recipe-cost recipes.routes
node scripts/pnpm-run.mjs --filter @supplify/web test:run -- RecipesListPage
```

## Docs

- [recipe-costing.md](../features/recipe-costing.md)
- QA gates: `GATE-R21`–`GATE-R21b` in [regression-checklist.md](../qa/regression-checklist.md)
