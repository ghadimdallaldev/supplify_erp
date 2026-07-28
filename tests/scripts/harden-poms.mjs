import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'e2e', 'pages')

const simple = [
  ['ReceivingPage.ts', 'receiving-page', '/receiving/i', 'Receiving'],
  ['FulfillmentPage.ts', 'fulfillment-page', '/fulfillment/i', 'Fulfillment'],
  ['InvoicesPage.ts', 'invoices-page', '/invoice/i', 'Invoices'],
  ['ChatPage.ts', 'chat-page', '/chat/i', 'Chat'],
  ['StaffPage.ts', 'staff-page', '/staff/i', 'Staff'],
  ['QuotesPage.ts', 'quote-requests-page', '/quote/i', 'Quotes'],
  ['DealsPage.ts', 'deals-page', '/deal/i', 'Deals'],
  ['PromotionsPage.ts', 'promotions-page', '/promotion/i', 'Promotions'],
  ['ReservationsPage.ts', 'reservations-page', '/reservation/i', 'Reservations'],
  ['DriverDeliveriesPage.ts', 'driver-deliveries-page', '/deliver/i', 'Driver deliveries'],
  ['OrderDetailPage.ts', 'order-detail-page', '/order/i', 'Order detail'],
]

function patchExpectLoaded(source, testId, heading, label) {
  const repl = `async expectLoaded(): Promise<void> {
    await this.expectVisibleByTestIdOrHeading(['${testId}'], ${heading}, '${label}');
  }`
  if (source.includes('expectVisibleByTestIdOrHeading')) return source
  const next = source.replace(/async expectLoaded\(\)[\s\S]*?\n  \}/, repl)
  return next === source ? null : next
}

for (const [file, testId, heading, label] of simple) {
  const p = path.join(dir, file)
  if (!fs.existsSync(p)) {
    console.log('missing', file)
    continue
  }
  const s = fs.readFileSync(p, 'utf8')
  const next = patchExpectLoaded(s, testId, heading, label)
  if (!next) console.log('skip/no-match', file)
  else {
    fs.writeFileSync(p, next)
    console.log('patched', file)
  }
}

const invPath = path.join(dir, 'InventoryPage.ts')
if (fs.existsSync(invPath)) {
  let s = fs.readFileSync(invPath, 'utf8')
  if (!s.includes('expectVisibleByTestIdOrHeading')) {
    s = s.replace(
      /async expectRestaurantLoaded\(\)[\s\S]*?\n  \}/,
      `async expectRestaurantLoaded(): Promise<void> {
    await this.expectVisibleByTestIdOrHeading(['restaurant-inventory-page'], /inventory/i, 'Restaurant inventory');
  }`
    )
    s = s.replace(
      /async expectSupplierLoaded\(\)[\s\S]*?\n  \}/,
      `async expectSupplierLoaded(): Promise<void> {
    await this.expectVisibleByTestIdOrHeading(['inventory-page'], /inventory/i, 'Supplier inventory');
  }`
    )
    s = s.replace(
      /async expectLoaded\(\)[\s\S]*?\n  \}/g,
      `async expectLoaded(): Promise<void> {
    await this.expectVisibleByTestIdOrHeading(
      ['restaurant-inventory-page', 'inventory-page'],
      /inventory/i,
      'Inventory'
    );
  }`
    )
    fs.writeFileSync(invPath, s)
    console.log('patched InventoryPage.ts')
  }
}

const settingsPath = path.join(dir, 'SettingsPage.ts')
if (fs.existsSync(settingsPath)) {
  let s = fs.readFileSync(settingsPath, 'utf8')
  if (!s.includes('expectVisibleByTestIdOrHeading')) {
    s = s.replace(
      /async expect(?:Restaurant|Supplier|Onboarding)?Loaded\(\)[\s\S]*?\n  \}/g,
      (m) => {
        if (m.includes('expectVisibleByTestIdOrHeading')) return m
        if (m.startsWith('async expectOnboarding')) {
          return `async expectOnboardingLoaded(): Promise<void> {
    await this.expectVisibleByTestIdOrHeading(
      ['settings-page', 'restaurant-settings-page'],
      /onboarding|settings|profile/i,
      'Onboarding'
    );
  }`
        }
        if (m.startsWith('async expectSupplier')) {
          return `async expectSupplierLoaded(): Promise<void> {
    await this.expectVisibleByTestIdOrHeading(
      ['supplier-settings-page', 'settings-page'],
      /settings|profile|business/i,
      'Supplier settings'
    );
  }`
        }
        if (m.startsWith('async expectRestaurant')) {
          return `async expectRestaurantLoaded(): Promise<void> {
    await this.expectVisibleByTestIdOrHeading(
      ['restaurant-settings-page', 'settings-page'],
      /settings|profile/i,
      'Restaurant settings'
    );
  }`
        }
        return `async expectLoaded(): Promise<void> {
    await this.expectVisibleByTestIdOrHeading(
      ['settings-page', 'restaurant-settings-page', 'supplier-settings-page'],
      /settings|profile/i,
      'Settings'
    );
  }`
      }
    )
    fs.writeFileSync(settingsPath, s)
    console.log('patched SettingsPage.ts')
  }
}

const contractPath = path.join(dir, 'ContractPricingPage.ts')
if (fs.existsSync(contractPath)) {
  let s = fs.readFileSync(contractPath, 'utf8')
  if (!s.includes('expectVisibleByTestIdOrHeading')) {
    s = s.replace(
      /async expect(?:MyPrices|ContractPricing|Loaded)?\(\)[\s\S]*?\n  \}/g,
      (m) => {
        if (m.includes('MyPrices') || m.includes('my-prices') || m.includes('My prices')) {
          return `async expectMyPricesLoaded(): Promise<void> {
    await this.expectVisibleByTestIdOrHeading(
      ['my-contract-prices-page', 'contract-pricing-page'],
      /price|contract/i,
      'My prices'
    );
  }`
        }
        return `async expectLoaded(): Promise<void> {
    await this.expectVisibleByTestIdOrHeading(
      ['contract-pricing-page', 'my-contract-prices-page'],
      /price|contract/i,
      'Contract pricing'
    );
  }`
      }
    )
    fs.writeFileSync(contractPath, s)
    console.log('patched ContractPricingPage.ts')
  }
}

console.log('done')
