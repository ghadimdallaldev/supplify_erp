# Custom domains (Platinum white-label)

Platinum suppliers (`custom_branding: white_label_domain`) can map a **verified custom hostname** to their public catalog.

## Product flow

1. Supplier sets hostname in **Settings → Branding → Custom catalog domain**.
2. DNS: add **TXT** `_supplify.<hostname>` = verification token **or** **CNAME** `<hostname>` → `CUSTOM_DOMAIN_CNAME_TARGET`.
3. Click **Verify DNS** — API checks records and marks domain active.
4. Visitors open `https://<hostname>/` — web SPA resolves host via `GET /api/public/resolve-host?host=` and renders the supplier catalog (no Supplify guest-access chrome).

## Environment

| Variable                      | Purpose                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `CUSTOM_DOMAIN_CNAME_TARGET`  | CNAME target tenants point at (default `cname.supplify.app`)                 |
| `CUSTOM_DOMAIN_PLATFORM_HOST` | Platform hostname tenants cannot claim (defaults from `PUBLIC_FRONTEND_URL`) |

## TLS / infrastructure

Railway/nginx accepts any `Host` header (`server_name _`). **Per-tenant TLS** requires one of:

- **Recommended:** [Cloudflare for SaaS](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/) — customer CNAME to fallback origin, automatic certs.
- **Alternative:** Register each hostname on the web service (Railway custom domains) — operational overhead; only for low volume.

Document your chosen approach in deployment runbooks before marketing custom domains.

## Database

Migration `0185_tenant_custom_domain.sql` — table `tenant_custom_domain` (one row per tenant).
