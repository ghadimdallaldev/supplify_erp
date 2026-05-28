#!/usr/bin/env node
/**
 * Lightweight Mermaid (.mmd) validation for CI/local checks.
 * Does not render diagrams; checks structure and README index coverage.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const DIAGRAM_KEYWORDS = /^(%%|flowchart|graph|sequenceDiagram|erDiagram|stateDiagram|classDiagram|gantt|pie|mindmap|timeline|journey|gitGraph|C4Context|sankey-beta|xychart-beta)/m

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage'])

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) walk(full, acc)
    else if (name.endsWith('.mmd')) acc.push(full)
  }
  return acc
}

function hasDiagramBody(content) {
  const stripped = content
    .split('\n')
    .filter((line) => !line.trim().startsWith('%%'))
    .join('\n')
    .trim()
  if (!stripped) return false
  return DIAGRAM_KEYWORDS.test(stripped)
}

function extractReadmePaths(readmePath) {
  const text = readFileSync(readmePath, 'utf8')
  const paths = new Set()
  for (const m of text.matchAll(/`([^`]+\.mmd)`/g)) paths.add(m[1].replace(/\\/g, '/'))
  for (const m of text.matchAll(/\]\(([^)]+\.mmd)\)/g)) paths.add(m[1].replace(/\\/g, '/'))
  return paths
}

const scanRoots = [join(ROOT, 'docs'), join(ROOT, 'docs/blueprint')].filter((p) => {
  try {
    statSync(p)
    return true
  } catch {
    return false
  }
})
const files = [...new Set(scanRoots.flatMap((r) => walk(r)))]
const errors = []
const warnings = []

for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  const content = readFileSync(file, 'utf8')

  if (!content.trim()) {
    errors.push(`${rel}: empty file`)
    continue
  }

  if (!hasDiagramBody(content)) {
    errors.push(`${rel}: no Mermaid diagram keyword found after comments`)
  }

  if (/\t/.test(content)) {
    warnings.push(`${rel}: contains tab characters (prefer spaces)`)
  }
}

const readmePath = join(ROOT, 'docs/diagrams/README.md')
let indexed = new Set()
try {
  indexed = extractReadmePaths(readmePath)
} catch {
  errors.push('docs/diagrams/README.md: missing (required index)')
}

for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  if (!rel.startsWith('docs/diagrams/')) continue
  const short = rel.replace(/^docs\/diagrams\//, '')
  const listed =
    indexed.has(rel) ||
    indexed.has(short) ||
    [...indexed].some((p) => p.endsWith(short) || rel.endsWith(p.replace(/^\.\//, '')))
  if (!listed) {
    errors.push(`${rel}: not listed in docs/diagrams/README.md`)
  }
}

if (warnings.length) {
  console.warn('Warnings:')
  warnings.forEach((w) => console.warn(`  - ${w}`))
}

if (errors.length) {
  console.error(`Mermaid check failed (${errors.length} issue(s)):`)
  errors.forEach((e) => console.error(`  - ${e}`))
  process.exit(1)
}

console.log(`Mermaid check passed: ${files.length} .mmd file(s) reviewed.`)
for (const f of files.sort()) {
  console.log(`  ok ${relative(ROOT, f).replace(/\\/g, '/')}`)
}
