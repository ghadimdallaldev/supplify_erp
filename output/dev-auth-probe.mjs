import {spawnSync} from 'node:child_process'
import fs from 'node:fs/promises'
import {RESTAURANTS,DEMO_PASSWORD} from '../apps/api/scripts/seed/horeca-data.mjs'
const env='31f40302-dfd1-4d8e-b25a-bdcc794174d7'
const r=spawnSync('railway.cmd',['variables','--project','745872f2-9149-452f-99e9-9af97704705b','--environment',env,'--service','84b7bcdb-f5c9-4bfc-ac86-1ae9113672ce','--json'],{shell:true,windowsHide:true,encoding:'utf8'})
if(r.status!==0)throw new Error('Development configuration unavailable')
const vars=JSON.parse(r.stdout)
if(vars.RAILWAY_ENVIRONMENT_ID!==env||vars.APP_ENV!=='dev')throw new Error('Wrong environment')
const restaurant=RESTAURANTS.find(r=>r.name==='Hamra Bistro')
if(!restaurant?.owner?.email)throw new Error('Seeded restaurant account not found in source')
const base=vars.KEYCLOAK_PUBLIC_URL||vars.KEYCLOAK_URL
if(new URL(base).hostname!=='keycloak-dev.supplifyerp.com')throw new Error('Wrong identity provider')
const form=new URLSearchParams({grant_type:'password',client_id:vars.KEYCLOAK_CLIENT_ID,username:restaurant.owner.email,password:DEMO_PASSWORD})
if(vars.KEYCLOAK_CLIENT_SECRET)form.set('client_secret',vars.KEYCLOAK_CLIENT_SECRET)
const response=await fetch(`${base}/realms/${vars.KEYCLOAK_REALM}/protocol/openid-connect/token`,{method:'POST',body:form,signal:AbortSignal.timeout(20000)})
const body=await response.json()
const result={environment:'Development',restaurant:restaurant.name,grantStatus:response.status,authenticated:Boolean(body.access_token),error:body.error,errorDescription:body.error_description}
if(body.access_token){
 const user=await fetch('https://api-dev.supplifyerp.com/auth/me',{headers:{Authorization:`Bearer ${body.access_token}`,'X-Requested-With':'Supplify'},signal:AbortSignal.timeout(20000)})
 const data=await user.json();result.meStatus=user.status;result.role=data.data?.role;result.workspace=data.data?.workspace?.tenantId;result.userId=data.data?.id
}
await fs.writeFile('output/dev-verification-2026-11-14/auth-probe.json',JSON.stringify(result,null,2))
console.log(JSON.stringify(result))
