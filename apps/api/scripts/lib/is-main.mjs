import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Cross-platform check for "node path/to/script.js" (Windows-safe). */
export function isMainModule(metaUrl, argv = process.argv) {
  if (!argv[1]) return false
  const resolved = path.resolve(argv[1])
  return metaUrl === pathToFileURL(resolved).href
}

export function repoRootFromMeta(metaUrl) {
  return path.resolve(path.dirname(fileURLToPath(metaUrl)), '../..')
}
