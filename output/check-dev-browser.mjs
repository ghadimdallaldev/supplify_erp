import {webkit,expect} from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import {getDevSession} from './dev-session.mjs'
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1'
const session=await getDevSession(),folder=path.resolve('output/dev-verification-2026-11-14')
const browser=await webkit.launch({headless:true})
const results=[]
try{
 const context=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true,isMobile:false,timezoneId:'Asia/Beirut',locale:'en-US',reducedMotion:'reduce',acceptDownloads:true,serviceWorkers:'block'})
 await context.addInitScript(()=>localStorage.setItem('i18nextLng','en'))
 // Fixture only the seeded demo account's consent gate. Keep authentication,
 // permissions and business API responses live; never record legal acceptance.
 await context.route('**/auth/me',async route=>{
  const response=await route.fetch(),body=await response.json()
  const user=body.data??body
  const testUser={...user,legalStatus:{...user.legalStatus,needsReacceptance:false}}
  await route.fulfill({response,json:body.data?{...body,data:testUser}:testUser})
 })
 results.push({name:'test-boundary',legalConsentGate:'browser-only fixture for seeded demo account; no acceptance submitted',businessData:'live Development API'})
 const cookies=[]
 for(const domain of ['app-dev.supplifyerp.com','api-dev.supplifyerp.com']){
  cookies.push({name:'access_token',value:session.token,domain,path:'/',httpOnly:true,secure:true,sameSite:'Lax'})
  if(session.refreshToken)cookies.push({name:'refresh_token',value:session.refreshToken,domain,path:'/',httpOnly:true,secure:true,sameSite:'Lax'})
 }
 await context.addCookies(cookies)
 for(const [name,routePath] of [['invoices','/app/invoices'],['products','/app/products'],['deals','/app/deals'],['reservations','/app/reservations'],['booking-no-tables','/reserve/hamra-bistro'],['booking-configured','/reserve/ghaditestresto'],['guest-menu','/order/hamra-bistro/menu']]){
  const page=await context.newPage();page.setDefaultTimeout(20000)
  const errors=[],httpErrors=[]
  page.on('pageerror',error=>errors.push(error.message))
  page.on('response',response=>{const url=new URL(response.url());if(url.hostname.endsWith('supplifyerp.com')&&(url.pathname.startsWith('/api/')||url.pathname.startsWith('/auth/'))&&response.status()>=400)httpErrors.push({path:url.pathname,status:response.status()})})
  try{
   console.log(JSON.stringify({checking:name}))
   await page.goto(session.web+routePath,{waitUntil:'domcontentloaded',timeout:30000})
   if(name==='invoices'){
    await page.getByRole('button',{name:/view details|details|view invoice/i}).first().waitFor({timeout:45000})
    for(const width of [768,1024,1194]){await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(folder,`live-invoices-${width}.png`),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0)}
    await page.getByRole('button',{name:/view details|details|view invoice/i}).first().click()
    await page.getByText('Line Items',{exact:true}).waitFor()
    await expect(page.locator('[role=dialog] tbody tr').first()).toBeVisible()
    await page.screenshot({path:path.join(folder,'live-invoice-detail.png'),fullPage:true})
    const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'PDF',exact:true}).click()])
    if(await download.failure())throw new Error('Live PDF download failed')
    results.push({name:'invoice-pdf',filename:download.suggestedFilename(),download:true})
    await page.getByRole('button',{name:/make payment/i}).first().click()
    await page.screenshot({path:path.join(folder,'live-payment.png'),fullPage:true})
    const controls=await page.locator('[role=dialog]').evaluate(dialog=>[...dialog.querySelectorAll('input[type=date],select')].map(node=>({tag:node.tagName,width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})))
    results.push({name:'payment-controls',controls})
   }
   if(name==='products'){
    const view=page.locator('a[href^="/app/products/"]:visible').first();await view.waitFor({timeout:45000});await page.screenshot({path:path.join(folder,'live-products-1024.png'),fullPage:true});await view.click();await page.getByLabel('Quantity',{exact:true}).waitFor();await page.screenshot({path:path.join(folder,'live-product-detail.png'),fullPage:true})
   }
   if(name==='deals'){
    const supplier=page.getByLabel('Supplier',{exact:true});await supplier.waitFor({timeout:45000})
    await expect(supplier.locator('option')).not.toHaveCount(1)
    const options=await supplier.locator('option').evaluateAll(nodes=>nodes.map(node=>({value:node.value,name:node.textContent})))
    await supplier.selectOption(options.find(option=>option.value).value)
    await expect(supplier.locator('option')).toHaveCount(options.length)
    await page.screenshot({path:path.join(folder,'live-deals-filtered.png'),fullPage:true})
    results.push({name:'supplier-filter',supplierChoices:options.length-1,choicesRetained:true})
   }
   if(name==='reservations'){await page.getByText('Reservations Board',{exact:true}).waitFor({timeout:45000});await page.screenshot({path:path.join(folder,'live-reservation-board.png'),fullPage:true})}
   if(name==='booking-no-tables'){
    await page.getByRole('button',{name:/check availability/i}).click();await page.getByText(/Online booking is currently unavailable/).waitFor();await expect(page.getByRole('button',{name:/confirm reservation/i})).toBeDisabled();await page.screenshot({path:path.join(folder,'live-booking-no-tables.png'),fullPage:true})
   }
   if(name==='booking-configured'){
    const party=page.getByLabel(/party size/i);await party.fill('1');await page.getByRole('button',{name:/check availability/i}).click();await page.getByRole('group',{name:'Available reservation times'}).waitFor();results.push({name:'configured-public-availability',availableTimes:await page.locator('.public-slot:not([disabled])').count()});await page.screenshot({path:path.join(folder,'live-booking-configured.png'),fullPage:true})
   }
   if(name==='guest-menu'){
    const picks=page.getByRole('region',{name:'Chef picks',exact:true})
    await picks.locator('.consumer-menu-item').first().waitFor({timeout:45000})
    await picks.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.complete?Promise.resolve():new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});setTimeout(resolve,5000)}))))
    for(const width of [768,1024,1194]){
     await page.setViewportSize({width,height:900})
     const cards=await picks.locator('.consumer-menu-item').evaluateAll(nodes=>nodes.map(node=>{const title=node.querySelector('p.font-medium')?.getBoundingClientRect(),price=node.querySelector('span.tabular-nums')?.getBoundingClientRect();return {titleBottom:title?.bottom,priceTop:price?.top}}))
     expect(cards.length).toBeGreaterThan(0)
     for(const card of cards)expect(card.priceTop).toBeGreaterThanOrEqual(card.titleBottom)
     expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0)
     await page.screenshot({path:path.join(folder,`viewport-guest-menu-${width}.png`),fullPage:false,animations:'disabled'})
    }
    await expect.poll(()=>page.locator('.consumer-menu-item img').evaluateAll(images=>images.filter(image=>image.complete&&image.naturalWidth===0).length)).toBe(0)
    results.push({name:'featured-menu-layout',widths:[768,1024,1194],namePriceOverlap:false,brokenImageElements:0,featuredPreorderActions:await picks.getByText('Preorder',{exact:true}).count()})
    await page.screenshot({path:path.join(folder,'live-guest-menu.png'),fullPage:false,animations:'disabled'})
   }
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)
   results.push({name,errors,httpErrors,overflow,url:new URL(page.url()).pathname})
  }catch(error){results.push({name,testError:error.message,errors,httpErrors,url:new URL(page.url()).pathname});await page.screenshot({path:path.join(folder,`failure-${name}.png`),fullPage:true}).catch(()=>{})}
  finally{await fs.writeFile(path.join(folder,'browser-live.json'),JSON.stringify(results,null,2));await page.close()}
 }
}finally{await browser.close()}
console.log(JSON.stringify({checks:results.length,failures:results.filter(result=>result.testError||result.errors?.length||result.overflow>0||result.httpErrors?.some(error=>error.status>=500))}))
