import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export function getRepoRoot() {
  return repoRoot
}

export function readDockerEnv() {
  const envPath = path.join(repoRoot, 'docker', '.env')
  const examplePath = path.join(repoRoot, 'docker', '.env.example')
  const file = existsSync(envPath) ? envPath : examplePath
  const vars = {}
  if (!existsSync(file)) return vars
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const i = line.indexOf('=')
    if (i === -1) continue
    vars[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return vars
}

export function dockerComposeArgs(extra = []) {
  const envFile = path.join(repoRoot, 'docker', '.env')
  const composeFile = path.join(repoRoot, 'docker-compose.yml')
  return ['compose', '--env-file', envFile, '-f', composeFile, ...extra]
}
