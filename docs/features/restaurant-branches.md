# Restaurant branches and invitations

> Pricing model note: plan names, prices, limits, and upgrade examples in this document may reflect the legacy tier catalog. Current commercial guidance lives in [../product/four-plan-pricing-model.md](../product/four-plan-pricing-model.md) and [../product/plans-and-limits.md](../product/plans-and-limits.md). Use those documents for current public names, limits, trial behavior, add-ons, AI allowances, and billing status.

## Model

- **Restaurant organization** (`restaurant_organizations`) owns one or more **branch accounts** (`restaurant` rows with `organization_id`).
- Each branch is a full tenant: own orders, inventory, staff, and settings.
- The **main branch** (`is_main_branch = true`) cannot be deactivated.

## Org-level roles

| Role             | Scope                  | Notes                                                 |
| ---------------- | ---------------------- | ----------------------------------------------------- |
| Org Owner        | All branches           | Create/deactivate branches, assign org roles          |
| Org Manager      | All branches           | Manage branches; cannot deactivate main branch        |
| Org Viewer       | All branches           | Read-only                                             |
| Regional Manager | Assigned branches only | Branch access via `restaurant_org_user_branch_access` |

## Branch-level roles

System roles seeded per branch: Owner, Manager, Purchaser, Accountant, Inventory Clerk, FOH Staff, Viewer.

## Creating a branch

1. Settings → **Branches** → **Add Branch** (requires `multi_branch` on Gold+).
2. Step 1: branch name, address, phone, optional branch code.
3. Step 2: generate a **branch manager** invite link (no email sent). Share the link manually.

Org Owners can also use **Organization** (`/app/org`) to add branches and switch context.

## Inviting team members

1. Settings → **Team** → **Invite via Link**.
2. Enter name, reference email, and role (with descriptions).
3. Copy the link and share it. Expires in 7 days.

Requires `STAFF_MANAGE` on the current branch.

## Invite acceptance

Public page: `/invite?token=…&type=rm|rb|sb`

- `rm` — join branch as selected role
- `rb` — branch manager (Owner on branch + Regional Manager at org)
- `sb` — supplier branch (existing flow)

## Branch switcher

Header switcher uses `/api/restaurant-org/branches` when the user belongs to a restaurant org. Switching calls `POST /api/restaurant-org/context/switch`.

## Feature flag

`multi_branch` gates branch creation and org switcher for restaurants (same as suppliers).

## Email

Invitation delivery is **link-only** today. No emails are sent.

## Migration

After deploying migration `0086`, run:

```bash
pnpm db:migrate-restaurants-to-orgs
```
