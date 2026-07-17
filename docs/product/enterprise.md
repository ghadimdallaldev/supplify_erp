# Hidden Custom And Enterprise Handling

## Overview

Hidden custom or enterprise handling is for restaurants, suppliers, and groups that need contracted terms, SLAs, unusual scale, or limits that do not fit the public four-plan catalog. These accounts are not available in self-service signup or public plan selectors. Only an admin can assign a hidden custom or enterprise plan row, or apply tenant-specific overrides and add-ons under an approved commercial agreement.

Current public commercial guidance lives in [four-plan-pricing-model.md](./four-plan-pricing-model.md) and [plans-and-limits.md](./plans-and-limits.md).

## Public Plan Boundary

The public catalog is:

| Tenant type | Public plans                        |
| ----------- | ----------------------------------- |
| Restaurant  | Restaurant Growth, Restaurant Scale |
| Supplier    | Supplier Growth, Supplier Scale     |

Use hidden custom or enterprise handling when a tenant needs:

- More branches, warehouses, active customer locations, users, storage, or AI allowance than the public plan plus approved add-ons can support
- Contract-specific pricing, payment terms, invoicing, or SLA commitments
- Manual onboarding, migration, or account management
- Preserved overrides during migration from the older internal tier catalog

## What Custom Or Enterprise Gets

- **Contracted limits** - Limits may be unlimited (`-1`) or set through explicit tenant overrides, depending on the operational risk.
- **Feature access by entitlement** - Features still resolve through plan JSON, feature flags, and tenant overrides. Do not advertise unfinished features just because the account is custom.
- **Custom pricing** - Price may be stored outside the public plan row and reconciled through manual billing or the external billing system.
- **Manual onboarding** - Admins create or identify the tenant, assign the plan or overrides, and audit the reason.

## SLA Options

Enterprise customers can negotiate:

- Dedicated or same-day support and success management
- Uptime / availability commitments documented in a separate MSA or order form
- Data, security, audit, or residency terms covered by contract

These contractual terms are not fully stored in the product; they are reflected in operations and signed agreements.

## Custom Contracts

- Pricing, payment terms, renewal, and cancellation are defined in a separate contract.
- The platform enforces configured plan limits, feature flags, add-ons, and overrides.
- Live automated recurring provider behavior remains external until a real recurring payment provider and webhooks are implemented.

## Manual Onboarding Flow

1. Sales / CS agrees terms with the customer.
2. Admin creates or identifies the restaurant or supplier tenant.
3. Admin opens Subscriptions and assigns the hidden custom/enterprise plan row, or keeps a public plan with approved add-ons/overrides when that is safer.
4. Admin records the reason, effective limits, add-ons, trial extension if any, and billing status for audit.
5. Customer is onboarded through the standard invite and support process.

## Technical Notes

- Existing internal codes may include `enterprise` and preserved compatibility rows. Do not rename plan codes solely for display purposes.
- Hidden rows should be excluded from self-service plan APIs and public selectors through active/admin-assignment flags.
- Separate rows by `tenant_type` remain important so restaurant and supplier entitlements do not leak across tenant types.
- See [admin-guide.md](../admin/admin-guide.md) for admin subscription management.
