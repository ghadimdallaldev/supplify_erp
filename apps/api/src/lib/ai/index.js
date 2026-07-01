import { config } from '../../config/env.js'
import { isAiEnvEnabled } from '../ai-platform.js'
import { createOpenAiProvider } from './openai-provider.js'

/** @type {import('./provider.js').AiProvider | null | undefined} */
let cachedProvider

/** @returns {import('./provider.js').AiProvider | null} */
export function getAiProvider() {
  if (!isAiEnvEnabled()) {
    cachedProvider = null
    return null
  }
  if (config.AI_PROVIDER === 'openai') {
    if (!cachedProvider) {
      cachedProvider = createOpenAiProvider()
    }
    return cachedProvider
  }
  cachedProvider = null
  return null
}

/** Test helper — reset singleton between cases. */
export function resetAiProviderCache() {
  cachedProvider = undefined
}
