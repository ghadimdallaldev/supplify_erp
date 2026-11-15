import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium,expect}=require('@playwright/test');
const {dataFor}=await import('./mobile-transform-fixtures.mjs');
const output=path.resolve('output/mobile-transformation/interactions');fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true});const results=[];
try{for(const width of [360,1024]){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],writes=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{localStorage.setItem('supplify_access_token','review.'+btoa(JSON.stringify({exp:Date.now()/1000+3600}))+'.only');localStorage.setItem('supplify_refresh_token','review-only');});
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='localhost'&&u.port==='8084')return route.continue();if(u.pathname.includes('socket.io'))return route.abort();if(!['GET','OPTIONS'].includes(route.request().method())){writes.push(u.pathname);return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({ok:false,error:{name:'READ_ONLY',message:'Fixture writes blocked'}})});}let data=dataFor(u.pathname,'RESTAURANT','en');if(u.pathname==='/api/public/features')data={mobile_public_shop:true};return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data,error:null})});});
 await page.goto('http://localhost:8084',{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>globalThis.__r?.getModules&&[...globalThis.__r.getModules().values()].some(m=>m.publicModule?.exports?.navigationRef?.isReady()),{timeout:90000});
 const navigate=async(name,params)=>{await page.evaluate(({name,params})=>{const ref=[...globalThis.__r.getModules().values()].find(m=>m.publicModule?.exports?.navigationRef).publicModule.exports.navigationRef;ref.navigate(name,params)},{name,params});await page.waitForTimeout(250);};
 await navigate('Tabs',{screen:'More'});
 const search=page.getByPlaceholder('Search tools and settings'),directory=search.locator('xpath=../../..');await search.fill('reserv');await expect(directory.getByText('Reservations',{exact:true})).toBeVisible();await expect(directory.getByText('Invoices',{exact:true})).toHaveCount(0);await search.fill('');
 await navigate('CreateReservation');
 const guest=page.getByPlaceholder('Guest name');await guest.fill('Review guest');
 const date=page.getByRole('textbox',{name:'Date',exact:true});await date.fill('2026-02-30');await expect(page.getByText('Use YYYY-MM-DD format.',{exact:true})).toBeVisible();await date.fill('2026-11-15');
 await page.getByRole('button',{name:'Choose date',exact:true}).click();await page.screenshot({path:path.join(output,`calendar-${width}.png`)});
 await page.getByRole('button',{name:'Tuesday, 17 November 2026',exact:true}).click();await expect(date).toHaveValue('2026-11-17');await expect(guest).toHaveValue('Review guest');
 await page.getByRole('button',{name:'Choose time',exact:true}).click();await page.getByRole('button',{name:'+',exact:true}).first().click();await page.getByRole('button',{name:'+',exact:true}).last().click();await page.screenshot({path:path.join(output,`time-${width}.png`)});await page.getByRole('button',{name:'Use time',exact:true}).click();await expect(page.getByRole('textbox',{name:'Time',exact:true})).toHaveValue('19:05');
 await page.evaluate(()=>{const runtime=[...globalThis.__r.getModules().values()].find(m=>m.publicModule?.exports?.setAppLocale&&m.publicModule?.exports?.getAppLocale).publicModule.exports;runtime.setAppLocale('ar');});
 await expect(page.locator('input').filter({visible:true}).first()).toHaveValue('Review guest');await expect(page.getByRole('button',{name:'اختر التاريخ',exact:true})).toBeVisible();await page.screenshot({path:path.join(output,`draft-ar-${width}.png`)});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 results.push({width,checks:['More search','invalid date feedback','calendar selection','time selection','reactive Arabic retains draft'],errors,writes,overflow});
 await context.close();
}}
finally{await browser.close();fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));}
console.log(JSON.stringify(results));if(results.some(r=>r.errors.length||r.writes.length||r.overflow))process.exitCode=1;
