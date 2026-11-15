import { chromium } from '@playwright/test'
import fs from 'node:fs/promises'

const folder = new URL('./', import.meta.url)
const browser = await chromium.launch({ headless: true })
const user = { id: 'pilot-fixture', email: 'fixture@example.test', displayName: 'Pilot UI fixture', role: 'RESTAURANT', tenantRoles: ['Owner'], tenantPermissions: ['ORDERS_VIEW','ORDERS_CREATE','CATALOG_VIEW','SETTINGS_VIEW'], workspace: { tenantId: 'fixture-restaurant', roleName: 'Owner' } }
const suppliers = [{ id: 's-usd', name: 'Cedar Foods', product_count: 1 }, { id: 's-lbp', name: 'Bekaa Produce', product_count: 1 }]
const products = [
  { id:'p-usd',supplier_id:'s-usd',supplier_name:'Cedar Foods',name:'Extra virgin olive oil, restaurant pack',sku:'OL-1',unit:'bottle',current_price:12.5,currency:'USD',stock_quantity:100 },
  { id:'p-lbp',supplier_id:'s-lbp',supplier_name:'Bekaa Produce',name:'Fresh seasonal Lebanese tomatoes',sku:'TM-1',unit:'kg',current_price:100000,currency:'LBP',stock_quantity:100 },
]
const results = []
async function prepare(page, native) {
  await page.addInitScript(() => {
    localStorage.setItem('supplify_access_token', 'fixture-access')
    localStorage.setItem('supplify_refresh_token', 'fixture-refresh')
  })
  if (page.routeWebSocket) await page.routeWebSocket(/socket\.io/, (socket) => socket.close())
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (!path.startsWith('/api/') && !path.startsWith('/auth/')) return route.continue()
    let data = { orders:[],notifications:[],suppliers:[],comparisons:[],conversations:[],disputes:[],branches:[], stats:{}, items:[] }
    if (path === '/auth/me') data = user
    else if (path.includes('register/status')) data = { needsSetup:false }
    else if (path.includes('entitlements')) data = { entitlements:{ plan:{code:'gold',name:'Gold'},features:{quick_lists:true,supplier_deals:true},limits:{} } }
    else if (path === '/api/suppliers') data = { suppliers }
    else if (path === '/api/products') data = { products, pagination:{total:2} }
    else if (path.includes('restaurant-pricing/resolve')) { const body=route.request().postDataJSON(); data={items:body.items.map(i=>({...i,unitPrice:products.find(p=>p.id===i.productId).current_price,source:'DEFAULT_PRICE'}))} }
    else if (path.includes('delivery-locations')) data = { restaurant:{id:'fixture-restaurant',name:'Pilot fixture'}, branches:[] }
    else if (path.includes('active') && path.includes('branch')) data={branches:[]}
    await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':native?'http://127.0.0.1:8086':'http://127.0.0.1:5175','Access-Control-Allow-Credentials':'true'},body:JSON.stringify({ok:true,data,error:null})})
  })
}
try {
  for (const native of [false,true]) {
    const page = await browser.newPage({viewport:{width:390,height:844}})
    const errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    await prepare(page,native)
    await page.goto(native?'http://127.0.0.1:8086/':'http://127.0.0.1:5175/app/orders')
    await page.waitForTimeout(3000)
    const text=await page.locator('body').innerText()
    if (native) {
      await page.getByRole('tab', { name: /Suppliers/ }).click()
      await page.getByText('Cedar Foods', { exact: true }).click()
      await page.waitForTimeout(1000)
      await page.screenshot({path:new URL('native-catalog.png',folder).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true})
      await page.getByRole('button', { name: 'Add to cart', exact: true }).first().click()
      await page.getByRole('button', { name: 'Add to cart', exact: true }).first().click()
      await page.getByRole('button', { name: /^Cart,/ }).click()
      await page.getByText('Estimated totals by currency', { exact:true }).waitFor()
      for (const width of [320,390,768]) {
        await page.setViewportSize({width,height:844})
        await page.screenshot({path:new URL(`native-cart-${width}.png`,folder).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true})
        const audit=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-window.innerWidth,buttons:Array.from(document.querySelectorAll('[role=button]')).map(n=>({name:n.getAttribute('aria-label')||n.textContent,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})),text:document.body.innerText}))
        results.push({surface:'native-cart-fixture',width,errors:[...errors],...audit})
      }
    } else {
      await page.setViewportSize({width:1440,height:900})
      const group=page.getByRole('button',{name:'OPERATIONS',exact:true})
      await group.click()
      if (await group.getAttribute('aria-expanded')!=='false') throw new Error('Task group did not collapse')
      await group.click()
      for (const width of [390,1440]) {
        await page.setViewportSize({width,height:900})
        await page.screenshot({path:new URL(`web-orders-${width}.png`,folder).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true})
        results.push({surface:'web-orders-fixture',width,errors:[...errors],overflow:await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)})
      }
    }
    await page.screenshot({path:new URL(native?'native-start.png':'web-start.png',folder).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true})
    results.push({surface:native?'native-web-preview':'web',errors,text:text.slice(0,1800),buttons:await page.getByRole('button').allTextContents(),tabs:await page.getByRole('tab').allTextContents()})
    await page.close()
  }
  await fs.writeFile(new URL('ui-review-final.json',folder),JSON.stringify(results,null,2))
  console.log(JSON.stringify(results))
} finally { await browser.close() }
