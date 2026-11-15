import { chromium, webkit, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
const out=path.resolve('output/ipad-review-2026-11-13'); await fs.mkdir(out,{recursive:true})
const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Beirut'})
const permissions=['INVOICES_VIEW','INVOICES_MANAGE','INVOICES_EDIT','PAYMENTS_MANAGE','CATALOG_VIEW','CATALOG_MANAGE','ORDERS_VIEW','ORDERS_CREATE','INVENTORY_VIEW','INVENTORY_MANAGE','REPORTS_VIEW','RESERVATIONS_VIEW','RESERVATIONS_MANAGE','SETTINGS_VIEW','SETTINGS_MANAGE','SUPPLIERS_VIEW','RECEIVING_VIEW','RECEIVING_MANAGE','RECEIVING_CREATE']
const user={id:'ipad-qa',email:'qa@example.test',displayName:'QA Owner',role:'RESTAURANT',tenantRoles:['Owner'],tenantPermissions:permissions,workspace:{tenantId:'r1',tenantType:'RESTAURANT',roleName:'Owner'}}
const suppliers=[{id:'s1',name:'Cedar Foods',product_count:1},{id:'s2',name:'Bekaa Produce',product_count:1}]
const product={id:'p1',supplier_id:'s1',supplier_name:'Cedar Foods',name:'Lebanese olive oil',sku:'OL-1',unit:'bottle',current_price:12,currency:'USD',available_qty:100,moq:2,order_multiple:2}
const invoice={id:'inv1',invoice_number:'INV-QA-2026',supplier_id:'s1',supplier_name:'Cedar Foods',restaurant_name:'QA Bistro',invoice_date:day,due_date:'2099-01-01',total_amount:120,total_paid:0,subtotal:120,balance_due:120,remaining_balance:120,currency:'USD',status:'ISSUED'}
const deals=suppliers.map((s,i)=>({id:'deal'+i,supplier_id:s.id,supplier_name:s.name,name:i?'Fresh produce offer':'Olive oil offer',description:'QA offer',type:'percentage_discount',discount_value:10,starts_at:new Date(Date.now()-86400000).toISOString(),ends_at:new Date(Date.now()+86400000*5).toISOString(),is_sponsored:false,status:'active'}))
const reservation={id:'res1',restaurant_id:'r1',customer_name:'A very long guest name to test card wrapping',customer_email:'qa@example.test',customer_phone:'+96170000000',party_size:4,status:'CONFIRMED',scheduled_at:`${day}T18:00:00Z`,duration_minutes:90,tables:['t1'],table_ids:['t1']}
const tables=[{id:'t1',name:'Terrace window',capacity:4,is_active:true,table_type:'round',position:{x:50,y:50,w:100,h:100}}]
const branches=[{branchId:'b1',branchName:'Beirut',deliveryEnabled:true,takeawayEnabled:true,dineInEnabled:true,minOrderAmount:0,deliveryFee:2,estimatedPrepMinutes:20,timeZone:'Asia/Beirut',ordering:{mode:'LIVE',allowAsap:true,allowPreorders:true,liveOrderStart:'00:00',liveOrderEnd:'24:00',allowPreordersOutsideLiveHours:true},deliveryZones:[]},{branchId:'b2',branchName:'Byblos',deliveryEnabled:false,takeawayEnabled:true,dineInEnabled:true,minOrderAmount:0,deliveryFee:0,estimatedPrepMinutes:20,deliveryZones:[]}]
const menuItem={id:'dish1',name:'Grilled halloumi with herbs',description:'Fresh Lebanese halloumi, garden greens and seasonal vegetables.',base_price:12,is_available:true,allergens:['milk'],dietary_tags:['vegetarian'],modifierGroups:[{id:'g1',name:'Choose a side',is_required:true,min_selections:1,max_selections:1,options:[{id:'o1',name:'Garden salad',price_delta:0},{id:'o2',name:'Fries',price_delta:1}]}]}
const member={id:'m1',username:'qa-guest',displayName:'QA Guest',loyaltyPoints:250}
const results=[]
async function prepare(page){
  await page.addInitScript(()=>{localStorage.setItem('i18nextLng','en')})
  if(page.routeWebSocket) await page.routeWebSocket(/socket\.io/,s=>s.close())
  page.checkoutRequests=[]
  page.expiredDeals=false
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url()), p=url.pathname
    if(/fonts\.google/.test(url.hostname)) return route.abort()
    if(!p.startsWith('/api/')&&!p.startsWith('/auth/'))return route.continue()
    let data={orders:[],notifications:[],suppliers:[],conversations:[],disputes:[],branches:[],items:[],stats:{},summary:{},products:[],quickLists:[],reservations:[],reviews:[],tables:[]}
    if(p.includes('/public/consumer/')&&p.endsWith('/orders')&&route.request().method()==='POST'){
      const body=route.request().postDataJSON();page.checkoutRequests.push(body)
      if(page.checkoutRequests.length===1)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:{name:'TEMPORARY_ERROR',message:'QA simulated interrupted checkout'}})})
      data={order:{id:'guest-order1',receipt_token:'receipt1',status:'RECEIVED'},receiptToken:'receipt1',lines:[]}
    }
    else if(p==='/auth/me')data=user
    else if(p.includes('register/status'))data={needsSetup:false}
    else if(p.includes('entitlements'))data={entitlements:{plan:{code:'restaurant_scale',name:'Scale'},features:Object.fromEntries(['supplier_deals','finance_invoices','api_integrations','reservations','inventory','receiving_quality','reports','advanced_reports','consumer_ordering','consumer_loyalty','quick_lists','smart_reorder','inventory_expiry','waitlist_auto_promo'].map(k=>[k,true])),limits:{},usage:{}}}
    else if(p.includes('invoices')&&p.endsWith('/pdf'))return route.fulfill({status:200,contentType:'application/pdf',body:Buffer.from('%PDF-1.4\nQA attachment\n%%EOF')})
    else if(p.endsWith('/invoices/inv1'))data={invoice,lineItems:[{id:'li1',description:'Lebanese olive oil',sku:'OL-1',quantity:10,unit_price:12,line_total:120}],payments:[],creditNotes:[]}
    else if(p.endsWith('/invoices'))data={invoices:[invoice],pagination:{total:1},suppliers}
    else if(p.endsWith('/products/p1'))data={product}
    else if(p.endsWith('/products/categories'))data={categories:[{id:'cat1',name:'Pantry'}]}
    else if(p.endsWith('/products/tags'))data={tags:['Organic','Lebanese']}
    else if(p==='/api/products')data={products:[product],pagination:{total:1}}
    else if(p==='/api/suppliers')data={suppliers}
    else if(p.endsWith('/promotions/active'))data={promotions:page.expiredDeals?[]:deals}
    else if(p.includes('new-deals-banner'))data=page.expiredDeals?{deals:[],summary:null}:{deals:deals.map(d=>({id:d.id,name:d.name,supplierName:d.supplier_name})),summary:{count:2,title:'2 new deals',supplierNames:['Cedar Foods','Bekaa Produce']}}
    else if(p.endsWith('/restaurants/me'))data={restaurant:{id:'r1',slug:'qa-bistro',name:'QA Bistro'}}
    else if(p.endsWith('/reservations/board'))data={date:day,reservations:[reservation],tables,waitlist:[],summary:{}}
    else if(p.endsWith('/public/restaurants/qa-bistro'))data={id:'r1',name:'QA Bistro',slug:'qa-bistro'}
    else if(p.includes('public/reservations/availability'))data={slots:[{startTime:`${day}T18:00:00Z`,endTime:`${day}T19:30:00Z`,capacityAvailable:16,isAvailable:true},{startTime:`${day}T18:30:00Z`,endTime:`${day}T20:00:00Z`,capacityAvailable:12,isAvailable:true}],totalCapacity:20}
    else if(p.includes('/public/consumer/')&&p.endsWith('/auth/me'))data={member,program:{enabled:true},recentLedger:[{id:'l1',entry_type:'EARN',points_delta:50,balance_after:250,created_at:new Date().toISOString()}],recentOrders:[]}
    else if(p.includes('/public/consumer/')&&p.endsWith('/menu'))data={restaurant:{id:'r1',name:'QA Bistro'},menu:{categories:[{id:'c1',name:'Garden kitchen',items:[menuItem]}]}}
    else if(p.includes('/public/consumer/')&&p.endsWith('/storefront'))data={restaurant:{id:'r1',name:'QA Bistro',slug:'qa-bistro'},branches}
    else if(p.includes('/public/consumer/')&&p.endsWith('/fulfillment-options'))data={restaurant:{id:'r1',name:'QA Bistro'},branches}
    else if(p.includes('/loyalty/preview'))data={preview:{programEnabled:false,memberBalance:250,earnPoints:0}}
    else if(p.includes('reorder-assistance'))data={suggestions:[{id:'stock-p1',productId:'p1',productName:product.name,productUnit:'bottle',supplierId:'s1',supplierName:'Cedar Foods',reasonCode:'low_stock',reasonLabel:'Low stock',urgency:'HIGH',suggestedQty:12,scopeType:'product',scopeId:'p1'}],forecasts:[],total:1,smartReorder:{capabilities:{}},ai:{canExplainLlm:false}}
    await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'http://127.0.0.1:5176','Access-Control-Allow-Credentials':'true'},body:JSON.stringify({ok:true,data,error:null})})
  })
}
for(const [engine,launcher] of [['webkit',webkit],['chromium',chromium]].filter(([name])=>!process.env.IPAD_BROWSER||process.env.IPAD_BROWSER===name)){
 let browser
 try {browser=await launcher.launch({headless:true,timeout:20000})}catch(e){results.push({engine,launchError:e.message});continue}
 try{
  const context=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true,isMobile:false,timezoneId:'Asia/Beirut',locale:'en-US',reducedMotion:'reduce',acceptDownloads:true})
  for(const [name,routePath] of [['invoices','/app/invoices'],['products','/app/products'],['product','/app/products/p1'],['deals','/app/deals'],['reports','/app/reports'],['reservations','/app/reservations'],['booking','/reserve/qa-bistro'],['menu','/order/qa-bistro/menu'],['rewards','/order/qa-bistro/rewards'],['inventory','/app/restaurant-inventory'],['checkout','/order/qa-bistro/checkout?branchId=b1']]){
   const page=await context.newPage();page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await prepare(page)
   try{
    if(name==='checkout')await page.addInitScript(()=>{localStorage.setItem('consumer-cart:qa-bistro',JSON.stringify([{cartKey:'dish1|o1|',menuItemId:'dish1',name:'Halloumi',unitPrice:12,quantity:1,modifierOptionIds:['o1']}]))})
    await page.goto('http://127.0.0.1:5176'+routePath)
    const ready = {
      invoices:()=>page.getByRole('button',{name:/view details|details|view invoice/i}).first(),
      products:()=>page.getByText('Lebanese olive oil',{exact:true}).first(),
      product:()=>page.getByLabel('Quantity',{exact:true}),
      deals:()=>page.getByText('Olive oil offer',{exact:true}),
      reports:()=>page.getByTestId('report-filters'),
      reservations:()=>page.getByRole('button',{name:'Seat',exact:true}).first(),
      booking:()=>page.getByRole('button',{name:/check availability/i}),
      menu:()=>page.getByText('Grilled halloumi with herbs',{exact:true}).first(),
      rewards:()=>page.getByRole('heading',{name:/rewards/i}).first(),
      inventory:()=>page.getByText('Reorder assistance',{exact:true}),
      checkout:()=>page.getByText(/Grilled halloumi with herbs/).first(),
    }
    await ready[name]().waitFor({timeout:25000})
    const text=await page.locator('body').innerText()
    for(const width of [768,1024,1194]){
      await page.setViewportSize({width,height:width===768?1024:834});await page.screenshot({path:path.join(out,`${engine}-${name}-${width}.png`),fullPage:true})
      const dimensions=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-window.innerWidth,controls:[...document.querySelectorAll('input[type=date],select')].map(n=>({id:n.id,type:n.type,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height}))}))
      results.push({engine,name,width,errors:[...errors],...dimensions,...(width===1024?{text:text.slice(0,1500)}:{})})
    }
    if(name==='invoices'){
      const details=page.getByRole('button',{name:/view details|details|view invoice/i}).first()
      await details.waitFor();await details.click();await page.getByText('Line Items',{exact:true}).waitFor();await page.screenshot({path:path.join(out,`${engine}-invoice-detail.png`),fullPage:true});const [download]=await Promise.all([page.waitForEvent('download',{timeout:8000}),page.getByRole('button',{name:'PDF',exact:true}).click()]);results.push({engine,name:'pdf-download',filename:download.suggestedFilename()});await page.getByRole('button',{name:/make payment/i}).first().click();await page.screenshot({path:path.join(out,`${engine}-payment.png`),fullPage:true})
    }
    if(name==='booking'){await page.getByRole('button',{name:/check availability/i}).click();await page.waitForTimeout(400);await page.screenshot({path:path.join(out,`${engine}-booking-slots.png`),fullPage:true})}
    if(name==='deals'){
      page.expiredDeals=true
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
      await expect(page.getByTestId('new-deals-banner')).toHaveCount(0)
      await expect(page.getByText('Olive oil offer',{exact:true})).toHaveCount(0)
      results.push({engine,name:'expired-deals-focus-refresh',passed:true})
    }
    if(name==='inventory'){
      await page.getByRole('link',{name:'Cart',exact:true}).last().click()
      await page.getByLabel('Quantity',{exact:true}).waitFor()
      await expect(page.getByLabel('Quantity',{exact:true})).toHaveValue('12')
      results.push({engine,name:'reorder-handoff',quantity:12})
    }
    if(name==='checkout'){
      await page.getByRole('button',{name:/place order/i}).click()
      await page.getByRole('button',{name:'Check and retry order',exact:true}).waitFor()
      await expect(page.locator('#guestName')).toBeDisabled()
      await page.getByRole('button',{name:'Check and retry order',exact:true}).click()
      await page.waitForURL('**/receipt/receipt1')
      if(page.checkoutRequests.length!==2||page.checkoutRequests[0].idempotencyKey!==page.checkoutRequests[1].idempotencyKey)throw new Error('Retry changed checkout key')
      results.push({engine,name:'checkout-retry',requests:2,sameKey:true})
    }
   }catch(e){results.push({engine,name,testError:e.message,errors,text:(await page.locator('body').innerText()).slice(0,1000)})}finally{await fs.writeFile(path.join(out,`${process.env.IPAD_BROWSER||'all'}-results.json`),JSON.stringify(results,null,2));await page.close()}
  }
 }finally{await browser.close()}
}
await fs.writeFile(path.join(out,`${process.env.IPAD_BROWSER||'all'}-results.json`),JSON.stringify(results,null,2))
console.log(JSON.stringify({cases:results.length,failures:results.filter(r=>r.launchError||r.testError||r.overflow>0||r.errors?.length),report:out}))
