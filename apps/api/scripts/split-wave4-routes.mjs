/**
 * Wave 4: split monolithic route files into sub-routers (no URL changes).
 * Run: node scripts/split-wave4-routes.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROUTES_DIR = path.join(__dirname, '../src/routes')

function readLines(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/)
}

function extractRanges(lines, ranges) {
  const chunks = []
  for (const [start, end] of ranges) {
    chunks.push(...lines.slice(start - 1, end))
  }
  return chunks.join('\n')
}

function findHeaderEnd(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (/^const router = /.test(lines[i])) return i
  }
  throw new Error('Could not find const router =')
}

function findExportLine(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^export /.test(lines[i])) return i
  }
  return lines.length
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content.endsWith('\n') ? content : content + '\n', 'utf8')
}

function postProcessSection(content, config, sectionFile) {
  let out = content

  if (config.outputDir === 'admin-dashboard' && out.includes('logAudit(')) {
    out = out.replace(
      /const router = Router\(\)\n/,
      "import { logAudit } from './audit.helpers.js'\n\nconst router = Router()\n"
    )
  }

  if (config.outputDir === 'staff') {
    out = out.replace(
      /const router = express\.Router\(\)\n/,
      `import {
  resolveRestaurantId,
  mapStaffRow,
  mapShiftRow,
  mapTimeEntryRow,
  mapPtoRow,
  mapSwapRow,
  mapAnnouncementRow,
  mapDocumentRow,
  mapIncidentRow,
  mapPerformanceNoteRow,
  mapPayrollExportRow,
  staffStatusEnum,
  createStaffSchema,
  updateStaffSchema,
  shiftStatusEnum,
  createShiftSchema,
  updateShiftSchema,
  checkInSchema,
  checkOutSchema,
  ptoTypeEnum,
  createPtoSchema,
  updatePtoSchema,
  availabilitySchema,
  createSwapSchema,
  decideSwapSchema,
  createAnnouncementSchema,
  acknowledgeAnnouncementSchema,
  createDocumentSchema,
  createIncidentSchema,
  createPerformanceNoteSchema,
  createPayrollExportSchema,
  updatePayrollExportSchema,
} from './staff.shared.js'

const router = express.Router()
`
    )
  }

  if (config.outputDir === 'orders') {
    const needs = []
    if (/orderListSchema|orderCreateSchema|supplierOrderCreateSchema|orderUpdateSchema|deliveryStatusSchema/.test(out)) {
      needs.push('orderCreateSchema', 'supplierOrderCreateSchema', 'deliveryStatusSchema', 'orderUpdateSchema', 'orderListSchema')
    }
    if (/scheduleOrderStatusNotification|scheduleOrderPlacedNotification/.test(out)) {
      needs.push('scheduleOrderStatusNotification', 'scheduleOrderPlacedNotification')
    }
    if (/createInvoiceFromOrder|handleOrderDelivery/.test(out)) {
      if (/createInvoiceFromOrder/.test(out)) needs.push('createInvoiceFromOrder')
      if (/handleOrderDelivery/.test(out)) needs.push('handleOrderDelivery')
    }
    if (/buildPackingSlipPdf|elapsedMsSince/.test(out)) {
      if (/buildPackingSlipPdf/.test(out)) needs.push('buildPackingSlipPdf')
      if (/elapsedMsSince/.test(out)) needs.push('elapsedMsSince')
    }
    const unique = [...new Set(needs)]
    if (unique.length) {
      out = out.replace(
        /const router = express\.Router\(\)\n/,
        `import { ${unique.join(', ')} } from './orders.helpers.js'\n\nconst router = express.Router()\n`
      )
    }
  }

  if (config.outputDir === 'fulfillment') {
    out = out.replace(
      /const router = express\.Router\(\)\n/,
      `import {
  resolveRouteReorderAccess,
  parseWarehouseFilter,
  warehouseFilterClause,
  mapStopStatus,
  resolveSupplierId,
  loadStopsForRoutes,
} from './fulfillment.helpers.js'

const router = express.Router()
`
    )
  }

  if (config.outputDir === 'suppliers') {
    out = out.replace(
      /const router = express\.Router\(\)\n/,
      `import {
  attachReviewFields,
  supplierCreateSchema,
  supplierUpdateSchema,
  supplierListSchema,
} from './suppliers.helpers.js'

const router = express.Router()
`
    )
  }

  if (config.outputDir === 'promotions') {
    const helperNames = [
      'adminDealGuards',
      'promotionBodySchema',
      'submitDealBodySchema',
      'promoteBodySchema',
      'interactBodySchema',
      'cartPreviewSchema',
      'rejectBodySchema',
      'getSupplierId',
      'getRestaurantId',
      'loadPromotionForSupplier',
      'syncPromotionTargets',
      'syncRestaurantTargets',
      'mapPromotionInsertFields',
      'supplierDealsGate',
      'BOOST_PRICING_WHERE',
      'promotionsAccessGuard',
    ]
    out = out.replace(
      /const router = express\.Router\(\)\n/,
      `import {
  ${helperNames.join(',\n  ')},
} from './promotions.helpers.js'

const router = express.Router()
`
    )
  }

  return out
}

function buildSectionFile(headerLines, bodyLines, config, sectionFile) {
  const header = headerLines
    .filter((l) => !/^const router = /.test(l))
    .join('\n')

  const routerDecl = config.useExpressRouter
    ? "const router = express.Router()\n"
    : "const router = Router()\n"

  let content = `${header}\n\n${routerDecl}\n${bodyLines.join('\n')}\n\nexport default router\n`
  return postProcessSection(content, config, sectionFile)
}

function buildHelperFile(headerLines, bodyLines, exportNames) {
  const header = headerLines.filter((l) => !/^const router = /.test(l)).join('\n')
  const body = bodyLines.join('\n')
  const alreadyExported = new Set(
    [...body.matchAll(/^export (?:async )?(?:function|const|class) (\w+)/gm)].map((m) => m[1])
  )
  const namedExports = exportNames.filter((n) => !alreadyExported.has(n))
  const exportBlock = namedExports.length ? `\nexport { ${namedExports.join(', ')} }\n` : '\n'
  return `${header}\n\n${body}${exportBlock}`
}

function buildIndex(config, sectionFiles, middlewareBody, helperFiles = []) {
  const header = config.headerLines.filter((l) => !/^const router = /.test(l)).join('\n')

  const helperImports = helperFiles
    .map((h) => `import { ${h.exports.join(', ')} } from './${h.file}'`)
    .join('\n')

  const sectionImports = sectionFiles.map((s) => `import ${s.varName} from './${s.file}'`).join('\n')

  const mounts = sectionFiles.map((s) => `router.use(${s.varName})`).join('\n')

  const routerDecl = config.useExpressRouter
    ? 'const router = express.Router()'
    : 'const router = Router()'

  let extraExports = ''
  if (config.namedExport) {
    extraExports = `\nexport { router as ${config.namedExport}${config.extraNamedExports ? ', ' + config.extraNamedExports.join(', ') : ''} }\n`
  } else if (config.extraNamedExports?.length) {
    extraExports = `\nexport { ${config.extraNamedExports.join(', ')} }\n`
  } else {
    extraExports = '\nexport default router\n'
  }

  // Re-export createInvoiceFromOrder from helpers if present
  if (config.reexportFromHelpers?.length) {
    for (const item of config.reexportFromHelpers) {
      extraExports =
        extraExports.trimEnd() +
        `\nexport { ${item.names.join(', ')} } from './${item.file}'\n`
    }
  }

  return `${header}
${helperImports ? helperImports + '\n' : ''}${sectionImports}

${routerDecl}

${middlewareBody}

${mounts}
${extraExports}`
}

function buildReexport(config) {
  const dir = `./${config.outputDir}/index.js`
  if (config.namedExport) {
    let out = `export { ${config.namedExport}`
    if (config.extraNamedExports?.length) {
      out += `, ${config.extraNamedExports.join(', ')}`
    }
    out += ` } from '${dir}'\n`
    if (config.reexportFromHelpers?.length) {
      for (const item of config.reexportFromHelpers) {
        out += `export { ${item.names.join(', ')} } from '${dir}'\n`
      }
    }
    return out
  }
  if (config.exportDefault) {
    return `export { default } from '${dir}'\n`
  }
  return `export * from '${dir}'\n`
}

function splitModule(config) {
  const sourcePath = path.join(ROUTES_DIR, config.sourceFile)
  const lines = readLines(sourcePath)
  const headerEnd = config.headerEndLine ?? findHeaderEnd(lines)
  const exportLine = findExportLine(lines)
  const headerLines = lines.slice(0, headerEnd)
  const middlewareBody = config.middleware
    ? lines.slice(config.middleware.start - 1, config.middleware.end).join('\n')
    : ''

  const outDir = path.join(ROUTES_DIR, config.outputDir)

  // Helpers
  const helperFiles = []
  for (const helper of config.helpers || []) {
    const body = lines.slice(helper.start - 1, helper.end)
    const content = buildHelperFile(headerLines, body, helper.exports)
    writeFile(path.join(outDir, helper.file), content)
    helperFiles.push(helper)
  }

  // Sections
  const sectionFiles = []
  for (const section of config.sections) {
    const body = section.ranges.flatMap(([start, end]) => lines.slice(start - 1, end))
    const content = buildSectionFile(headerLines, body, config, section.file)
    const varName = section.varName || section.file.replace('.js', 'Router')
    writeFile(path.join(outDir, section.file), content)
    sectionFiles.push({ ...section, varName })
  }

  // Index
  const indexContent = buildIndex(
    { ...config, headerLines },
    sectionFiles,
    middlewareBody,
    helperFiles
  )
  writeFile(path.join(outDir, 'index.js'), indexContent)

  // Re-export shim in original file location
  const reexport = buildReexport(config)
  writeFile(sourcePath, reexport)

  console.log(`✓ ${config.sourceFile} → ${config.outputDir}/ (${sectionFiles.length} sections)`)
}

const modules = [
  {
    sourceFile: 'admin-dashboard.routes.js',
    outputDir: 'admin-dashboard',
    exportDefault: true,
    headerEndLine: 76,
    middleware: { start: 78, end: 91 },
    helpers: [{ file: 'audit.helpers.js', start: 96, end: 149, exports: ['logAudit'] }],
    sections: [
      { file: 'overview.js', ranges: [[151, 333], [3668, 3756]] },
      { file: 'plans.js', ranges: [[334, 749]] },
      { file: 'subscriptions.js', ranges: [[750, 1569]] },
      { file: 'audit.js', ranges: [[1570, 2000]] },
      { file: 'tenants.js', ranges: [[2001, 2285]] },
      { file: 'limits.js', ranges: [[2286, 3219]] },
      { file: 'health.js', ranges: [[3220, 3357]] },
      { file: 'finance.js', ranges: [[3358, 3453]] },
      { file: 'features.js', ranges: [[3454, 3667]] },
    ],
  },
  {
    sourceFile: 'staff.routes.js',
    outputDir: 'staff',
    namedExport: 'staffRoutes',
    useExpressRouter: true,
    headerEndLine: 51,
    middleware: { start: 814, end: 821 },
    helpers: [
      {
        file: 'staff.shared.js',
        start: 53,
        end: 511,
        exports: [
          'resolveRestaurantId',
          'mapStaffRow',
          'mapShiftRow',
          'mapTimeEntryRow',
          'mapPtoRow',
          'mapSwapRow',
          'mapAnnouncementRow',
          'mapDocumentRow',
          'mapIncidentRow',
          'mapPerformanceNoteRow',
          'mapPayrollExportRow',
          'staffStatusEnum',
          'createStaffSchema',
          'updateStaffSchema',
          'shiftStatusEnum',
          'createShiftSchema',
          'updateShiftSchema',
          'checkInSchema',
          'checkOutSchema',
          'ptoTypeEnum',
          'createPtoSchema',
          'updatePtoSchema',
          'availabilitySchema',
          'createSwapSchema',
          'decideSwapSchema',
          'createAnnouncementSchema',
          'acknowledgeAnnouncementSchema',
          'createDocumentSchema',
          'createIncidentSchema',
          'createPerformanceNoteSchema',
          'createPayrollExportSchema',
          'updatePayrollExportSchema',
        ],
      },
    ],
    sections: [
      { file: 'portal.js', ranges: [[513, 812]] },
      { file: 'team.js', ranges: [[823, 1064]] },
      { file: 'schedule.js', ranges: [[1065, 1561], [1742, 2120]] },
      { file: 'pto.js', ranges: [[1562, 1741]] },
      { file: 'announcements.js', ranges: [[2122, 2260]] },
      { file: 'documents.js', ranges: [[2261, 2406]] },
      { file: 'reports.js', ranges: [[2407, 2694]] },
    ],
  },
  {
    sourceFile: 'orders.routes.js',
    outputDir: 'orders',
    namedExport: 'ordersRoutes',
    useExpressRouter: true,
    headerEndLine: 56,
    middleware: { start: 60, end: 60 },
    preMiddleware: { start: 141, end: 146 },
    helpers: [
      {
        file: 'orders.helpers.js',
        start: 62,
        end: 657,
        exports: [
          'elapsedMsSince',
          'scheduleOrderStatusNotification',
          'scheduleOrderPlacedNotification',
          'createInvoiceFromOrder',
          'handleOrderDelivery',
          'buildPackingSlipPdf',
          'orderCreateSchema',
          'supplierOrderCreateSchema',
          'deliveryStatusSchema',
          'orderUpdateSchema',
          'orderListSchema',
        ],
      },
    ],
    sections: [
      { file: 'list.js', ranges: [[659, 888]] },
      { file: 'warehouses.js', ranges: [[905, 1038]] },
      { file: 'detail.js', ranges: [[1040, 1233]] },
      { file: 'create.js', ranges: [[1235, 1881]] },
      { file: 'update.js', ranges: [[1883, 2194]] },
      { file: 'documents.js', ranges: [[2196, 2531]] },
    ],
  },
  {
    sourceFile: 'promotions.routes.js',
    outputDir: 'promotions',
    namedExport: 'promotionsRoutes',
    extraNamedExports: ['loadActivePromotionsForSupplier'],
    useExpressRouter: true,
    headerEndLine: 54,
    helpers: [
      {
        file: 'promotions.helpers.js',
        start: 56,
        end: 304,
        exports: [
          'adminDealGuards',
          'promotionBodySchema',
          'submitDealBodySchema',
          'promoteBodySchema',
          'interactBodySchema',
          'cartPreviewSchema',
          'rejectBodySchema',
          'getSupplierId',
          'getRestaurantId',
          'loadPromotionForSupplier',
          'syncPromotionTargets',
          'syncRestaurantTargets',
          'mapPromotionInsertFields',
          'supplierDealsGate',
          'BOOST_PRICING_WHERE',
          'promotionsAccessGuard',
        ],
      },
    ],
    sections: [
      { file: 'restaurant.js', ranges: [[235, 907]] },
      {
        file: 'supplier.js',
        ranges: [[909, 1412]],
      },
    ],
  },
  {
    sourceFile: 'fulfillment.routes.js',
    outputDir: 'fulfillment',
    namedExport: 'fulfillmentRoutes',
    useExpressRouter: true,
    headerEndLine: 40,
    middleware: { start: 97, end: 103 },
    helpers: [
      {
        file: 'fulfillment.helpers.js',
        start: 42,
        end: 206,
        exports: [
          'resolveRouteReorderAccess',
          'fulfillmentFeature',
          'requireFulfillmentAccess',
          'parseWarehouseFilter',
          'warehouseFilterClause',
          'mapStopStatus',
          'resolveSupplierId',
          'loadStopsForRoutes',
        ],
      },
    ],
    sections: [
      { file: 'board.js', ranges: [[208, 696]] },
      { file: 'exceptions.js', ranges: [[697, 839], [1289, 1330]] },
      { file: 'routes.js', ranges: [[840, 1287]] },
    ],
  },
  {
    sourceFile: 'chat.routes.js',
    outputDir: 'chat',
    namedExport: 'chatRoutes',
    useExpressRouter: true,
    headerEndLine: 33,
    sections: [
      { file: 'support.js', ranges: [[35, 39], [42, 168]] },
      { file: 'admin.js', ranges: [[107, 114], [116, 354]] },
      { file: 'conversations.js', ranges: [[356, 1305]] },
    ],
  },
  {
    sourceFile: 'suppliers.routes.js',
    outputDir: 'suppliers',
    namedExport: 'suppliersRoutes',
    useExpressRouter: true,
    headerEndLine: 45,
    helpers: [
      {
        file: 'suppliers.helpers.js',
        start: 47,
        end: 104,
        exports: ['attachReviewFields', 'supplierCreateSchema', 'supplierUpdateSchema', 'supplierListSchema'],
      },
    ],
    sections: [
      { file: 'catalog.js', ranges: [[106, 316]] },
      { file: 'profile.js', ranges: [[317, 790]] },
      { file: 'admin.js', ranges: [[791, 853]] },
      { file: 'branding.js', ranges: [[854, 948]] },
      { file: 'manage.js', ranges: [[949, 1075]] },
      { file: 'relationships.js', ranges: [[1076, 1380]] },
    ],
  },
]

// Custom split for orders (driver routes + amendments + middleware ordering)
function splitOrdersModule(config) {
  const sourcePath = path.join(ROUTES_DIR, config.sourceFile)
  const lines = readLines(sourcePath)
  const headerEnd = config.headerEndLine
  const headerLines = lines.slice(0, headerEnd)
  const outDir = path.join(ROUTES_DIR, config.outputDir)

  for (const helper of config.helpers) {
    const body = lines.slice(helper.start - 1, helper.end)
    writeFile(path.join(outDir, helper.file), buildHelperFile(headerLines, body, helper.exports))
  }

  for (const section of config.sections) {
    const body = section.ranges.flatMap(([start, end]) => lines.slice(start - 1, end))
    writeFile(
      path.join(outDir, section.file),
      buildSectionFile(headerLines, body, config, section.file)
    )
  }

  const header = headerLines.join('\n')
  const sectionImports = config.sections
    .map((s) => `import ${s.file.replace('.js', 'Router')} from './${s.file}'`)
    .join('\n')
  const mounts = config.sections
    .map((s) => `router.use(${s.file.replace('.js', 'Router')})`)
    .join('\n')

  const indexContent = `${header}
${sectionImports}

const router = express.Router()

// Driver fulfillment routes use DRIVER_DELIVERIES_* permissions, not ORDERS_VIEW.
router.use(ordersDriverRoutes)

router.use(
  requireAuth,
  resolveTenantContext,
  requirePermission('ORDERS_VIEW'),
  ordersRouterMutationGuard
)

${mounts}

export { router as ordersRoutes }
export { createInvoiceFromOrder } from './orders.helpers.js'
`

  writeFile(path.join(outDir, 'index.js'), indexContent)
  writeFile(sourcePath, buildReexport(config))
  console.log(`✓ ${config.sourceFile} → ${config.outputDir}/ (${config.sections.length} sections)`)
}

// Custom split for staff (portal before middleware, shared imports)
function splitStaffModule(config) {
  const sourcePath = path.join(ROUTES_DIR, config.sourceFile)
  const lines = readLines(sourcePath)
  const headerLines = lines.slice(0, config.headerEndLine - 1)
  const outDir = path.join(ROUTES_DIR, config.outputDir)

  const helper = config.helpers[0]
  const helperBody = lines.slice(helper.start - 1, helper.end)
  writeFile(path.join(outDir, helper.file), buildHelperFile(headerLines, helperBody, helper.exports))

  for (const section of config.sections) {
    const body = section.ranges.flatMap(([start, end]) => lines.slice(start - 1, end))
    writeFile(
      path.join(outDir, section.file),
      buildSectionFile(headerLines, body, config, section.file)
    )
  }

  const header = headerLines.join('\n')
  const sectionImports = config.sections
    .map((s) => `import ${s.file.replace('.js', 'Router')} from './${s.file}'`)
    .join('\n')

  const portalFirst = 'router.use(portalRouter)'
  const middleware = lines.slice(config.middleware.start - 1, config.middleware.end).join('\n')
  const otherMounts = config.sections
    .filter((s) => s.file !== 'portal.js')
    .map((s) => `router.use(${s.file.replace('.js', 'Router')})`)
    .join('\n')

  const indexContent = `${header}
${sectionImports}

const router = express.Router()

${portalFirst}

${middleware}

${otherMounts}

export { router as staffRoutes }
`

  writeFile(path.join(outDir, 'index.js'), indexContent)
  writeFile(sourcePath, buildReexport(config))
  console.log(`✓ ${config.sourceFile} → ${config.outputDir}/ (${config.sections.length} sections)`)
}

// Custom chat split with middleware in conversations
function splitChatModule(config) {
  const sourcePath = path.join(ROUTES_DIR, config.sourceFile)
  const lines = readLines(sourcePath)
  const headerLines = lines.slice(0, config.headerEndLine)
  const outDir = path.join(ROUTES_DIR, config.outputDir)

  for (const section of config.sections) {
    const body = section.ranges.flatMap(([start, end]) => lines.slice(start - 1, end))
    writeFile(
      path.join(outDir, section.file),
      buildSectionFile(headerLines, body, config, section.file)
    )
  }

  const header = headerLines.join('\n')
  const indexContent = `${header}
import supportRouter from './support.js'
import adminRouter from './admin.js'
import conversationsRouter from './conversations.js'

const router = express.Router()

router.use(supportRouter)
router.use(adminRouter)
router.use(conversationsRouter)

export { router as chatRoutes }
`

  writeFile(path.join(outDir, 'index.js'), indexContent)
  writeFile(sourcePath, buildReexport(config))
  console.log(`✓ ${config.sourceFile} → ${config.outputDir}/ (${config.sections.length} sections)`)
}

// Custom promotions with supplier middleware block inside supplier.js
function splitPromotionsModule(config) {
  const sourcePath = path.join(ROUTES_DIR, config.sourceFile)
  const lines = readLines(sourcePath)
  const headerLines = lines.slice(0, config.headerEndLine)
  const outDir = path.join(ROUTES_DIR, config.outputDir)

  const helper = config.helpers[0]
  writeFile(
    path.join(outDir, helper.file),
    buildHelperFile(headerLines, lines.slice(helper.start - 1, helper.end), helper.exports)
  )

  for (const section of config.sections) {
    const body = section.ranges.flatMap(([start, end]) => lines.slice(start - 1, end))
    writeFile(
      path.join(outDir, section.file),
      buildSectionFile(headerLines, body, config, section.file)
    )
  }

  const header = headerLines.join('\n')
  const indexContent = `${header}
import {
  adminDealGuards,
  supplierDealsGate,
  promotionsAccessGuard,
} from './promotions.helpers.js'
import restaurantRouter from './restaurant.js'
import supplierRouter from './supplier.js'

const router = express.Router()

router.use(restaurantRouter)
router.use(supplierRouter)

export { router as promotionsRoutes }
export { loadActivePromotionsForSupplier } from '../services/promotions.service.js'
`

  writeFile(path.join(outDir, 'index.js'), indexContent)
  writeFile(sourcePath, buildReexport(config))
  console.log(`✓ ${config.sourceFile} → ${config.outputDir}/ (${config.sections.length} sections)`)
}

for (const config of modules) {
  if (config.sourceFile === 'orders.routes.js') {
    splitOrdersModule(config)
  } else if (config.sourceFile === 'staff.routes.js') {
    splitStaffModule(config)
  } else if (config.sourceFile === 'chat.routes.js') {
    splitChatModule(config)
  } else if (config.sourceFile === 'promotions.routes.js') {
    splitPromotionsModule(config)
  } else {
    splitModule(config)
  }
}

console.log('\nDone. Run tests to verify.')
