# HORECA demo cheat sheet (Beirut, November 2026)

Web: https://app-dev.supplifyerp.com
Android APK (same dev backend): https://expo.dev/artifacts/eas/zDeHqxlWK-BfwaEIx0g8n9iU4gTpWb7TdSqNju2EXAw.apk
API: https://api-dev.supplifyerp.com

All demo businesses are fictional. Every account below uses the password `Supplify1!` and was verified with a real Keycloak token against the dev API (`/auth/me` resolves the tenant and role).

> For the demo, the email one-time-code step is disabled on the dev Keycloak realm, because demo mailboxes do not exist. Login is email and password only. Restore the step after the demo. Signing in to the three or four accounts you need beforehand, in separate browser profiles or private windows, keeps the stage flow fast.

## The data in one minute

- 7 demo suppliers, 10 demo restaurants (4 of them branches of Riviera Hotels Group), about 300 products with real photos, and 47 demo logins.
- About 650 orders over the last 90 days across all 12 statuses, 430 invoices (ISSUED, PARTIALLY_PAID, PAID, OVERDUE, VOID), payments, credit notes, disputes, receiving reports, proof of delivery, reviews, loyalty points, chat and notifications.
- Cedar Fresh Produce is the fully polished main story. Every other supplier has the same Command Center inputs.

## Logins

### Main story

| Role                   | Email                            | Tenant                                               | What to show                                                                                                |
| ---------------------- | -------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Supplier owner         | karim.saab@cedarfresh.demo       | Cedar Fresh Produce (Supplier Scale)                 | Command Center, catalog with photos, promotions (HORECA10 coupon, boosted deal), loyalty, receivables aging |
| Supplier manager       | maya.nassar@cedarfresh.demo      | Cedar Fresh Produce                                  | Orders, order amendments, chat with Riviera                                                                 |
| Warehouse manager      | omar.khalil@cedarfresh.demo      | Cedar Fresh Produce                                  | Two warehouses (Beirut Central Market Hub, Bekaa Cold Storage), stock, low-stock alerts                     |
| Order fulfillment      | layla.haddad@cedarfresh.demo     | Cedar Fresh Produce                                  | Pick, pack, driver assignment, routes                                                                       |
| Accountant             | hiba.daher@cedarfresh.demo       | Cedar Fresh Produce                                  | Invoices, payments, credit notes, AR aging                                                                  |
| Promotions manager     | nadine.fares@cedarfresh.demo     | Cedar Fresh Produce                                  | Deals, boosts, the deal waiting for admin approval                                                          |
| Catalog manager        | jad.salameh@cedarfresh.demo      | Cedar Fresh Produce                                  | Products, prices, images                                                                                    |
| Driver                 | fadi.rizk@cedarfresh.demo        | Cedar Fresh Produce (mobile app)                     | Active route, live GPS, proof of delivery                                                                   |
| Driver                 | tarek.mansour@cedarfresh.demo    | Cedar Fresh Produce (mobile app)                     | Second driver with an active route                                                                          |
| Restaurant group owner | rami.haddad@rivierahotels.demo   | Riviera Beirut Hotel + 3 branches (Restaurant Scale) | Order flow, branch switcher, live driver tracking, contract prices, quick lists                             |
| Restaurant manager     | nour.khoury@rivierahotels.demo   | Riviera (Org Manager)                                | All branches, approvals, inventory                                                                          |
| Purchaser              | elie.abboud@rivierahotels.demo   | Riviera Beirut Hotel                                 | Placing orders, quotes, quick lists                                                                         |
| Receiving              | sara.younes@rivierahotels.demo   | Riviera Beirut Hotel                                 | Receiving reports, short receipt, dispute                                                                   |
| Accountant             | george.matar@rivierahotels.demo  | Riviera Beirut Hotel                                 | Invoices to pay, statements, credit note                                                                    |
| Viewer                 | dina.khalifeh@rivierahotels.demo | Riviera Beirut Hotel                                 | Read-only role                                                                                              |
| FOH staff              | maher.issa@rivierahotels.demo    | Riviera Beirut Hotel                                 | Limited front-of-house permissions                                                                          |
| Branch owner (Jounieh) | joumana.azar@rivierahotels.demo  | Riviera Jounieh Resort                               | Branch account                                                                                              |
| Branch owner (Byblos)  | hadi.sleiman@rivierahotels.demo  | Riviera Byblos Boutique Hotel                        | Branch account                                                                                              |
| Branch owner (Batroun) | rita.chami@rivierahotels.demo    | Riviera Batroun Beach Club                           | Branch account                                                                                              |
| Restaurant owner       | karl.daou@hamrabistro.demo       | Hamra Bistro (Restaurant Intelligence)               | Second customer of Cedar Fresh, contract prices, public shop and menu                                       |
| Restaurant manager     | nadia.hakim@hamrabistro.demo     | Hamra Bistro                                         | Staff portal, scheduling                                                                                    |
| Accountant             | yara.sabbagh@hamrabistro.demo    | Hamra Bistro                                         | Invoices and payments                                                                                       |
| Platform admin         | admin@horeca-demo.supplify.demo  | Supplify platform                                    | Admin dashboard, activity feed, audit log, deal approval queue, impersonation                               |

### Other suppliers (owner plus team)

| Supplier                      | Plan                   | Owner                                  | Team                                                                                                                       |
| ----------------------------- | ---------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Bekaa Valley Dairy Co.        | Growth                 | rola.geagea@bekaadairy.demo            | charbel.moussa (manager), zeina.tannous (accountant), georges.abinader (driver), all @bekaadairy.demo                      |
| Phoenicia Seafood Traders     | Scale                  | elie.barakat@phoeniciaseafood.demo     | sandra.aoun (accountant), mazen.zogheib (driver), all @phoeniciaseafood.demo                                               |
| Mount Lebanon Meats           | Growth                 | antoine.chidiac@mountlebanonmeats.demo | rima.hobeika (accountant), walid.boukhalil (driver), all @mountlebanonmeats.demo                                           |
| Levant Dry Goods              | Scale                  | samir.jabbour@levantdrygoods.demo      | carla.sfeir (manager), bassam.hamdan (warehouse), lina.gemayel (accountant), ziad.karam (driver), all @levantdrygoods.demo |
| Beirut Beverage Distribution  | Growth                 | hussein.zein@beirutbeverage.demo       | tamara.bitar (accountant), ali.fakhoury (driver), all @beirutbeverage.demo                                                 |
| Coastline Packaging & Hygiene | Free (near its limits) | joelle.maalouf@coastlinepack.demo      | owner only; 4 of 5 drivers and 8 of 10 promotions used, good for upgrade prompts                                           |

### Other restaurants (owners)

| Restaurant          | Plan         | Owner                               |
| ------------------- | ------------ | ----------------------------------- |
| Byblos Fish House   | Growth       | pierre.eid@byblosfishhouse.demo     |
| Zaatar & Co. Bakery | Intelligence | maria.tabet@zaatarcobakery.demo     |
| Gemmayze Kitchen    | Growth       | ghassan.nakhle@gemmayzekitchen.demo |
| Mar Mikhael Cafe    | Free         | tala.dagher@marmikhaelcafe.demo     |
| Jounieh Grill House | Growth       | anwar.bechara@jouniehgrill.demo     |

## Ten-minute demo path

1. **Restaurant, minutes 0 to 3 (rami.haddad).** Dashboard. Open Orders: show every status, then the order that is out for delivery and open live tracking (Fadi Rizk, route, ETA). Open Catalog and place an order from Cedar Fresh Produce: contract prices appear and coupon HORECA10 applies. Show Quick Lists (Weekly Produce Run is scheduled).
2. **Receiving and disputes, minute 3 to 4 (sara.younes).** Receiving report with a short receipt, then the open dispute (short and damaged pallet). Mention the resolved dispute that produced a credit note.
3. **Supplier, minutes 4 to 7 (karim.saab).** Command Center: orders to prepare today, deliveries and live GPS, low stock, open dispute, receivables with 30/60/90 aging, customers due to reorder, boosted deal results. Then Orders (acknowledge a PLACED order, show the pending amendment), Warehouses (two locations), Promotions (HORECA10, boosted deal) and Loyalty.
4. **Driver, minute 7 to 8 (fadi.rizk on the Android app).** Active route, navigation, mark delivered with proof of delivery.
5. **Finance, minutes 8 to 9 (hiba.daher or george.matar).** Invoices in every status, partial payment, overdue invoices, credit note applied to an invoice, account statement with aging.
6. **Admin, minutes 9 to 10 (admin@horeca-demo.supplify.demo).** Dashboard totals, activity feed, audit log, the Cedar Fresh deal waiting in the approval queue (approve it live), impersonate Hamra Bistro and show the public shop and menu.

## Morning-of-demo refresh

The Command Center only counts orders placed today and GPS pings from the last few minutes, so refresh the "today" data right before the demo:

```bash
# from apps/api, with DATABASE_URL pointing at the dev database
node scripts/seed-horeca-demo.mjs --allow-host=<db host substring> --only=today
# keep GPS fresh while you present (refreshes every 40 seconds, Ctrl+C to stop)
node scripts/seed-horeca-demo.mjs --allow-host=<db host substring> --only=today --watch
```

This moves 10 in-flight orders per supplier to today (Asia/Beirut), puts the out-for-delivery assignments on today's date and writes fresh GPS pings. It is safe to re-run. The Command Center payload is cached for 45 seconds.

## Re-seeding

`pnpm seed:horeca-demo -- --allow-host=<db host substring>` is additive and idempotent (deterministic ids, `ON CONFLICT DO NOTHING`). It refuses to run unless `--allow-host` matches the `DATABASE_URL` host, and it never touches Keycloak or `app_user.keycloak_sub` unless you pass `--with-keycloak`. Sections: `identity`, `catalog`, `promos`, `commerce`, `engagement`, `extras`, `ops`, `today` (select with `--only=a,b`).
