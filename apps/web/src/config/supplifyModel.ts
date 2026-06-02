import businessModel from '../../../../config/supplify-business-model.json'

export type SupplifyModelVersion = 'v1' | 'v2'

type ModelVersionCopy = {
  positioning?: { tagline?: string; description?: string }
  supplier?: Record<string, unknown>
  restaurant?: Record<string, unknown>
}

export type SupplifyBusinessModelConfig = {
  version: SupplifyModelVersion
  positioning?: ModelVersionCopy['positioning']
  supplier?: ModelVersionCopy['supplier']
  restaurant?: ModelVersionCopy['restaurant']
  buyerOnlyBlockedFeatures: string[]
  buyerOnlyBlockedPermissions: string[]
}

export function getSupplifyModelVersion(): SupplifyModelVersion {
  const raw = (import.meta.env.VITE_SUPPLIFY_MODEL_VERSION ?? 'v1').trim().toLowerCase()
  if (raw === 'v2') return 'v2'
  return 'v1'
}

export function isSupplifyV1(): boolean {
  return getSupplifyModelVersion() === 'v1'
}

export function isSupplifyV2(): boolean {
  return getSupplifyModelVersion() === 'v2'
}

export function getSupplifyBusinessModelConfig(): SupplifyBusinessModelConfig {
  const version = getSupplifyModelVersion()
  const raw = businessModel[version as keyof typeof businessModel]
  const modelCopy: ModelVersionCopy =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as ModelVersionCopy)
      : (businessModel.v1 as ModelVersionCopy)
  return {
    version,
    positioning: modelCopy.positioning,
    supplier: modelCopy.supplier,
    restaurant: modelCopy.restaurant,
    buyerOnlyBlockedFeatures: businessModel.buyerOnlyBlockedFeatures ?? [],
    buyerOnlyBlockedPermissions: businessModel.buyerOnlyBlockedPermissions ?? [],
  }
}
