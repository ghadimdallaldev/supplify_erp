# Mobile screen inventory — 2026-11-15

The pre-transformation baseline contains **79 screen files**. Several
files export multiple routed screens. Shared sheets, layout and controls are
tracked in the implementation record. Both native source trees are verified by
the ERP parity script; native iOS rendering remains deferred.

Every listed screen now consumes the migrated presentation or delegates to a
migrated screen. The rendered test matrix exercises registered routes, including
English role flows and Arabic tablet layouts. Fixture-backed rendering is not
evidence of live business transactions or physical-device accessibility.

| Baseline source                                                        | Presentation           |
| ---------------------------------------------------------------------- | ---------------------- |
| `features/assistant/screens/AssistantScreen.tsx`                       | Migrated shared system |
| `features/chat/screens/ChatListScreen.tsx`                             | Migrated shared system |
| `features/chat/screens/ChatThreadScreen.tsx`                           | Migrated shared system |
| `features/disputes/DisputeDetailScreen.tsx`                            | Migrated shared system |
| `features/driver/screens/DeliveryProofScreen.tsx`                      | Migrated shared system |
| `features/driver/screens/DriverHomeScreen.tsx`                         | Migrated shared system |
| `features/driver/screens/DriverMoreScreen.tsx`                         | Migrated shared system |
| `features/driver/screens/DriverRunSheetScreen.tsx`                     | Migrated shared system |
| `features/driver/screens/DriverStopScreen.tsx`                         | Migrated shared system |
| `features/driver/screens/ProblemReportScreen.tsx`                      | Migrated shared system |
| `features/publicShop/BrowseScreens.tsx`                                | Migrated shared system |
| `features/publicShop/CheckoutScreens.tsx`                              | Migrated shared system |
| `features/publicShop/ConsumerScreens.tsx`                              | Migrated shared system |
| `features/publicShop/SupplierPublicSalesScreen.tsx`                    | Migrated shared system |
| `features/restaurant/screens/CartScreen.tsx`                           | Migrated shared system |
| `features/restaurant/screens/CatalogScreen.tsx`                        | Migrated shared system |
| `features/restaurant/screens/ConsumerLoyaltyScreen.tsx`                | Migrated shared system |
| `features/restaurant/screens/ConsumerMenuScreen.tsx`                   | Migrated shared system |
| `features/restaurant/screens/ConsumerOrdersScreen.tsx`                 | Migrated shared system |
| `features/restaurant/screens/CreateDisputeScreen.tsx`                  | Migrated shared system |
| `features/restaurant/screens/CreateQuoteRequestScreen.tsx`             | Migrated shared system |
| `features/restaurant/screens/DealsScreen.tsx`                          | Migrated shared system |
| `features/restaurant/screens/DeliveryLocationScreen.tsx`               | Migrated shared system |
| `features/restaurant/screens/DisputesScreen.tsx`                       | Migrated shared system |
| `features/restaurant/screens/InventoryScreen.tsx`                      | Migrated shared system |
| `features/restaurant/screens/InvoicesScreen.tsx`                       | Migrated shared system |
| `features/restaurant/screens/InvoiceStatementScreen.tsx`               | Migrated shared system |
| `features/restaurant/screens/MyPricesScreen.tsx`                       | Migrated shared system |
| `features/restaurant/screens/NotificationsScreen.tsx`                  | Migrated shared system |
| `features/restaurant/screens/OrderDetailScreen.tsx`                    | Migrated shared system |
| `features/restaurant/screens/OrdersScreen.tsx`                         | Migrated shared system |
| `features/restaurant/screens/QuickListsScreen.tsx`                     | Migrated shared system |
| `features/restaurant/screens/QuoteRequestDetailScreen.tsx`             | Migrated shared system |
| `features/restaurant/screens/QuoteRequestsScreen.tsx`                  | Migrated shared system |
| `features/restaurant/screens/ReceiveOrderScreen.tsx`                   | Migrated shared system |
| `features/restaurant/screens/ReceivingHubScreen.tsx`                   | Migrated shared system |
| `features/restaurant/screens/RecipeCostingScreen.tsx`                  | Migrated shared system |
| `features/restaurant/screens/RecipesScreen.tsx`                        | Migrated shared system |
| `features/restaurant/screens/reservations/CreateReservationScreen.tsx` | Migrated shared system |
| `features/restaurant/screens/reservations/ReservationsScreen.tsx`      | Shared screen alias    |
| `features/restaurant/screens/RestaurantDashboardScreen.tsx`            | Migrated shared system |
| `features/restaurant/screens/StaffScreen.tsx`                          | Migrated shared system |
| `features/restaurant/screens/SuppliersScreen.tsx`                      | Migrated shared system |
| `features/settings/DeleteAccountScreen.tsx`                            | Migrated shared system |
| `features/settings/MoreGroupScreen.tsx`                                | Migrated shared system |
| `features/settings/NotificationPreferencesScreen.tsx`                  | Migrated shared system |
| `features/settings/SettingsScreen.tsx`                                 | Migrated shared system |
| `features/settings/SubscriptionScreen.tsx`                             | Migrated shared system |
| `features/shared/screens/ReportsScreen.tsx`                            | Migrated shared system |
| `features/supplier/screens/ActiveDeliveriesMapScreen.tsx`              | Migrated shared system |
| `features/supplier/screens/ActiveDeliveriesMapScreen.web.tsx`          | Migrated shared system |
| `features/supplier/screens/ContractPricingScreen.tsx`                  | Migrated shared system |
| `features/supplier/screens/CreateDealScreen.tsx`                       | Migrated shared system |
| `features/supplier/screens/CustomerGrowthScreen.tsx`                   | Migrated shared system |
| `features/supplier/screens/CustomersScreen.tsx`                        | Migrated shared system |
| `features/supplier/screens/DealAnalyticsScreen.tsx`                    | Migrated shared system |
| `features/supplier/screens/FeaturedPlacementScreen.tsx`                | Migrated shared system |
| `features/supplier/screens/FulfillmentScreen.tsx`                      | Migrated shared system |
| `features/supplier/screens/IncomingDisputesScreen.tsx`                 | Migrated shared system |
| `features/supplier/screens/PickListsScreen.tsx`                        | Migrated shared system |
| `features/supplier/screens/QuoteInboxScreen.tsx`                       | Migrated shared system |
| `features/supplier/screens/ReceivablesScreen.tsx`                      | Migrated shared system |
| `features/supplier/screens/RunSheetScreen.tsx`                         | Migrated shared system |
| `features/supplier/screens/SupplierDashboardScreen.tsx`                | Migrated shared system |
| `features/supplier/screens/SupplierDriversScreen.tsx`                  | Migrated shared system |
| `features/supplier/screens/SupplierInventoryScreen.tsx`                | Migrated shared system |
| `features/supplier/screens/SupplierLoyaltyScreen.tsx`                  | Migrated shared system |
| `features/supplier/screens/SupplierNotificationsScreen.tsx`            | Shared screen alias    |
| `features/supplier/screens/SupplierOrderDetailScreen.tsx`              | Migrated shared system |
| `features/supplier/screens/SupplierOrdersScreen.tsx`                   | Migrated shared system |
| `features/supplier/screens/SupplierProductsScreen.tsx`                 | Migrated shared system |
| `features/supplier/screens/SupplierPromotionsScreen.tsx`               | Migrated shared system |
| `features/supplier/screens/SupplierQuoteResponseScreen.tsx`            | Migrated shared system |
| `features/supplier/screens/SupplierWarehousesScreen.tsx`               | Migrated shared system |
| `screens/AdminHomeScreen.tsx`                                          | Migrated shared system |
| `screens/BillingLockedScreen.tsx`                                      | Migrated shared system |
| `screens/DeferredScreen.tsx`                                           | Migrated shared system |
| `screens/LoginScreen.tsx`                                              | Shared screen alias    |
| `screens/PendingScreen.tsx`                                            | Migrated shared system |

The new sign-in experience and reservation board replace their former implementations through compatible exports. Order/conversation detail components are reused in wide layouts; domain clients and canonical route parameters remain intact.
