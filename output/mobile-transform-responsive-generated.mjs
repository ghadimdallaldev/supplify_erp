import fs from'node:fs';import path from'node:path';import{createRequire}from'node:module';
const require=createRequire(import.meta.url),{chromium}=require('@playwright/test');
const source=fs.readFileSync('C:/myProjects/supplify_erp/output/mobile-transform-visual.mjs','utf8');
const shared=source.slice(source.indexOf('const orders='),source.indexOf('const browser='));
fs.writeFileSync('C:/myProjects/supplify_erp/output/mobile-transform-fixtures.mjs',shared+'\nexport { dataFor, orders };\n');
const {dataFor,orders}=await import('./mobile-transform-fixtures.mjs');
const output='C:/myProjects/supplify_erp/output/mobile-transformation/responsive';fs.mkdirSync(output,{recursive:true});
const params={OrderDetail:{orderId:orders[0].id},Catalog:{supplierId:'s1',supplierName:'Fresh Supply'},Receive:{orderId:orders[0].id},CreateDispute:{orderId:orders[0].id},DisputeDetail:{disputeId:'d1'},QuoteRequestDetail:{quoteRequestId:'q1'},QuoteResponse:{quoteRequestSupplierId:'qs1'},DealAnalytics:{dealId:'deal1',name:'Fixture deal'},ChatThread:{conversationId:'c1',title:'Fresh Supply'},MoreGroup:{title:'Operations',items:[{title:'Inventory',screen:'Inventory',icon:'layers-outline'}]},DriverStop:{orderId:orders[0].id},DeliveryProof:{orderId:orders[0].id,restaurantName:'Cedar Kitchen'},ProblemReport:{orderId:orders[0].id,restaurantName:'Cedar Kitchen'},Storefront:{idOrSlug:'fixture'},ConsumerOrderDetail:{orderId:orders[0].id},Receipt:{token:'fixture-token'}};
const browser=await chromium.launch({headless:true});const results=[];
try{for(const scenario of[{role:'RESTAURANT',width:360,locale:'en'},{role:'SUPPLIER',width:430,locale:'ar'},{role:'RESTAURANT',width:768,locale:'en'},{role:'SUPPLIER',width:1366,locale:'en'}]){
 const context=await browser.newContext({viewport:{width:scenario.width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],businessWrites=[],unmapped=new Set();
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('supplify_access_token','review.'+btoa(JSON.stringify({exp:Date.now()/1000+3600}))+'.only');localStorage.setItem('supplify_refresh_token','review-only');});
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname==='localhost'&&u.port==='8084')return r.continue();if(u.pathname.includes('socket.io'))return r.abort();let data=dataFor(u.pathname,scenario.role,scenario.locale);
 if(u.pathname==='/auth/me'&&scenario.role==='DRIVER')data={...data,role:'SUPPLIER'};
 if(u.pathname==='/api/public/features')data={mobile_public_shop:true};
 if(u.pathname.includes('/api/assistant/capabilities'))data={enabled:true,quotaRemaining:20,tools:['get_supplier_overview','get_orders','search_products']};
 if(u.pathname.includes('/api/assistant/conversations'))data={conversations:[],messages:[],hasMore:false};
 if(u.pathname.includes('/api/chat/')&&u.pathname.endsWith('/messages'))data={messages:[]};
 if(u.pathname==='/api/consumer/addresses')data={addresses:[]};
 if(u.pathname.startsWith('/api/public/orders/'))return r.fulfill({status:404,contentType:'application/json',body:JSON.stringify({ok:false,error:{name:'NOT_FOUND',message:'No fixture exists for this tracking token.'}})});
 if(u.pathname==='/api/account/deletion-status')data={canDelete:false,blockers:[{code:'ORG_OWNER_MUST_TRANSFER_OR_CLOSE',workspaceType:'RESTAURANT',organizationId:'fixture-org',organizationName:'Cedar Kitchen',message:'Transfer ownership before deleting this account.'}],retention:{deleted:['Profile'],anonymized:[],retained:['Orders','Invoices']}};
 if(u.pathname.startsWith('/api/reports/'))data=[];
 if(u.pathname==='/api/quote-requests')data={requests:[],pagination:{total:0,limit:20,offset:0}};
 if(u.pathname.startsWith('/api/quote-requests/'))return r.fulfill({status:404,contentType:'application/json',body:JSON.stringify({ok:false,error:{name:'NOT_FOUND',message:'No fixture exists for this request.'}})});
 if(u.pathname==='/api/supplier/deliveries/board')data={orders:[],stops:[],unassigned:[],summary:{total:0,delivered:0,pending:0},route:null};
 if(u.pathname.includes('/api/public/suppliers'))data={suppliers:[],products:[],categories:[]};
 if(!['GET','OPTIONS'].includes(r.request().method())){if(u.pathname.endsWith('/read'))return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{},error:null})});businessWrites.push(u.pathname);return r.fulfill({status:409,contentType:'application/json',body:JSON.stringify({ok:false,error:{name:'VISUAL_READ_ONLY',message:'Visual fixture writes are disabled.'}})});}
 if(!Object.keys(data).length)unmapped.add(u.pathname);return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data,error:null})});});
 await page.goto('http://localhost:8084',{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>globalThis.__r?.getModules&&[...globalThis.__r.getModules().values()].some(m=>m.publicModule?.exports?.navigationRef?.isReady()),{timeout:90000});await page.waitForTimeout(400);
 const tree=await page.evaluate(()=>{const ref=[...globalThis.__r.getModules().values()].find(m=>m.publicModule?.exports?.navigationRef).publicModule.exports.navigationRef;const state=ref.getRootState();return{root:state.routeNames,tabs:state.routes.find(r=>r.name==='Tabs')?.state?.routeNames??[]}});
 const routes=[...tree.tabs.map(name=>({name,tab:true})),...tree.root.filter(name=>name!=='Tabs').map(name=>({name,tab:false}))];
 for(const route of routes.filter(route=>['Home','Dashboard','Fulfillment','Orders','More','Shop','Catalog','Cart','Reservations','CreateReservation','Inventory','Invoices','Reports','Dispatch','Chat','ChatThread'].includes(route.name))){
  const ready=await page.evaluate(()=>[...globalThis.__r.getModules().values()].find(m=>m.publicModule?.exports?.navigationRef)?.publicModule.exports.navigationRef.getRootState());
  if(!ready){await page.reload();await page.waitForTimeout(500);}
  const before=errors.length;await page.evaluate(({route,params})=>{const ref=[...globalThis.__r.getModules().values()].find(m=>m.publicModule?.exports?.navigationRef).publicModule.exports.navigationRef;if(ref.getRootState().type==='stack')ref.dispatch({type:'POP_TO_TOP'});ref.navigate(route.tab?'Tabs':route.name,route.tab?{screen:route.name}:params)}, {route,params:params[route.name]});await page.waitForTimeout(220);const file=[scenario.role,scenario.width,scenario.locale,route.name].join('-')+'.png';await page.screenshot({path:path.join(output,file)});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||Array.from(document.querySelectorAll('[role="tab"]')).some(tab=>{const rect=tab.getBoundingClientRect();return rect.width>0&&(rect.bottom>innerHeight+1||rect.left< -1||rect.right>innerWidth+1)}));results.push({...scenario,route:route.name,errors:errors.slice(before),overflow,file,writes:[...businessWrites]});
  fs.writeFileSync(path.join(output,'unmapped-'+scenario.role+'-'+scenario.locale+'.json'),JSON.stringify([...unmapped],null,2));
 }
 fs.writeFileSync(path.join(output,'unmapped-'+scenario.role+'-'+scenario.locale+'.json'),JSON.stringify([...unmapped],null,2));await context.close();
}}
finally{await browser.close();fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));}
console.log(JSON.stringify({screens:results.length,runtimeErrors:results.filter(r=>r.errors.length).map(r=>({role:r.role,route:r.route,errors:r.errors})),overflow:results.filter(r=>r.overflow).map(r=>r.route),businessWrites:[...new Set(results.flatMap(r=>r.writes))]}));
if(results.some(r=>r.errors.length||r.overflow||r.writes.length))process.exitCode=1;
