import { chromium } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const destination = path.join(root, 'output/horeca-flyer')
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1240, height: 950 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(pathToFileURL(path.join(destination, 'source/flyer.html')).href)
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].map((image) => image.decode()))
  })
  await page.emulateMedia({ media: 'print' })
  // Independent language exports also serve the single-sided print files and
  // keep both proofs reproducible before assembling duplex/press versions.
  for (const language of ['en', 'ar']) {
    const proof = await browser.newPage()
    await proof.goto(pathToFileURL(path.join(destination, 'source/flyer.html')).href)
    await proof.emulateMedia({ media: 'print' })
    await proof.evaluate(async (language) => {
      for (const sheet of document.querySelectorAll('.sheet'))
        if (sheet.getAttribute('lang') !== language) sheet.remove()
      await document.fonts.ready
      await Promise.all([...document.images].map((image) => image.decode()))
    }, language)
    await proof.pdf({
      path: path.join(destination, `source/${language}-bleed.pdf`),
      preferCSSPageSize: true,
      printBackground: true,
      tagged: true,
    })
    await proof.close()
  }
  const layout = await page.evaluate(() =>
    [...document.querySelectorAll('.sheet')].map((sheet) => {
      const trim = sheet.querySelector('.trim').getBoundingClientRect()
      const items = [
        ...sheet.querySelectorAll('h1,h2,p,.trust,.edition,.feature-seal,.qr,.journey'),
      ].map((element) => {
        const box = element.getBoundingClientRect()
        return {
          type: element.className || element.tagName,
          text: element.textContent.trim(),
          x: +(box.x - trim.x).toFixed(2),
          y: +(box.y - trim.y).toFixed(2),
          width: +box.width.toFixed(2),
          height: +box.height.toFixed(2),
          overflow: element.scrollWidth > element.clientWidth + 1,
        }
      })
      return { language: sheet.getAttribute('lang'), width: trim.width, height: trim.height, items }
    })
  )
  await fs.writeFile(
    path.join(destination, 'source/layout-check.json'),
    JSON.stringify({ errors, layout }, null, 2)
  )
  if (errors.length || layout.some((p) => p.items.some((i) => i.overflow)))
    throw new Error('Layout errors; inspect layout-check.json')
  console.log('Rendered two language pages with embedded fonts, vector text and QR artwork.')
} finally {
  await browser.close()
}
