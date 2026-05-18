import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Ensure repo-local CLI shims (pnpm, etc.) resolve without a global install.
 */
function prependRepoBinToPath() {
  const repoRoot = path.resolve(__dirname, '../..')
  const bin = path.join(repoRoot, 'node_modules', '.bin')
  const parts = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
  if (parts.some((p) => path.normalize(p) === path.normalize(bin))) {
    return
  }
  process.env.PATH = [bin, ...parts].join(path.delimiter)
}

/**
 * Resolve a pnpm invocation that works without global install (npx fallback).
 * @returns {string[]}
 */
export function getPnpmArgs(extraArgs = []) {
  prependRepoBinToPath()

  const tryPnpm = spawnSync('pnpm', ['--version'], { shell: true, encoding: 'utf8' })
  if (tryPnpm.status === 0) {
    return ['pnpm', ...extraArgs]
  }

  spawnSync('corepack', ['enable'], { shell: true, stdio: 'ignore' })
  spawnSync('corepack', ['prepare', 'pnpm@8.15.9', '--activate'], { shell: true, stdio: 'ignore' })
  const afterCorepack = spawnSync('pnpm', ['--version'], { shell: true, encoding: 'utf8' })
  if (afterCorepack.status === 0) {
    return ['pnpm', ...extraArgs]
  }

  const tryNpx = spawnSync('npx', ['--yes', 'pnpm@8.15.9', '--version'], {
    shell: true,
    encoding: 'utf8',
  })
  if (tryNpx.status === 0) {
    return ['npx', '--yes', 'pnpm@8.15.9', ...extraArgs]
  }

  return null
}

export function runPnpm(extraArgs, opts = {}) {
  const args = getPnpmArgs(extraArgs)
  if (!args) {
    return { status: 1, error: 'pnpm not found' }
  }
  const [cmd, ...rest] = args
  return spawnSync(cmd, rest, {
    stdio: 'inherit',
    shell: true,
    ...opts,
  })
}
