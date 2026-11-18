import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import ts from 'typescript'

const erpRoot = path.resolve(import.meta.dirname, '../..')
const roots = {
  erp: erpRoot,
  android: 'C:/myProjects/supplify-mobile',
  ios: 'C:/myProjects/supplify-mobile-ios',
}
const definitions = {
  identity: ['routes/auth.routes.js', 'routes/register.routes.js', 'routes/account.routes.js'],
  profile_settings: [
    'routes/suppliers.routes.js',
    'lib/supplier-business-settings.js',
    'lib/supplier-last-order.js',
  ],
  roles_team: ['routes/tenant-roles.routes.js', 'lib/role-matrix.js', 'lib/rbac.js'],
  branches_organizations: [
    'routes/branches.routes.js',
    'routes/org.routes.js',
    'routes/branch-invitations.routes.js',
  ],
  warehouses: ['routes/warehouses.routes.js', 'lib/warehouse-access.js'],
  catalog: [
    'routes/products.routes.js',
    'services/product-import.service.js',
    'services/product-image-import.service.js',
  ],
  pricing: ['routes/prices.routes.js', 'services/resolve-product-price.service.js'],
  orders: [
    'routes/orders.routes.js',
    'routes/orders.calendar.routes.js',
    'services/supplier-order-stock.service.js',
  ],
  inventory: [
    'routes/inventory.routes.js',
    'services/supplier-inventory.service.js',
    'services/supplier-stock.service.js',
  ],
  fulfillment: [
    'routes/fulfillment.routes.js',
    'services/warehouseRouting.js',
    'services/warehouseInventory.js',
  ],
  drivers_delivery: [
    'routes/drivers.routes.js',
    'routes/driver-tracking.routes.js',
    'services/supplier-deliveries.service.js',
  ],
  command_center_run_sheet: [
    'routes/supplier-ops.routes.js',
    'services/supplier-command-center.service.js',
    'services/supplier-run-sheet.service.js',
  ],
  invoices_payments: [
    'routes/invoices.routes.js',
    'routes/payments.routes.js',
    'routes/credit-notes.routes.js',
  ],
  receivables_collections_exports: [
    'services/supplier-receivables.service.js',
    'services/supplier-accounting-export.service.js',
    'services/collections-reminders.service.js',
  ],
  customers_growth: [
    'routes/restaurants.routes.js',
    'routes/supplier-growth.routes.js',
    'services/supplier-customer-import.service.js',
  ],
  quote_requests: ['routes/quote-requests.routes.js', 'lib/ensure-quote-request-schema.js'],
  disputes_returns: ['routes/disputes.routes.js'],
  promotions_boosts: [
    'routes/promotions.routes.js',
    'services/featured-supplier-placement.service.js',
  ],
  loyalty: ['routes/loyalty.routes.js', 'services/loyalty.service.js'],
  supplier_reviews: ['routes/reviews.routes.js'],
  public_sales: [
    'routes/supplier-public-sales.routes.js',
    'routes/public-sales.routes.js',
    'services/public-supplier-catalog.service.js',
  ],
  reports_analytics: ['routes/reports.routes.js'],
  chat: ['routes/chat.routes.js'],
  notifications: [
    'routes/notifications.routes.js',
    'routes/push.routes.js',
    'services/notification.service.js',
  ],
  plans_billing_features: [
    'routes/subscriptions.routes.js',
    'routes/billing.routes.js',
    'lib/feature-keys.js',
  ],
  files_storage: ['routes/files.routes.js'],
  assistant: ['routes/assistant.routes.js'],
  audit_activity: ['routes/tenant-audit.routes.js'],
  realtime: ['lib/socket.js'],
  background_jobs: [],
  web_navigation: [],
  mobile_navigation: [],
}
const seeds = []
function seed(repo, relative, feature) {
  const absolute = path.join(roots[repo], relative)
  if (!fs.existsSync(absolute))
    throw new Error(`Missing inventory entry point: ${repo}:${relative}`)
  seeds.push({ repo, absolute, feature })
}
for (const [feature, files] of Object.entries(definitions)) {
  for (const file of files) seed('erp', `apps/api/src/${file}`, feature)
}
for (const filename of fs.readdirSync(path.join(erpRoot, 'apps/api/src/jobs'))) {
  if (filename.endsWith('.js') && !filename.endsWith('.test.js'))
    seed('erp', `apps/api/src/jobs/${filename}`, 'background_jobs')
}
for (const filename of fs.readdirSync(path.join(erpRoot, 'apps/web/src/pages'))) {
  if (
    /^(Supplier|ProductsPage|ProductDetailPage|OrdersPage|OrderDetailPage|InventoryPage|FulfillmentPage|InvoicesPage|ContractPricingPage|RestaurantsPage|RestaurantDetailPage|ChatPage|SettingsPage|DashboardPage|OrgOverviewPage|BranchDetailPage|DriverDeliveriesPage|PublicSupplierCatalogPage)/.test(
      filename
    ) &&
    filename.endsWith('.tsx') &&
    !filename.includes('.test.')
  ) {
    seed('erp', `apps/web/src/pages/${filename}`, 'web_navigation')
  }
}
for (const relative of [
  'apps/web/src/components/Sidebar.tsx',
  'apps/web/src/components/SupplierMobileNav.tsx',
  'apps/web/src/lib/workspaceRoleProfile/supplier.ts',
])
  seed('erp', relative, 'web_navigation')
for (const directory of ['deals', 'disputes', 'loyalty', 'promotions', 'publicSales', 'reports']) {
  for (const entry of fs.readdirSync(path.join(erpRoot, 'apps/web/src/pages', directory), {
    recursive: true,
  })) {
    if (/\.[jt]sx?$/.test(entry) && !/\.test\./.test(entry))
      seed('erp', `apps/web/src/pages/${directory}/${entry}`, 'web_navigation')
  }
}
for (const repo of ['android', 'ios']) {
  seed(repo, 'src/navigation/SupplierNavigator.tsx', 'mobile_navigation')
  seed(repo, 'src/navigation/DriverNavigator.tsx', 'mobile_navigation')
}

const extensions = ['.js', '.jsx', '.ts', '.tsx', '.json', '.css']
function resolveLocal(repo, absolute, specifier) {
  let target
  if (specifier.startsWith('.')) target = path.resolve(path.dirname(absolute), specifier)
  else if (specifier.startsWith('@/'))
    target = path.join(roots[repo], repo === 'erp' ? 'apps/web/src' : 'src', specifier.slice(2))
  else return null
  if (
    !target.startsWith(`${path.resolve(roots[repo])}${path.sep}`) ||
    target.includes(`${path.sep}node_modules${path.sep}`)
  )
    return null
  const candidates = [
    target,
    ...extensions.map((ext) => target + ext),
    ...extensions.map((ext) => path.join(target, 'index' + ext)),
  ]
  return (
    candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ??
    null
  )
}
const sources = new Map()
const unresolvedImports = []
const dynamicImports = []
const globImports = []
const keyFor = (repo, absolute) =>
  `${repo}:${path.relative(roots[repo], absolute).replaceAll('\\', '/')}`
function readSource(repo, absolute) {
  const key = keyFor(repo, absolute)
  if (sources.has(key)) return sources.get(key)
  const bytes = fs.readFileSync(absolute)
  const content = bytes.toString('utf8')
  const source = {
    key,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    lines: content.split('\n').length,
    features: new Set(),
    dependencies: [],
  }
  sources.set(key, source)
  if (!/\.(?:[cm]?[jt]sx?)$/.test(absolute)) return source
  const parsed = ts.createSourceFile(absolute, content, ts.ScriptTarget.Latest, true)
  const imports = new Set()
  const globs = new Set()
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'glob' &&
      ts.isMetaProperty(node.expression.expression) &&
      node.expression.expression.keywordToken === ts.SyntaxKind.ImportKeyword
    ) {
      if (node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]))
        globs.add(node.arguments[0].text)
      else
        dynamicImports.push({
          source: key,
          kind: 'vite-glob',
          line: parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1,
        })
    }
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    )
      imports.add(node.moduleSpecifier.text)
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    )
      imports.add(node.argument.literal.text)
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      if (node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]))
        imports.add(node.arguments[0].text)
      else
        dynamicImports.push({
          source: key,
          line: parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1,
        })
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  for (const pattern of globs) {
    const matches = fs.globSync(pattern, { cwd: path.dirname(absolute) })
    globImports.push({ source: key, pattern, matches: matches.length })
    for (const match of matches) imports.add(`./${match.replaceAll('\\', '/')}`)
  }
  for (const specifier of imports) {
    if (!specifier.startsWith('.') && !specifier.startsWith('@/')) continue
    const resolved = resolveLocal(repo, absolute, specifier)
    if (!resolved) {
      unresolvedImports.push({ source: key, specifier })
      continue
    }
    if (!extensions.includes(path.extname(resolved))) continue
    source.dependencies.push(keyFor(repo, resolved))
    readSource(repo, resolved)
  }
  return source
}
for (const entry of seeds) readSource(entry.repo, entry.absolute)
function markFeature(key, feature) {
  const node = sources.get(key)
  if (!node || node.features.has(feature)) return
  node.features.add(feature)
  node.dependencies.forEach((dependency) => markFeature(dependency, feature))
}
seeds.forEach((entry) => markFeature(keyFor(entry.repo, entry.absolute), entry.feature))
const files = [...sources.values()]
  .map((source) => ({ ...source, features: [...source.features].sort() }))
  .sort((a, b) => a.key.localeCompare(b.key))
const reviewPath = path.join(erpRoot, 'docs/audits/supplier-full-review-ledger.json')
const reviewLedger = fs.existsSync(reviewPath)
  ? JSON.parse(fs.readFileSync(reviewPath, 'utf8'))
  : { reviews: [] }
const reviews = new Map(reviewLedger.reviews.map((review) => [review.key, review]))
for (const file of files) {
  const review = reviews.get(file.key)
  file.reviewStatus = !review ? 'pending' : review.sha256 === file.sha256 ? review.status : 'stale'
}
const counts = Object.fromEntries(
  Object.keys(roots).map((repo) => [
    repo,
    files.filter((file) => file.key.startsWith(repo + ':')).length,
  ])
)
const manifest = {
  generatedAt: new Date().toISOString(),
  purpose: 'Supplier source inventory. Reachability is not proof of review or verification.',
  scope:
    'Supplier-specific entry points plus shared source dependencies, web screens, mobile navigation and background jobs. Shared barrels conservatively include other-workspace modules.',
  limitations: [
    'Nonliteral dynamic imports/globs and externally wired runtime callbacks need manual discovery.',
    'Assets and third-party dependencies are not audited by this inventory.',
    'Plan, permission, branch, warehouse, locale and runtime matrices require separate execution evidence.',
  ],
  counts,
  sourceReviewCounts: Object.fromEntries(
    ['reviewed', 'partial', 'pending', 'stale'].map((status) => [
      status,
      files.filter((file) => file.reviewStatus === status).length,
    ])
  ),
  totalLines: files.reduce((sum, file) => sum + file.lines, 0),
  features: Object.keys(definitions).map((feature) => ({
    feature,
    entryPoints: seeds
      .filter((seed) => seed.feature === feature)
      .map((seed) => keyFor(seed.repo, seed.absolute)),
    sourceFiles: files.filter((file) => file.features.includes(feature)).length,
    reviewStatus: 'not_exhaustively_reviewed',
  })),
  unresolvedImports,
  dynamicImports,
  globImports,
  files,
}
const destination = path.join(erpRoot, 'docs/audits/supplier-full-source-inventory.json')
fs.writeFileSync(destination, JSON.stringify(manifest, null, 2) + '\n')
console.log(
  JSON.stringify({
    destination,
    counts,
    totalLines: manifest.totalLines,
    features: manifest.features.length,
    unresolvedImports: unresolvedImports.length,
    dynamicImports: dynamicImports.length,
  })
)
