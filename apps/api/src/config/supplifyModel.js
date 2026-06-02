import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../../..')

let businessModelCache = null

function loadBusinessModelJson() {
  if (businessModelCache) return businessModelCache
  const filePath = path.join(repoRoot, 'config', 'supplify-business-model.json')
  businessModelCache = JSON.parse(readFileSync(filePath, 'utf8'))
  return businessModelCache
}

/**
 * @returns {'v1' | 'v2'}
 */
export function getSupplifyModelVersion() {
  const raw = (process.env.SUPPLIFY_MODEL_VERSION || 'v1').trim().toLowerCase()
  if (raw === 'v2') return 'v2'
  return 'v1'
}

export function isSupplifyV1() {
  return getSupplifyModelVersion() === 'v1'
}

export function isSupplifyV2() {
  return getSupplifyModelVersion() === 'v2'
}

/**
 * Business copy and capability matrix for the active model version.
 */
export function getSupplifyBusinessModelConfig() {
  const version = getSupplifyModelVersion()
  const definitions = loadBusinessModelJson()
  const modelCopy = definitions[version] || definitions.v1
  return {
    version,
    ...modelCopy,
    buyerOnlyBlockedFeatures: definitions.buyerOnlyBlockedFeatures || [],
    buyerOnlyBlockedPermissions: definitions.buyerOnlyBlockedPermissions || [],
  }
}

export function applyBuyerOnlyFeatureOverlay(features, workspaceMode) {
  if (!isSupplifyV2() || workspaceMode !== 'buyer_only' || !features) {
    return features
  }
  const { buyerOnlyBlockedFeatures } = getSupplifyBusinessModelConfig()
  const next = { ...features }
  for (const key of buyerOnlyBlockedFeatures) {
    if (key in next) next[key] = false
  }
  return next
}
