# Supplify Blueprint

This folder contains Mermaid diagrams and documentation that reflect the current system (including RBAC, tenant_type plans, entitlements, plan-change preview, overrides, suspension blocking, soft-wall UX, and health/finance dashboards).

## Previewing Mermaid diagrams

- **VS Code:** Install extension "Markdown Preview Mermaid Support" or "Mermaid Preview"; open the `.mmd` file and use preview.
- **GitHub:** Render `.mmd` by renaming to `.md` or embedding in markdown with ```mermaid code blocks.
- **Online:** Paste diagram content into [mermaid.live](https://mermaid.live).

## Contents

- **system_context.mmd** — System context (users, API, DB, Keycloak).
- **rbac_multitenancy.mmd** — Roles, tenant types, and permission model.
- **erd_full.mmd** — Entity relationship overview (subscription, invoice, orders, etc.).
- **api_architecture.mmd** — API route groups and auth flow.
- **deployment_architecture.mmd** — Deployment components.
- **folder_structure.md** — Repo folder layout.
- **ui_sitemap/** — Restaurant, Supplier, Admin UI sitemaps.
- **workflows/** — Order, invoice, inventory, reservation, subscription, admin, impersonation flows.
- **admin/** — Admin scope, RBAC matrix, endpoints.
