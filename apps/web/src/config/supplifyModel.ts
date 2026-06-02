import businessModel from '../../../../config/supplify-business-model.json'

export type SupplifyModelVersion = 'v1' | 'v2'

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

export function getSupplifyBusinessModelConfig() {
  const version = getSupplifyModelVersion()
  const modelCopy = businessModel[version as keyof typeof businessModel] ?? businessModel.v1
  return {
    version,
    ...(typeof modelCopy === 'object' && modelCopy !== null ? modelCopy : {}),
    buyerOnlyBlockedFeatures: businessModel.buyerOnlyBlockedFeatures ?? [],
    buyerOnlyBlockedPermissions: businessModel.buyerOnlyBlockedPermissions ?? [],
  }
}
