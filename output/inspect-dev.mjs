import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
const project='745872f2-9149-452f-99e9-9af97704705b', environment='31f40302-dfd1-4d8e-b25a-bdcc794174d7'
const folder=path.resolve('output/dev-verification-2026-11-14');await fs.mkdir(folder,{recursive:true})
const label=process.argv[2]||'before';if(!/^[a-z0-9-]+$/.test(label))throw new Error('Invalid evidence label')
function variables(service){const r=spawnSync('railway.cmd',['variables','--project',project,'--environment',environment,'--service',service,'--json'],{shell:true,windowsHide:true,encoding:'utf8'});if(r.status!==0)throw new Error('Unable to read development configuration');return JSON.parse(r.stdout)}
const pgVars=variables('671c3bc8-5572-4a73-a4f8-9a08f928bbaa')
const apiVars=variables('84b7bcdb-f5c9-4bfc-ac86-1ae9113672ce')
if(pgVars.RAILWAY_ENVIRONMENT_ID!==environment)throw new Error('Unexpected database environment')
const connection=new URL(pgVars.DATABASE_URL)
connection.hostname=pgVars.RAILWAY_TCP_PROXY_DOMAIN
connection.port=pgVars.RAILWAY_TCP_PROXY_PORT
if(connection.hostname!=='mainline.proxy.rlwy.net'||connection.port!=='55167')throw new Error('Unexpected development database proxy')
const url=connection.toString()
const {Pool}=createRequire(new URL('../apps/api/package.json',import.meta.url))('pg')
const pool=new Pool({connectionString:url,ssl:{rejectUnauthorized:false},max:1,connectionTimeoutMillis:15000,statement_timeout:20000})
const results={environment:'Development',apiEnvironment:apiVars.APP_ENV,webOrigin:apiVars.WEB_ORIGIN,keycloakUrl:apiVars.KEYCLOAK_PUBLIC_URL||apiVars.KEYCLOAK_URL,keycloakRealm:apiVars.KEYCLOAK_REALM}
try{
 const client=await pool.connect()
 try{
  await client.query('BEGIN READ ONLY')
  results.counts=(await client.query(`SELECT (SELECT COUNT(*)::int FROM restaurant) AS restaurants,(SELECT COUNT(*)::int FROM supplier) AS suppliers,(SELECT COUNT(*)::int FROM product) AS products,(SELECT COUNT(*)::int FROM invoice) AS invoices,(SELECT COUNT(*)::int FROM invoice_line_item) AS invoice_lines,(SELECT COUNT(*)::int FROM schema_migrations) AS migrations`)).rows[0]
  results.invoiceIntegrity=(await client.query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM invoice_line_item li WHERE li.invoice_id=i.id))::int AS without_lines,COUNT(*) FILTER(WHERE i.order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customer_order o WHERE o.id=i.order_id))::int AS missing_order FROM invoice i`)).rows[0]
  results.restaurants=(await client.query(`SELECT r.id,r.name,r.slug,(SELECT COUNT(*)::int FROM invoice i WHERE i.restaurant_id=r.id) AS invoices,(SELECT COUNT(*)::int FROM supplier_follow f WHERE f.restaurant_id=r.id) AS follows FROM restaurant r ORDER BY invoices DESC,r.name LIMIT 25`)).rows
  results.promotionCounts=(await client.query(`SELECT status,COUNT(*)::int AS count,COUNT(*) FILTER(WHERE starts_at<=NOW() AND (ends_at IS NULL OR ends_at>NOW()))::int AS in_date FROM promotions GROUP BY status ORDER BY status`)).rows
  results.reservationSetup=(await client.query(`SELECT r.name,r.slug,(SELECT COUNT(*)::int FROM reservation_table t WHERE t.restaurant_id=r.id) AS tables,(SELECT COUNT(*)::int FROM reservation t WHERE t.restaurant_id=r.id) AS reservations FROM restaurant r ORDER BY r.name`)).rows
  results.hasCheckoutMigration=(await client.query(`SELECT to_regclass('public.consumer_checkout_attempt') IS NOT NULL AS present`)).rows[0].present
  results.supportedInvoiceColumns=(await client.query(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND ((table_name='restaurant' AND column_name IN('contact_email','email','contact_name')) OR (table_name='app_user' AND column_name IN('name','display_name'))) ORDER BY table_name,column_name`)).rows
  await client.query('ROLLBACK')
 } finally{client.release()}
}finally{await pool.end()}
await fs.writeFile(path.join(folder,label+'.json'),JSON.stringify(results,null,2))
console.log(JSON.stringify(results))
