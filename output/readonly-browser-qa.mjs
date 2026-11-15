import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { chromium,webkit,expect } from '@playwright/test'
const require = createRequire(path.resolve('apps/web/package.json'))
const {createServer} = await import(pathToFileURL(path.join(path.dirname(require.resolve('vite')),'dist/node/index.js')).href)
process.env.VITE_API_URL='http://127.0.0.1:5178'
const aliases = Object.fromEntries(['react','react-dom','react-redux','@reduxjs/toolkit','react-router-dom','react-i18next'].map((name) => [name,path.resolve('apps/web/node_modules',name)]))
const tailwind = require('tailwindcss/loadConfig')(path.resolve('apps/web/tailwind.config.js'))
const postcss = {plugins:[require('tailwindcss')({...tailwind,content:[path.resolve('apps/web/src/**/*.{ts,tsx,js,jsx}')]}),require('autoprefixer')]}
const server = await createServer({configFile:path.resolve('apps/web/vite.config.ts'),root:path.resolve('output/readonly-browser'),envDir:path.resolve('apps/web'),resolve:{alias:aliases},css:{postcss},server:{host:'127.0.0.1',port:5178,strictPort:true,fs:{allow:[process.cwd()]}}})
await server.listen()
const output=path.resolve('output/readonly-browser-results')
await fs.mkdir(output,{recursive:true})
const report=[]
const id='33333333-3333-4333-8333-333333333333'
const sources=[{tool:'get_inventory',ok:true,evidence:{fetchedAt:'2026-11-14T12:00:00Z',status:'ok',scope:'RESTAURANT',href:'/app/restaurant-inventory',limited:true}},{tool:'get_invoices',ok:false,evidence:{fetchedAt:'2026-11-14T12:00:00Z',status:'unavailable',limited:false}}]
const items=[{id:'one',productId:id,productName:'Tomatoes',productUnit:'kg',supplierId:id,supplierName:'Fresh Co',reasonCode:'forecast',reasonLabel:'Measured usage over 30 days',urgency:'HIGH',suggestedQty:32,currentQty:5,incomingQty:6,expectedUsage:42,netNeed:31,action:'order',dataQuality:'good',stockScope:'restaurant',scopeType:'product',scopeId:id,orderBy:'2026-11-14'},
 {id:'two',productId:'44444444-4444-4444-8444-444444444444',productName:'Rice',supplierName:'Pantry Co',supplierId:'pantry',productUnit:'kg',reasonCode:'forecast',reasonLabel:'Stock and incoming deliveries cover usage',urgency:'LOW',currentQty:30,incomingQty:20,expectedUsage:21,netNeed:0,suggestedQty:0,action:'wait',dataQuality:'good',stockScope:'restaurant',scopeType:'product',scopeId:'rice'},
 {id:'three',productId:'55555555-5555-4555-8555-555555555555',productName:'Olive oil',supplierName:'Pantry Co',supplierId:'pantry',productUnit:'l',reasonCode:'low_stock',reasonLabel:'Check the next delivery',urgency:'HIGH',currentQty:1,incomingQty:null,suggestedQty:null,action:'manual_review',dataQuality:'poor',warnings:['incoming_unknown'],stockScope:'restaurant',scopeType:'product',scopeId:'oil'}]
try {
for (const [engine,browserType] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await browserType.launch({headless:true})
 try {
 for (const [language,role,width,height] of [['en','RESTAURANT',768,1024],['en','RESTAURANT',1024,768],['ar','RESTAURANT',1194,834],['en','SUPPLIER',1024,768],['en','RESTAURANT',390,844]]) {
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:false,reducedMotion:'reduce'})
  const page=await context.newPage(),errors=[]
  let aiCalls=0,listWrites=0
  page.on('pageerror',(error) => { errors.push(error.message); console.log(JSON.stringify({runtimeError:error.message})) })
  page.on('console',(message) => { if (message.type()==='error') console.log(JSON.stringify({browserError:message.text().slice(0,300)})) })
  await page.route('**/*',async (route) => {
    const url=new URL(route.request().url())
    const cors={'access-control-allow-origin':'http://127.0.0.1:5178','access-control-allow-credentials':'true','access-control-allow-headers':'content-type,x-requested-with'}
    if (url.pathname.startsWith('/api/')) {
      if (route.request().method()==='OPTIONS') return route.fulfill({status:204,headers:cors})
      let data
      if (url.pathname==='/api/entitlements' || url.pathname.includes('/subscriptions/entitlements')) data={entitlements:{features:{ai_assistant:true,quick_lists:true,smart_reorder:'ai_forecast_seasonality'},limits:{ai_requests_per_day:150},usage:{ai_requests_per_day:0}}}
      else if (url.pathname.endsWith('/reorder-assistance')) data={suggestions:items,total:3,smartReorder:{tier:'advanced_forecast',capabilities:{forecast:true,seasonality:true}},ai:{canExplainLlm:true},asOf:'2026-11-14'}
      else if (url.pathname.endsWith('/ai-recommend')) { aiCalls++; data={recommendations:[],usedLlm:true} }
      else if (url.pathname==='/api/quick-lists') data={quickLists:[{id,name:'Weekly'},{id:'other',name:'Weekend'}]}
      else if (url.pathname.includes('/quick-lists/') && route.request().method()==='POST') { listWrites++; data={} }
      else if (url.pathname==='/api/assistant/capabilities') data={enabled:true,quotaRemaining:150,tools:role==='SUPPLIER'?['get_supplier_overview','get_orders','get_fulfillment_board']:['get_inventory','get_orders','get_reorder_need','get_reservations']}
      else if (url.pathname==='/api/assistant/conversations') data={conversations:[{id,title:'Earlier stock review',createdAt:'2026-11-14T12:00:00Z',updatedAt:'2026-11-14T12:00:00Z'}]}
      else if (url.pathname.includes('/assistant/conversations/')) data={messages:[{id:'m1',role:'assistant',content:language==='ar'?'لديك 5 كغ من الطماطم و6 كغ متوقعة. راجع الطلبات قبل الشراء.':'You have 5 kg of tomatoes and 6 kg incoming. Review the open orders before buying.',toolPayload:{sources},createdAt:'2026-11-14T12:00:00Z'}],hasMore:false}
      else if (url.pathname==='/api/assistant/messages') data={conversationId:id,reply:language==='ar'?'لديك 5 كغ من الطماطم.':'You have 5 kg of tomatoes.',sources,usedLlm:true}
      else { errors.push(`Unmocked API ${url.pathname}`); return route.fulfill({status:404,json:{ok:false,error:{message:'Unknown fixture'}}}) }
      return route.fulfill({headers:cors,json:{ok:true,data,error:null,requestId:'synthetic-fixture'}})
    }
    if (url.hostname!=='127.0.0.1') return route.abort()
    return route.continue()
  })
  await page.goto(`http://127.0.0.1:5178/?lang=${language}&role=${role}`,{waitUntil:'networkidle'})
  try { await expect(page.getByTestId('assistant-fab')).toBeVisible({timeout:15000}) } catch (error) { console.log(JSON.stringify({errors,html:(await page.locator('body').innerText()).slice(0,1500)})); throw error }
  if (role==='RESTAURANT') {
    await expect(page.getByTestId('reorder-item')).toHaveCount(3)
    expect(aiCalls).toBe(0)
    await expect(page.getByTestId('reorder-item').filter({hasText:'Rice'}).getByRole('link',{name:'Cart',exact:true})).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(0)
    await page.screenshot({path:path.join(output,`${engine}-${language}-reorder-${width}.png`),fullPage:true})
  }
  await page.getByTestId('assistant-fab').click()
  await page.getByTestId('assistant-input').fill(language==='ar'?'ما الذي يحتاج إلى انتباهي؟':'What needs attention?')
  await page.getByTestId('assistant-send').click()
  await expect(page.getByText(language==='ar'?'لديك 5 كغ من الطماطم.':'You have 5 kg of tomatoes.',{exact:true})).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(0)
  await page.screenshot({path:path.join(output,`${engine}-${language}-assistant-${role}-${width}.png`),fullPage:true})
  report.push({engine,language,role,width,overflow:0,errors,automaticAiCalls:aiCalls,listWrites})
  expect(errors).toEqual([])
  await context.close()
 }
 } finally { await browser.close() }
}
await fs.writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify({checks:report.length,engines:['chromium','webkit'],result:'passed',fixtureOnly:true,folder:output}))
} finally { await server.close() }
