import { useMemo } from 'react'
import {
  getSupplifyBusinessModelConfig,
  getSupplifyModelVersion,
  isSupplifyV1,
  isSupplifyV2,
} from '../config/supplifyModel'

export function useSupplifyModel() {
  return useMemo(
    () => ({
      version: getSupplifyModelVersion(),
      isV1: isSupplifyV1(),
      isV2: isSupplifyV2(),
      config: getSupplifyBusinessModelConfig(),
    }),
    []
  )
}
