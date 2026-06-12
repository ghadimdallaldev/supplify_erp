/**
 * Fix supplier section files: import order and duplicate schemas.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/routes/suppliers')
const sectionFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'index.js' && f !== 'suppliers.helpers.js')

const brandingBlock = `const brandingUpdateSchema = z.object({
  brandPrimary: z.string().optional().nullable(),
  brandAccent: z.string().optional().nullable(),
  brandDisplayName: z.string().max(120).optional().nullable(),
})

`

for (const file of sectionFiles) {
  let content = fs.readFileSync(path.join(dir, file), 'utf8')
  content = content.replace(brandingBlock, '')
  content = content.replace(
    /import { invalidateTenantProfileCache } from '\.\.\/\.\.\/lib\/tenant-profile-cache\.js'\n\nconst log = createModuleLogger\('suppliers\.routes'\)\nimport /,
    "import { invalidateTenantProfileCache } from '../../lib/tenant-profile-cache.js'\nimport "
  )
  content = content.replace(
    /(from '\.\.\/\.\.\/services\/featured-supplier-placement\.service\.js'\n)\n\nimport \{/,
    "$1\nimport {"
  )
  if (file === 'profile.js' && !content.includes('brandingUpdateSchema')) {
    content = content.replace(
      /from '\.\/suppliers\.helpers\.js'/,
      "brandingUpdateSchema,\n} from './suppliers.helpers.js'"
    )
    content = content.replace(
      /supplierListSchema,\n\} from '\.\/suppliers\.helpers\.js'/,
      "supplierListSchema,\n  brandingUpdateSchema,\n} from './suppliers.helpers.js'"
    )
  }
  fs.writeFileSync(path.join(dir, file), content, 'utf8')
}

// Export brandingUpdateSchema from helpers
let helpers = fs.readFileSync(path.join(dir, 'suppliers.helpers.js'), 'utf8')
if (!helpers.includes('export { attachReviewFields')) {
  helpers = helpers.replace(
    /export \{ attachReviewFields/,
    'export { brandingUpdateSchema, attachReviewFields'
  )
} else if (!helpers.includes('brandingUpdateSchema')) {
  helpers = helpers.replace(
    'export { attachReviewFields',
    'export { brandingUpdateSchema, attachReviewFields'
  )
}
fs.writeFileSync(path.join(dir, 'suppliers.helpers.js'), helpers, 'utf8')

console.log('Fixed supplier section files')
