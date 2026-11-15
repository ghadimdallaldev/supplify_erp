import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const script = fileURLToPath(import.meta.url)
const root = path.resolve(path.dirname(script),'..')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve,ms))
const docker = (args) => {
  const result = spawnSync('docker',args,{encoding:'utf8'})
  if (result.status) throw new Error(result.stderr || 'Docker failed')
  return result.stdout.trim()
}
if (process.argv[2] !== 'worker') {
  const name = `supplify-readonly-qa-${Date.now()}`
  let created = false
  try {
    docker(['run','--rm','-d','--name',name,'-e','POSTGRES_PASSWORD=readonly_qa_fixture','-e','POSTGRES_DB=supplify_readonly_qa','-p','127.0.0.1::5432','postgres:16-alpine'])
    created = true
    console.log(JSON.stringify({phase:'isolated-database-created',name}))
    const ports = JSON.parse(docker(['inspect','--format','{{json .NetworkSettings.Ports}}',name]))
    const port = ports['5432/tcp'][0].HostPort
    for (let i=0;i<40;i++) {
      if (spawnSync('docker',['exec',name,'pg_isready','-U','postgres'],{stdio:'ignore'}).status === 0) break
      await sleep(500)
    }
    const log = fs.openSync(path.join(root,'output/readonly-database.log'),'w')
    const env = {...process.env,NODE_ENV:'test',APP_ENV:'dev',RAILWAY_ENVIRONMENT_NAME:'readonly-qa',RAILWAY_DEPLOY_ENV:'readonly-qa',
      DATABASE_URL:`postgresql://postgres:readonly_qa_fixture@127.0.0.1:${port}/supplify_readonly_qa`,DATABASE_SSL:'false',DATABASE_SSL_REJECT_UNAUTHORIZED:'false',DATABASE_POOL_MAX:'3',
      REDIS_URL:'',REDIS_PUBLIC_URL:'',AI_ENABLED:'false',RUN_MIGRATIONS_ON_START:'false',SKIP_TENANT_ROLE_BACKFILL:'1',SKIP_SUPPLIER_ORG_MIGRATION:'1'}
    env.SUPPLIFY_DATABASE_URL=env.DATABASE_URL
    env.DATABASE_PRIVATE_URL=env.DATABASE_URL
    env.DATABASE_MIGRATION_URL=env.DATABASE_URL
    const child = spawn(process.execPath,[script,'worker'],{cwd:root,env,stdio:['ignore',log,log]})
    const status = await new Promise((resolve) => child.on('close',resolve))
    fs.closeSync(log)
    if (status) { console.log(fs.readFileSync(path.join(root,'output/readonly-database.log'),'utf8').split(/\r?\n/).slice(-20).join('\n')); throw new Error('Isolated database verification failed') }
    console.log(fs.readFileSync(path.join(root,'output/readonly-database-result.json'),'utf8'))
  } finally {
    if (created) { docker(['stop',name]); console.log(JSON.stringify({phase:'isolated-database-removed',name})) }
  }
} else {
  const expected = process.env.DATABASE_URL
  const {config} = await import('../apps/api/src/config/env.js')
  assert.equal(config.DATABASE_URL,expected,'Refuse any database URL override')
  assert.equal(config.DATABASE_MIGRATION_URL,expected,'Refuse any migration database URL override')
  assert.equal(new URL(expected).hostname,'127.0.0.1')
  assert.equal(new URL(expected).pathname,'/supplify_readonly_qa')
  assert.equal(config.REDIS_URL,'','Refuse shared Redis')
  const {query,pool} = await import('../apps/api/src/lib/db.js')
  const {disconnectCache} = await import('../apps/api/src/lib/cache.js')
  try {
    const {runFullStartupMigrations} = await import('../apps/api/src/lib/startup-migrations.js')
    await runFullStartupMigrations({force:true})
    const migrations = (await query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count
    const user=randomUUID(),restaurant=randomUUID(),supplier=randomUUID(),product=randomUUID(),a=randomUUID(),b=randomUUID(),order=randomUUID(),line=randomUUID(),report=randomUUID()
    async function insert(table,values) {
      const columns = (await query('SELECT column_name FROM information_schema.columns WHERE table_schema=\'public\' AND table_name=$1',[table])).rows.map((r) => r.column_name)
      const keys = Object.keys(values).filter((key) => columns.includes(key))
      await query(`INSERT INTO ${table} (${keys.map((key) => `"${key}"`).join(',')}) VALUES (${keys.map((_,i) => '$'+(i+1)).join(',')})`,keys.map((key) => values[key]))
    }
    await insert('app_user',{id:user,keycloak_sub:'readonly-fixture',email:'readonly-fixture@example.test',display_name:'Fixture',role:'RESTAURANT'})
    await insert('restaurant',{id:restaurant,name:'Fixture restaurant',slug:'readonly-fixture',contact_email:'fixture@example.test',timezone:'Asia/Beirut',owner_user_id:user})
    await insert('supplier',{id:supplier,name:'Fixture supplier',slug:'readonly-supplier',owner_user_id:user})
    await insert('branch',{id:a,tenant_id:restaurant,restaurant_id:restaurant,name:'A',code:'A'})
    await insert('branch',{id:b,tenant_id:restaurant,restaurant_id:restaurant,name:'B',code:'B'})
    await insert('product',{id:product,supplier_id:supplier,sku:'TOMATO',name:'Tomato',unit:'kg',brand:'Fixture'})
    await insert('price',{product_id:product,amount:2,currency:'USD'})
    await query('INSERT INTO product_inventory_settings (product_id,lead_time_days,moq,order_multiple) VALUES ($1,7,2,2) ON CONFLICT (product_id) DO UPDATE SET lead_time_days=7,moq=2,order_multiple=2',[product])
    await insert('restaurant_inventory',{restaurant_id:restaurant,product_id:product,quantity:5,low_stock_threshold:8})
    await insert('customer_order',{id:order,restaurant_id:restaurant,status:'ACKNOWLEDGED',total_amount:20,currency:'USD',placed_at:new Date(),requested_delivery_date:new Date(Date.now()+86400000).toISOString().slice(0,10)})
    await insert('order_item',{id:line,order_id:order,product_id:product,supplier_id:supplier,quantity:10,unit_price:2,line_total:20})
    await insert('receiving_report',{id:report,order_id:order,restaurant_id:restaurant,supplier_id:supplier,status:'PARTIAL'})
    await insert('receiving_line_item',{receiving_report_id:report,product_id:product,order_item_id:line,product_name:'Tomato',product_sku:'TOMATO',ordered_quantity:10,received_quantity:4,unit:'kg'})
    await query(`INSERT INTO inventory_movement_log (restaurant_id,product_id,branch_id,type,quantity,created_at)
      SELECT $1,$2,CASE WHEN n%2=0 THEN $3::uuid ELSE $4::uuid END,'SUBTRACT',2,
       (((now() AT TIME ZONE 'Asia/Beirut')::date - n) + time '12:00') AT TIME ZONE 'Asia/Beirut' FROM generate_series(1,30) n`,[restaurant,product,a,b])
    const {setTenantFeatureOverride} = await import('../apps/api/src/lib/feature-flags.js')
    await setTenantFeatureOverride(restaurant,'RESTAURANT','inventory_management',true,'isolated synthetic fixture',user)
    await setTenantFeatureOverride(restaurant,'RESTAURANT','smart_reorder',true,'isolated synthetic fixture',user)
    const {loadConsumptionHistory} = await import('../apps/api/src/services/reorder-forecast-data.service.js')
    const measured = await loadConsumptionHistory(restaurant)
    assert.equal(measured.length,1)
    assert.equal(measured[0].dailyUsage.reduce((total,row) => total+row.quantity,0),60)
    const {computeRestaurantForecasts} = await import('../apps/api/src/services/reorder-forecast.service.js')
    const computed = await computeRestaurantForecasts(restaurant,{featureValue:'full_90day_trends'})
    assert.equal(computed.forecasts.find((f) => f.branchId == null).forecastDailyUsage,2)
    assert(computed.forecasts.filter((f) => f.branchId != null).every((f) => f.forecastReorderQty == null))
    const {loadIncomingSupply} = await import('../apps/api/src/services/reorder-supply.service.js')
    const incoming = await loadIncomingSupply(restaurant,[product])
    assert.equal(incoming.known,true)
    assert.equal(incoming.products.get(product).confirmed,6)
    const {getReorderAssistance} = await import('../apps/api/src/services/restaurant-reorder-assistance.service.js')
    const guidance = await getReorderAssistance(restaurant,{smartReorderFeatureValue:'full_90day_trends'})
    const row = guidance.suggestions.find((s) => s.productId === product)
    assert.equal(row.incomingQty,6)
    assert.equal(row.netNeed,31)
    assert.equal(row.suggestedQty,32)
    assert.equal(row.action,'order')
    const {executeAssistantTool} = await import('../apps/api/src/services/assistant-tools/index.js')
    const ctx={userId:user,tenantId:restaurant,tenantType:'RESTAURANT',roles:['Owner'],permissions:['INVENTORY_VIEW','ORDERS_VIEW','CATALOG_VIEW','RESERVATIONS_VIEW']}
    const answer = await executeAssistantTool(ctx,'get_reorder_need',{})
    assert.equal(answer.suggestions.find((s) => s.productId === product).suggestedQty,row.suggestedQty)
    for (const [currency,amount,status] of [['LBP',100000,'PLACED'],['USD',999,'CANCELLED']]) {
      const id=randomUUID(); await insert('customer_order',{id,restaurant_id:restaurant,status,currency,total_amount:amount,placed_at:new Date()})
      await insert('order_item',{order_id:id,product_id:product,supplier_id:supplier,quantity:1,unit_price:amount,line_total:amount})
    }
    const overview=await executeAssistantTool(ctx,'get_account_overview',{})
    assert.equal(overview.ordersByCurrency.length,2)
    assert.equal(Number(overview.ordersByCurrency.find((r) => r.currency === 'USD').spendLast30Days),20)
    const {createReadTools} = await import('../apps/api/src/services/assistant-tools/read-tools.js')
    const tools=createReadTools({can:()=>true})
    const supplierSummary=await tools.get_supplier_overview.run({...ctx,tenantId:supplier,tenantType:'SUPPLIER'},{})
    assert.equal(supplierSummary.currencies.length,2)
    await insert('supplier_follow',{restaurant_id:restaurant,supplier_id:supplier})
    assert.equal((await tools.search_products.run(ctx,{search:'Tomato'})).products.length,1)
    const day=new Date(Date.now()+86400000).toISOString().slice(0,10)
    await insert('reservation_table',{restaurant_id:restaurant,name:'Table 1',capacity:4,is_active:true})
    await insert('reservation',{restaurant_id:restaurant,customer_name:'Fixture guest',party_size:2,scheduled_at:day+'T12:00:00Z',duration_minutes:90,status:'CONFIRMED'})
    assert.equal((await tools.get_reservations.run(ctx,{date:day})).summary[0].covers,2)
    assert.equal((await tools.get_reservation_availability.run(ctx,{date:day,partySize:2})).tableCount,1)
    // An order with two lines is one timing observation, not two.
    const cadenceRestaurant=randomUUID()
    await insert('restaurant',{id:cadenceRestaurant,name:'Cadence fixture',slug:'cadence-fixture',owner_user_id:user})
    for (const daysAgo of [40,30]) {
      const historicalOrder=randomUUID()
      await insert('customer_order',{id:historicalOrder,restaurant_id:cadenceRestaurant,status:'DELIVERED',currency:'USD',total_amount:4,placed_at:new Date(Date.now()-daysAgo*86400000)})
      for (let n=0;n<(daysAgo===40 ? 2 : 1);n++) {
        await insert('order_item',{order_id:historicalOrder,product_id:product,supplier_id:supplier,quantity:1,unit_price:2,line_total:2})
      }
    }
    const {getReorderIntelligence}=await import('../apps/api/src/services/supplier-reorder-intelligence.service.js')
    const cadence=(await getReorderIntelligence(supplier)).customersAtRisk.find((customer)=>customer.restaurantId===cadenceRestaurant)
    assert.equal(cadence.orderCount,2)
    assert.equal(cadence.avgDaysBetween,10)
    assert.equal(cadence.dataQuality,'poor')
    const result={database:'isolated synthetic PostgreSQL 16',migrations,checks:13,incomingRemaining:6,netNeed:31,roundedPurchase:32,assistantMatchesPanel:true,currencyIsolation:true,branchStockIsolation:true,supplierCadenceDistinctOrders:true}
    fs.writeFileSync(path.join(root,'output/readonly-database-result.json'),JSON.stringify(result,null,2))
  } finally { await disconnectCache(); await pool.end() }
  process.exit(0)
}
