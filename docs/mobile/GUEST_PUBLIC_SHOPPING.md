# Guest and personal-consumer supplier shopping

Android (`C:/myProjects/supplify-mobile`) and iOS
(`C:/myProjects/supplify-mobile-ios`) implement supplier public shopping through the
same native `src/features/publicShop` module. The module calls the public-sales API;
pricing, quantity rules, stock, delivery zones, fees, payment compatibility, and
placement remain authoritative on the server.

## Navigation and identity

- Logged-out users enter `PublicShopNavigator`, with supplier discovery, storefront,
  cart, checkout, receipt/tracking, Sign In, and Create Account routes.
- A signed-in `CONSUMER` enters `ConsumerNavigator`, with Discover, Orders,
  Notifications, and Account tabs. The storefront, cart, preview, and checkout screens
  are shared with the guest navigator.
- Restaurant and supplier users keep their existing navigators and B2B carts.
- Pending registration, billing lock, and deferred auth screens remain part of the
  existing root auth flow.

Consumer registration uses Keycloak and `POST /api/register/complete` with role
`CONSUMER`. It creates no tenant, branch, warehouse, workspace, or subscription.

## Guest API and local data

Public discovery, catalog, preview, guest placement, and token tracking calls use the
API client's `auth: false` option. A public 401 must not trigger token refresh, session
clearing, or logout behavior.

The storefront cart is separate from the restaurant B2B cart and is keyed by the
underlying supplier tenant. A location change that would mix supplier tenants requires
the user to clear the current cart. Client quantity helpers provide immediate guidance,
but preview and placement repeat every rule server-side.

One idempotency key is generated for each checkout payload. It is retained through a
timeout or retry and cleared only after a definitive response or a material checkout
change. After successful guest placement, SecureStore retains only the returned raw
tracking token and minimal receipt metadata. Contact and address form values are not
persisted after success.

## App links

The native scheme handles `supplify://shop`, supplier storefronts, consumer order
details, and guest tracking destinations. The public HTTPS storefront remains the
fallback when an app is not installed.

Before release, publish and validate:

- Apple `apple-app-site-association` for `app.supplifyerp.com`, matching the iOS
  associated-domain entitlement and storefront/tracking paths.
- Android `/.well-known/assetlinks.json` with the production application ID and signing
  certificate fingerprints, matching the intent filters in `app.json`.

No new application environment variable is required. Keycloak must include the
`consumer` realm role for each environment and the mobile client must retain the
existing PKCE configuration.

## Release validation

Automated tests cover public-call auth isolation, cart isolation, role navigation,
notification routing, and type safety in both repositories. Release testing must still
verify universal links/app links, share sheets, location permission behavior,
SecureStore restoration, offline retry, and notification opens on physical Android and
iOS devices.
