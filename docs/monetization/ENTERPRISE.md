# Enterprise Plan

## Overview

The **Enterprise** plan is for large chains, distributors, and organizations that need custom terms, SLAs, and scale beyond the standard Platinum tier. It is **not** available for self-serve signup or in the public plan selector. Only an **admin** can assign the Enterprise plan to a tenant.

## What Enterprise Gets

- **Unlimited (or very high) limits** — Branches, warehouses, users, orders per day, products/SKUs, chat, and storage are effectively unlimited (or set to very high caps in the plan definition).
- **Full feature set** — All platform features are enabled (reports, smart reorder, multi-branch, advanced finance, fulfillment suite, API/webhooks, etc.).
- **Custom pricing** — Price is typically set by contract (e.g. `price_per_month` may be 0 in the catalog; billing is handled outside the plan row).
- **Manual onboarding** — Onboarding is done by your team: create the tenant, assign the Enterprise plan via Admin Dashboard → Subscriptions, and optionally set limit overrides or custom settings.

## SLA Options

Enterprise customers can negotiate:

- **Support SLA** — Dedicated or same-day support, dedicated success manager.
- **Uptime / availability** — Documented in a separate MSA or order form.
- **Data and security** — Compliance requirements (e.g. data residency, audit support) as per your commercial terms.

These are not stored in the product; they are reflected in your contracts and operations.

## Custom Contracts

- Pricing, payment terms, and renewal are defined in a separate contract (MSA, order form, or similar).
- The platform does not enforce contract-specific billing; it only enforces the plan’s limits and features. Invoicing for Enterprise may be manual or via your billing system.

## Manual Onboarding Flow

1. **Sales / CS** agrees terms with the customer (pricing, SLA, limits).
2. **Admin** creates or identifies the tenant (restaurant or supplier) in the Admin Dashboard.
3. **Admin** opens Subscriptions, finds the tenant’s subscription, and changes the plan to **Enterprise** (Restaurant or Supplier, as appropriate). No self-serve flow is shown for Enterprise.
4. Optionally, **Admin** applies **limit overrides** (e.g. a specific storage cap) or leaves the plan’s built-in limits as-is.
5. Customer is given access (invite users, share login/docs) and onboarded per your process.

## Technical Notes

- Plan `code` is `enterprise`; `tenant_type` is `RESTAURANT` or `SUPPLIER` (separate rows).
- The plan row has `requires_admin_assignment = true` so it is excluded from any self-serve plan picker. Only admin-initiated plan changes can set a tenant to Enterprise.
- See **[SUBSCRIPTIONS.md](./SUBSCRIPTIONS.md)** for enforcement (limits, features) and **[ADMIN.md](../admin/ADMIN.md)** for admin subscription management.
