# Folder structure

```
Supplify Core/
├── apps/
│   ├── api/
│   │   ├── db/migrations/     # SQL migrations (subscription, usage_meter, audit_logs, system_event, etc.)
│   │   ├── src/
│   │   │   ├── config/
│   │   │   ├── lib/          # auth, db, subscription, plan-enforcement, audit, systemEvent
│   │   │   ├── middlewares/  # requestContext, impersonationContext, errorHandler
│   │   │   ├── lib/          # impersonation.js, impersonation-guards.js, rbac.js (getRequestTenant)
│   │   │   ├── routes/       # admin-dashboard, subscriptions, orders, chat, public, etc.
│   │   │   ├── services/
│   │   │   └── server.js
│   │   └── package.json
│   └── web/
│       ├── src/
│       │   ├── components/   # UpgradeModal, LimitExceededBanner, FeatureLockedCard, SubscriptionInfo
│       │   ├── features/     # auth, cart, monetization
│       │   ├── hooks/
│       │   ├── pages/
│       │   ├── services/     # api.ts (RTK Query)
│       │   ├── store/
│       │   └── App.tsx
│       └── package.json
├── docs/
│   ├── blueprint/            # This folder
│   ├── ADMIN.md
│   ├── FEATURE_CATALOG.md
│   ├── HARDENING.md
│   ├── MONETIZATION_UX.md
│   ├── OBSERVABILITY.md
│   └── PERFORMANCE.md
└── infra/                    # CDK (VPC, ECS, RDS, etc.)
```
