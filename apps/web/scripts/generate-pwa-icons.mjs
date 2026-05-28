/**
 * Generates PNG PWA icons from favicon.svg (run: node scripts/generate-pwa-icons.mjs)
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svgPath = join(root, 'favicon.svg')
const iconsDir = join(root, 'static', 'icons')
const staticDir = join(root, 'static')

mkdirSync(iconsDir, { recursive: true })
copyFileSync(svgPath, join(staticDir, 'favicon.svg'))

let sharp
try {
  sharp = (await import('sharp')).default
} catch {
  console.warn('sharp not installed — skipping PNG icon generation (run: npm i -D sharp)')
  process.exit(0)
}

const svg = readFileSync(svgPath)

const sizes = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
]

for (const { name, size, maskable } of sizes) {
  let pipeline = sharp(svg).resize(size, size)
  if (maskable) {
    pipeline = sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 91, g: 33, b: 182, alpha: 1 },
      },
    }).composite([
      {
        input: await sharp(svg).resize(Math.round(size * 0.72), Math.round(size * 0.72)).png().toBuffer(),
        gravity: 'centre',
      },
    ])
  }
  await pipeline.png().toFile(join(iconsDir, name))
  console.log(`Wrote ${name}`)
}
