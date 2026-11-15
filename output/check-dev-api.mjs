import fs from 'node:fs/promises'
import {getDevSession} from './dev-session.mjs'
const label=process.argv[2]||'before';if(!/^[a-z0-9-]+$/.test(label))throw new Error('Invalid evidence label')
const target=process.argv[3]||'dev'
const session=await getDevSession(target)
const results={environment:target,restaurant:session.restaurantName,checkedAt:new Date().toISOString(),checks:[]}
async function request(name,path,binary=false){
 const response=await fetch(session.api+path,{headers:{Authorization:`Bearer ${session.token}`,'X-Requested-With':'Supplify'},signal:AbortSignal.timeout(30000)})
 const result={name,status:response.status}
 if(binary){const bytes=new Uint8Array(await response.arrayBuffer());result.bytes=bytes.length;result.pdf=new TextDecoder().decode(bytes.slice(0,4))==='%PDF';results.checks.push(result);return null}
 const body=await response.json();const data=body.data
 if(!response.ok)result.error=body.error?.name
 results.checks.push(result);return {data,result}
}
const me=await request('session','/auth/me');if(me.result.status!==200||me.data.role!=='RESTAURANT')throw new Error('Development restaurant session unavailable')
results.restaurantId=me.data.workspace?.tenantId
await request('health','/health');await request('ready','/ready')
const invoices=await request('invoices','/api/restaurant-finance/invoices?limit=5');invoices.result.count=invoices.data?.invoices?.length
const invoice=invoices.data?.invoices?.[0]
if(invoice){const detail=await request('invoice-detail',`/api/restaurant-finance/invoices/${invoice.id}`);detail.result.invoicePresent=Boolean(detail.data?.invoice);detail.result.lineItems=detail.data?.lineItems?.length;await request('invoice-pdf',`/api/invoices/${invoice.id}/pdf`,true)}
const products=await request('products','/api/products?limit=5');products.result.count=products.data?.products?.length
if(products.data?.products?.[0]){const detail=await request('product-detail',`/api/products/${products.data.products[0].id}`);detail.result.productPresent=Boolean(detail.data?.product)}
const deals=await request('deals','/api/promotions/active');deals.result.count=deals.data?.promotions?.length;results.supplierChoices=[...new Set((deals.data?.promotions||[]).map(p=>p.supplier_name).filter(Boolean))]
for(const [kind,sponsored] of [['organic',false],['sponsored',true]]){
 const deal=(deals.data?.promotions||[]).find(deal=>Boolean(deal.is_sponsored)===sponsored)
 if(deal){const detail=await request(`${kind}-deal-detail`,`/api/promotions/${deal.id}/detail`);detail.result.dealPresent=Boolean(detail.data?.deal)}
}
const banner=await request('deals-banner','/api/promotions/new-deals-banner');banner.result.count=banner.data?.summary?.count||0
results.bannerDealsDiscoverable=(banner.data?.deals||[]).every(deal=>(deals.data?.promotions||[]).some(p=>p.id===deal.id))
const reorder=await request('reorder-assistance','/api/restaurant-inventory/reorder-assistance');reorder.result.count=reorder.data?.suggestions?.length
const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Beirut'})
const board=await request('reservation-board',`/api/reservations/board?date=${day}`);board.result.reservations=board.data?.reservations?.length;board.result.tables=board.data?.tables?.length
const availability=await request('public-availability',`/api/public/reservations/availability?restaurantId=${results.restaurantId}&partySize=2&date=${day}`);availability.result.slots=availability.data?.slots?.length;availability.result.availableSlots=availability.data?.slots?.filter(s=>s.isAvailable).length
const storefront=await request('guest-storefront',`/api/public/consumer/${session.slug}/storefront`);storefront.result.branches=storefront.data?.branches?.length
const branch=storefront.data?.branches?.[0]?.branchId
const menu=await request('guest-menu',`/api/public/consumer/${session.slug}/menu${branch?`?branchId=${encodeURIComponent(branch)}`:''}`);menu.result.items=menu.data?.menu?.categories?.reduce((sum,c)=>sum+(c.items?.length||0),0)
const guest=await request('guest-rewards-program',`/api/public/consumer/${session.slug}/auth/me`);guest.result.programEnabled=guest.data?.program?.enabled
await fs.writeFile(target==='dev'?`output/dev-verification-2026-11-14/api-${label}.json`:`output/all-env-release-2026-11-14/${target}-functional-${label}.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results))
if(results.checks.some(check=>check.status!==200))process.exitCode=1
