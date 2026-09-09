/**
 * @typedef {object} AiJsonCompletionResult
 * @property {unknown} data
 * @property {number} tokensIn
 * @property {number} tokensOut
 * @property {number} latencyMs
 * @property {boolean} usedLlm
 */

/**
 * @typedef {object} AiToolDefinition
 * @property {string} name
 * @property {string} description
 * @property {Record<string, unknown>} parameters - JSON Schema object
 */

/**
 * @typedef {object} AiChatMessage
 * @property {'system'|'user'|'assistant'|'tool'} role
 * @property {string} [content]
 * @property {string} [name]
 * @property {string} [tool_call_id]
 * @property {Array<{ id: string, type: 'function', function: { name: string, arguments: string } }>} [tool_calls]
 */

/**
 * @typedef {object} AiToolCallResult
 * @property {string} reply
 * @property {Array<{ tool: string, args: unknown, ok: boolean }>} sources
 * @property {number} tokensIn
 * @property {number} tokensOut
 * @property {number} latencyMs
 * @property {boolean} usedLlm
 */

/**
 * @typedef {object} AiProvider
 * @property {(args: { system: string, user: string, schemaHint?: string }) => Promise<AiJsonCompletionResult>} completeJson
 * @property {(args: {
 *   system: string,
 *   messages: AiChatMessage[],
 *   tools: AiToolDefinition[],
 *   executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>,
 *   maxRounds?: number
 * }) => Promise<AiToolCallResult>} [completeWithTools]
 */
