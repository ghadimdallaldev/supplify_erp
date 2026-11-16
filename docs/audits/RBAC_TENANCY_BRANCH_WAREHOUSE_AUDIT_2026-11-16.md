# RBAC, tenancy, branch and warehouse audit — 2026-11-16

Status: implementation in progress. This document is an evidence ledger, not a security certification.

## Boundaries and decisions

- Audit branches in ERP, Android and iOS: `audit/rbac-tenancy-2026-11-16`.
- Pre-existing changes preserved locally under `output/rbac-audit-2026-11-16/baseline`.
- No production deployment, mutation, snapshot copy or remote build is authorized by this audit.
- Organization branch accounts, linked legacy tenant accounts and restaurant delivery locations remain distinct.
- Preserve one active business workspace per user and existing one-warehouse order routing.
- Preserve existing staff access as explicit grants. New warehouse staff require assignments.
- Stock-bearing warehouse deactivation requires an explicit destination and confirmation.

## Audit matrix

| ID       | Component                                  | Expected behavior                                | Current implementation / evidence                                                     | Risk / root cause                                                    | Severity | Required repair                                                            | Regression / result                                            |
| -------- | ------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------- | -------------------------------------------------------------- |
| AUTH-01  | Identity, tenant and permission resolution | Next request observes revocation                 | Identity 300s, tenant 180s, role 180s, permission/context 120s caches                 | Invalidation failure or replica memory fallback can retain access    | High     | Authoritative reads with request-local memoization                         | Baseline four suites / 46 tests passed; new regression pending |
| AUTH-02  | Workspace membership                       | Revoked membership cannot use retained role rows | Tenant switch accepts role rows before workspace membership                           | Revocation can be bypassed by stale grants                           | High     | Deny revoked/foreign workspace before evaluating grants                    | Pending                                                        |
| WH-01    | Warehouse lifecycle                        | Atomic transfer and deactivation                 | PATCH/DELETE check dependencies outside transaction; choose destination automatically | Concurrent reservation and repeated transfer can corrupt stock       | High     | Shared locked lifecycle service; explicit destination                      | Pending PostgreSQL reproduction                                |
| BR-01    | Branch lifecycle                           | Dependency check and mutation atomic             | Deactivation helpers query blockers before independent UPDATE                         | Concurrent operational write can enter deactivated branch            | High     | Shared transaction/locking protocol                                        | Pending                                                        |
| SCOPE-01 | Warehouse staff                            | Assigned warehouse scope restricts permissions   | Roles exist; no user-to-warehouse scope model found                                   | Tenant-wide access cannot represent assigned-only access             | High     | Extend existing RBAC with explicit resource scopes and compatible backfill | Pending                                                        |
| DATA-01  | Warehouse ownership                        | Owner columns and product ownership agree        | `tenant_id` preferred by helpers; independent foreign keys only                       | Contradictory owners and cross-supplier stock rows are representable | High     | Diagnostics, safe constraints and deterministic repairs                    | Pending                                                        |
| DOC-01   | Fulfillment documentation                  | Documentation matches runtime                    | Docs describe per-item split; runtime selects one warehouse per basket                | Incorrect operational guidance                                       | Medium   | Correct current docs and diagrams                                          | Pending                                                        |

## Work checklist

- [x] Read brief, instructions, architecture, relevant migrations and existing tests.
- [x] Inspect local infrastructure metadata: PostgreSQL 16, Redis 7, Keycloak 24 available.
- [x] Preserve working trees and create audit branches.
- [ ] Inventory all relevant runtime surfaces and role policies.
- [ ] Reproduce and repair authorization defects.
- [ ] Implement warehouse resource scopes and migration.
- [ ] Repair branch and warehouse lifecycle concurrency.
- [ ] Verify stock lifecycle and ownership with real PostgreSQL.
- [ ] Verify jobs, sockets, notifications, reports and Assistant tools.
- [ ] Update web, Android and iOS contracts and behavior.
- [ ] Run full verification and repeat audit.

## Evidence

Pre-implementation baseline: `tenant-switch`, `branch-lifecycle-guards`, `warehouseInventory`, `warehouseRouting`: 4 files / 46 tests passed. These mock SQL and do not establish database/concurrency correctness.
