# Branch invitations

Shareable invite links let org owners onboard branch managers without email delivery. Links are cryptographically random, expire after seven days, and can be revoked or regenerated.

## Requirements

- Tenant must have the `multi_branch` feature enabled.
- Only **Org Owner** can create, list, revoke, and regenerate invitations.

## Create a branch and invite a manager

1. Open **Organization** (`/app/org`) as Org Owner.
2. Click **Add branch account**.
3. Step 1: enter branch name, address, phone, and optional branch code → **Create Branch**.
4. Step 2: enter manager name and email (reference only — **no email is sent**), choose a branch role, then **Generate Invite Link**.
5. Copy the link and share it manually (chat, SMS, etc.).
6. Use **Invite Another Person** to create additional invites for the same branch, or **Done** to close.

## Invite link format

```
https://<app-domain>/invite/branch?token=<96-char-hex>
```

Tokens are generated with `crypto.randomBytes(48)` (96 hex characters). They are stored in `branch_invitations.token` and validated on every public request.

## Accepting an invitation

The invitee opens the link and sees:

- **Valid**: signup form (name, email, password) or, if already logged in, **Accept & Join Branch**.
- **Expired**: message to contact the org admin for a new link.
- **Invalid / already used**: sign-in prompt.

On success, the API creates (or reuses) a Keycloak user and `app_user`, assigns `tenant_user_roles` for the invited branch role, marks the invitation `accepted`, sets the active branch cookie, and returns an auth session.

## Managing invitations

From **Organization** → branch card → **Invitations**, or `/app/org/branches/:supplierId`:

| Status   | Actions                          |
|----------|----------------------------------|
| Pending  | Copy Link (regenerates token), Revoke |
| Accepted | Shows accepter name              |
| Expired / Revoked | Resend (regenerates)      |

**Invite Someone New** opens the same invite modal as step 2 of branch creation.

## API

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/org/invitations` | Org Owner + `multi_branch` |
| GET | `/api/org/invitations` | Org Owner + `multi_branch` |
| GET | `/api/org/invitations/roles?supplier_id=` | Org Owner |
| DELETE | `/api/org/invitations/:id` | Org Owner |
| POST | `/api/org/invitations/:id/regenerate` | Org Owner |
| GET | `/api/public/invitations/branch?token=` | Public |
| POST | `/api/public/invitations/branch/accept` | Public (optional session) |

## Background job

Hourly cron runs `expireOldBranchInvitations()` to set `status = expired` where `expires_at < NOW()` and `status = pending`.

## Email

Email delivery is **not** implemented. All invites must be shared manually via the copyable link.
