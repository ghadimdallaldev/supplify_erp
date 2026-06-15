/**
 * @typedef {object} AiJsonCompletionResult
 * @property {unknown} data
 * @property {number} tokensIn
 * @property {number} tokensOut
 * @property {number} latencyMs
 * @property {boolean} usedLlm
 */

/**
 * @typedef {object} AiProvider
 * @property {(args: { system: string, user: string, schemaHint?: string }) => Promise<AiJsonCompletionResult>} completeJson
 */
