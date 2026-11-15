import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
const checks = [
  ['typecheck-final', ['typecheck']],
  ['web-lint-final', ['--filter', '@supplify/web', 'lint']],
  ['web-build-final', ['--filter', '@supplify/web', 'build']],
]
const results = await Promise.all(checks.map(([name, args]) => new Promise(resolve => {
  const child = spawn('pnpm.cmd', args, { shell: true, windowsHide: true })
  let output = ''
  child.stdout.on('data', chunk => output += chunk)
  child.stderr.on('data', chunk => output += chunk)
  child.on('error', error => resolve({ name, error: error.message, exitCode: 1 }))
  child.on('close', async exitCode => {
    await writeFile(`output/dev-verification-2026-11-14/${name}.log`, output)
    console.log(JSON.stringify({ name, exitCode }))
    resolve({ name, exitCode })
  })
})))
await writeFile('output/dev-verification-2026-11-14/final-checks.json', JSON.stringify(results, null, 2))
process.exitCode = results.some(result => result.exitCode !== 0) ? 1 : 0
