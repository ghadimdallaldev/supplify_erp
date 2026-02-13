# Supplify Blueprint

This folder contains Mermaid diagrams and documentation that reflect the current system (including RBAC, tenant_type plans, entitlements, plan-change preview, overrides, suspension blocking, soft-wall UX, and health/finance dashboards).

## Previewing Mermaid diagrams

- **VS Code:** Install extension "Markdown Preview Mermaid Support" or "Mermaid Preview"; open the `.mmd` file and use preview.
- **GitHub:** Render `.mmd` by renaming to `.md` or embedding in markdown with ```mermaid code blocks.
- **Online:** Paste diagram content into [mermaid.live](https://mermaid.live).

## Styling (optional)

UI sitemaps use a shared theme for clearer rendering. To reuse it in other `.mmd` flowcharts, add this first line:

```mermaid
%%{init: {'theme':'base', 'themeVariables': { 'primaryColor':'#e3f2fd', 'primaryTextColor':'#0d47a1', 'primaryBorderColor':'#1976d2', 'lineColor':'#546e7a' }}}%%
```

Use **subgraphs** to group related nodes and **shorter labels** (path + one line) to avoid wrapping in preview.

## Contents

- **system_context.mmd** — System context (users, public portals, API, DB, Keycloak).
- **rbac_multitenancy.mmd** — Roles, tenant types, and permission model.
- **erd_full.mmd** — Entity relationship overview (subscription, orders, products, inventory, reservations, chat, staff, branches, warehouses, invoices, payments, etc.).
- **api_architecture.mmd** — All API route groups (catalog, orders, inventory, tenants, billing, chat, notifications, reservations, staff, admin, public).
- **deployment_architecture.mmd** — Deployment components.
- **feature_overview.mmd** — Single map of every Supplify feature area (orders, cart, catalog, inventory, fulfillment, invoices, reservations, chat, staff, subscriptions, admin, files, notifications, analytics).
- **folder_structure.md** — Repo folder layout.
- **ui_sitemap/** — Restaurant, Supplier, Admin UI sitemaps.
- **workflows/** — Order (with checkout), invoice, inventory, reservation, subscription, admin, impersonation, receiving, chat, fulfillment flows.
- **admin/** — Admin scope, RBAC matrix, endpoints.
