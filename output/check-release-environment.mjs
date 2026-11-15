import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
const targets={
 dev:{id:'31f40302-dfd1-4d8e-b25a-bdcc794174d7',api:'84b7bcdb-f5c9-4bfc-ac86-1ae9113672ce',web:'e8158ff7-35dc-4f38-9163-6b94d14dd499',pg:'671c3bc8-5572-4a73-a4f8-9a08f928bbaa',suffix:'-dev',realm:'Supplify',deployEnv:'development',appEnv:'dev'},
 preprod:{id:'4914bd75-3288-459a-ae9a-4dcdf5593d49',api:'0efcfe8e-df71-4dd1-b2d5-5a81c88d2904',web:'9da0ec97-0e28-4c33-92f0-57182f7cd884',pg:'5a7454bf-1510-4f45-8f2f-24855ecc4315',suffix:'-preprod',realm:'supplify-preprod',deployEnv:'preprod',appEnv:'preprod'},
 prod:{id:'75074755-9b3b-4f18-9e48-6fa2957f1d8b',api:'c384fd8a-a6c5-4851-a2e8-623b7dbeba81',web:'7911e104-9093-472b-ab68-f29026b3d790',pg:'ee4799d5-2e8d-4892-b943-109745bb0637',suffix:'',realm:'supplify-prod',deployEnv:'production',appEnv:'prod'},
}
const name=process.argv[2],target=targets[name]
if(!target)throw new Error('Explicit environment required')
const project='745872f2-9149-452f-99e9-9af97704705b'
const readVariables=service=>{const r=spawnSync('railway.cmd',['variables','--project',project,'--environment',target.id,'--service',service,'--json'],{shell:true,windowsHide:true,encoding:'utf8'});if(r.status!==0)throw new Error('Configuration read failed');const value=JSON.parse(r.stdout);if(value.RAILWAY_ENVIRONMENT_ID!==target.id)throw new Error('Unexpected environment');return value}
const apiVars=readVariables(target.api), webVars=readVariables(target.web), pgVars=readVariables(target.pg)
if(apiVars.APP_ENV!==target.appEnv||apiVars.KEYCLOAK_REALM!==target.realm||(webVars.RAILWAY_DEPLOY_ENV||'development')!==target.deployEnv)throw new Error('Environment isolation/build settings mismatch')
const api=`https://api${target.suffix}.supplifyerp.com`,web=`https://app${target.suffix}.supplifyerp.com`,keycloak=`https://keycloak${target.suffix}.supplifyerp.com`
const result={environment:name,checkedAt:new Date().toISOString(),checks:[],configurationIsolated:true}
const entry=await fetch(web+'/auth/login?returnTo=%2Fapp',{redirect:'manual',signal:AbortSignal.timeout(45000)})
const location=entry.headers.get('location')
if(![302,303,307].includes(entry.status)||!location?.startsWith(`${keycloak}/realms/${target.realm}/`))throw new Error('Unexpected browser login redirect')
const form=await fetch(location,{signal:AbortSignal.timeout(45000)})
if(form.status!==200||!(await form.text()).includes('<form'))throw new Error('Browser login form unavailable')
result.checks.push({name:'browser-login-entry',status:entry.status},{name:'browser-login-form',status:form.status})
await Promise.all([['api-health',api+'/health'],['api-ready',api+'/ready'],['web-health',web+'/health'],['web-document',web+'/'],['realm-discovery',`${keycloak}/realms/${target.realm}/.well-known/openid-configuration`],['realm-jwks',`${keycloak}/realms/${target.realm}/protocol/openid-connect/certs`]].map(async([name,url])=>{
 const response=await fetch(url,{signal:AbortSignal.timeout(45000)})
 if(response.status!==200)throw new Error(`${name}: HTTP ${response.status}`)
 if(name==='realm-discovery'){const body=await response.json();if(body.issuer!==`${keycloak}/realms/${target.realm}`)throw new Error('Unexpected realm issuer')}
 if(name==='realm-jwks'){const body=await response.json();if(!body.keys?.length)throw new Error('No realm signing keys')}
 result.checks.push({name,status:response.status})
}))
const connection=new URL(pgVars.DATABASE_URL)
connection.hostname=pgVars.RAILWAY_TCP_PROXY_DOMAIN
connection.port=pgVars.RAILWAY_TCP_PROXY_PORT
if(!connection.hostname.endsWith('.proxy.rlwy.net')||!connection.port)throw new Error('Unexpected database proxy')
const {Pool}=createRequire(new URL('../apps/api/package.json',import.meta.url))('pg')
const pool=new Pool({connectionString:connection.toString(),ssl:{rejectUnauthorized:false},max:1,connectionTimeoutMillis:15000,statement_timeout:20000})
try{
 const client=await pool.connect()
 try{
  await client.query('BEGIN READ ONLY')
  const migrations=(await client.query('SELECT * FROM schema_migrations')).rows
  const tables=(await client.query("SELECT to_regclass('public.consumer_checkout_attempt') IS NOT NULL AS checkout_replay_present")).rows[0]
  const hasMigration=migrations.some(row=>Object.values(row).some(value=>String(value).includes('0232_consumer_checkout_idempotency')))
  if(!hasMigration||!tables.checkout_replay_present)throw new Error('Checkout migration missing')
  result.database={readOnly:true,migrationCount:migrations.length,checkoutMigration0232:true,checkoutReplayTable:true}
  await client.query('ROLLBACK')
 }finally{client.release()}
}finally{await pool.end()}
await fs.mkdir('output/all-env-release-2026-11-14',{recursive:true})
await fs.writeFile(`output/all-env-release-2026-11-14/${name}-verification.json`,JSON.stringify(result,null,2))
console.log(JSON.stringify(result))
