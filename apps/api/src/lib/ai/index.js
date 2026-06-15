import { config } from '../../config/env.js'
import { isAiEnvEnabled } from '../ai-platform.js'
import { createOpenAiProvider } from './openai-provider.js'

/** @returns {import('./provider.js').AiProvider | null} */
export function getAiProvider() {
  if (!isAiEnvEnabled()) return null
  if (config.AI_PROVIDER === 'openai') {
    return createOpenAiProvider()
  }
  return null
}
