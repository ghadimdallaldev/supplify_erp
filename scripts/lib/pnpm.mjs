import { spawnSync } from 'node:child_process'

/**
 * Resolve a pnpm invocation that works without global install (npx fallback).
 * @returns {string[]}
 */
export function getPnpmArgs(extraArgs = []) {
  const tryPnpm = spawnSync('pnpm', ['--version'], { shell: true, encoding: 'utf8' })
  if (tryPnpm.status === 0) {
    return ['pnpm', ...extraArgs]
  }

  spawnSync('corepack', ['enable'], { shell: true, stdio: 'ignore' })
  spawnSync('corepack', ['prepare', 'pnpm@8.15.0', '--activate'], { shell: true, stdio: 'ignore' })
  const afterCorepack = spawnSync('pnpm', ['--version'], { shell: true, encoding: 'utf8' })
  if (afterCorepack.status === 0) {
    return ['pnpm', ...extraArgs]
  }

  const tryNpx = spawnSync('npx', ['--yes', 'pnpm@8.15.0', '--version'], {
    shell: true,
    encoding: 'utf8',
  })
  if (tryNpx.status === 0) {
    return ['npx', '--yes', 'pnpm@8.15.0', ...extraArgs]
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
