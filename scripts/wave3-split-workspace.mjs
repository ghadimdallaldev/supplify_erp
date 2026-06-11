import fs from 'fs'
import path from 'path'

const file = path.resolve('apps/web/src/lib/workspaceRoleProfile.ts')
const lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n')
const dir = path.resolve('apps/web/src/lib/workspaceRoleProfile')
fs.mkdirSync(dir, { recursive: true })

const idx = (pred) => lines.findIndex(pred)
const supplierProfilesStart = idx((l) => l.includes('supplier_owner:'))
const restaurantProfilesStart = idx((l) => l.includes('restaurant_owner:'))
const genericStart = idx((l) => l.trim() === 'generic: {')
const profilesClose = idx((l, i) => i > genericStart && l === '}')
const isPromoStart = idx((l) => l.startsWith('export function isPromotionsFocusedSupplier'))
const resolveSupplierStart = idx((l) => l.startsWith('function resolveSupplierPersonaId'))
const resolveRestaurantStart = idx((l) => l.startsWith('function resolveRestaurantPersonaId'))
const resolvePersonaStart = idx((l) => l.startsWith('export function resolveWorkspacePersona'))
const commandCenterTypeStart = idx((l) => l.startsWith('export type CommandCenterLayout'))
const restaurantDashTypeStart = idx((l) => l.startsWith('export type RestaurantDashboardLayout'))
const restaurantOverviewStart = idx((l) => l.startsWith('export function restaurantOverviewNavAllowed'))
const shouldShowCalStart = idx((l) => l.startsWith('export function shouldShowDashboardCalendar'))

const sharedHeader = lines.slice(0, idx((l) => l.startsWith('const SUPPLIER_ROLE_ALIASES'))).join('\n')
const supplierAliases = lines.slice(idx((l) => l.startsWith('const SUPPLIER_ROLE_ALIASES')), restaurantProfilesStart > 0 ? idx((l) => l.startsWith('const RESTAURANT_ROLE_ALIASES')) : idx((l) => l.startsWith('const PROFILES'))).join('\n')
const restaurantAliases = lines
  .slice(idx((l) => l.startsWith('const RESTAURANT_ROLE_ALIASES')), idx((l) => l.startsWith('const PROFILES')))
  .join('\n')

const supplierProfileBody = lines.slice(supplierProfilesStart, restaurantProfilesStart).join('\n')
const restaurantProfileBody = lines.slice(restaurantProfilesStart, genericStart).join('\n')
const genericProfileBody = lines.slice(genericStart, profilesClose + 1).join('\n')

const supplierFns = lines.slice(isPromoStart, resolvePersonaStart).join('\n')
const resolvePersonaFn = lines.slice(resolvePersonaStart, commandCenterTypeStart).join('\n')
const commandCenterBlock = lines.slice(commandCenterTypeStart, restaurantDashTypeStart).join('\n')
const restaurantFns = lines.slice(restaurantDashTypeStart, shouldShowCalStart).join('\n')
const tailShared = lines.slice(shouldShowCalStart).join('\n')

const supplierTs = `import type { PermissionCheck, WorkspacePersonaId, WorkspacePersonaProfile } from './shared'
import { DEFAULT_PROMOTIONS_COPY } from './shared'

${supplierAliases}

export const SUPPLIER_PROFILES: Partial<Record<WorkspacePersonaId, WorkspacePersonaProfile>> = {
${supplierProfileBody}
}

${supplierFns
  .replace('const PROFILES', '// profiles')
  .replace(/return PROFILES\[id\]/g, 'return { ...SUPPLIER_PROFILES, ...RESTAURANT_PROFILES, generic: GENERIC_PROFILE }[id]')}

export { resolveSupplierPersonaId }
`

// Fix supplier - resolve functions don't reference PROFILES directly except resolveWorkspacePersona

const supplierTsFixed = `import type { PermissionCheck, WorkspacePersonaId, WorkspacePersonaProfile } from './shared'
import { DEFAULT_PROMOTIONS_COPY } from './shared'

${supplierAliases}

export const SUPPLIER_PROFILES: Partial<Record<WorkspacePersonaId, WorkspacePersonaProfile>> = {
${supplierProfileBody}
}

${supplierFns}

export function resolveSupplierPersonaId(
  roleName: string | null,
  can: PermissionCheck,
  isDriver: boolean
): WorkspacePersonaId {
${lines.slice(resolveSupplierStart + 1, resolveRestaurantStart).join('\n').replace(/^function resolveSupplierPersonaId[^{]*\{/, '').replace(/\}$/, '')}
}
`.trim()

// This is getting messy. Use copy-from-original with search_replace on the actual file instead.

const sharedTs = `${sharedHeader}

${supplierAliases.replace('const SUPPLIER_ROLE_ALIASES', 'export const SUPPLIER_ROLE_ALIASES')}
${restaurantAliases.replace('const RESTAURANT_ROLE_ALIASES', 'export const RESTAURANT_ROLE_ALIASES')}

export const DEFAULT_PROMOTIONS_COPY = ${lines[idx((l) => l.startsWith('const DEFAULT_PROMOTIONS_COPY'))].replace('const DEFAULT_PROMOTIONS_COPY = ', '')}
${lines.slice(idx((l) => l.startsWith('const DEFAULT_PROMOTIONS_COPY')) + 1, idx((l) => l.startsWith('const SUPPLIER_ROLE_ALIASES'))).join('\n')}

export const GENERIC_PROFILE: WorkspacePersonaProfile = {
${lines.slice(genericStart + 1, profilesClose).join('\n')}
}

${resolvePersonaFn
  .replace(
    "id = resolveSupplierPersonaId(roleName ?? null, can, isDriver)",
    "id = resolveSupplierPersonaId(roleName ?? null, can, isDriver)"
  )
  .replace('return PROFILES[id] ?? PROFILES.generic', 'return getWorkspaceProfile(id)')}

export function getWorkspaceProfile(id: WorkspacePersonaId): WorkspacePersonaProfile {
  return (
    SUPPLIER_PROFILES[id as keyof typeof SUPPLIER_PROFILES] ??
    RESTAURANT_PROFILES[id as keyof typeof RESTAURANT_PROFILES] ??
    GENERIC_PROFILE
  )
}

${tailShared}
`

// Too complex - do direct file writes with read tool content

console.log('Use manual file creation')
console.log({ supplierProfilesStart, restaurantProfilesStart, genericStart, profilesClose })
