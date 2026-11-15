import {spawnSync} from 'node:child_process'
import {RESTAURANTS,DEMO_PASSWORD} from '../apps/api/scripts/seed/horeca-data.mjs'
export async function getDevSession(target='dev'){
 if(!['dev','preprod'].includes(target))throw new Error('Seeded authentication is restricted to non-production')
 const environment=target==='dev'?'31f40302-dfd1-4d8e-b25a-bdcc794174d7':'4914bd75-3288-459a-ae9a-4dcdf5593d49'
 const service=target==='dev'?'84b7bcdb-f5c9-4bfc-ac86-1ae9113672ce':'0efcfe8e-df71-4dd1-b2d5-5a81c88d2904'
 const r=spawnSync('railway.cmd',['variables','--project','745872f2-9149-452f-99e9-9af97704705b','--environment',environment,'--service',service,'--json'],{shell:true,windowsHide:true,encoding:'utf8'})
 if(r.status!==0)throw new Error('Development configuration unavailable')
 const vars=JSON.parse(r.stdout)
 if(vars.RAILWAY_ENVIRONMENT_ID!==environment||vars.APP_ENV!==target)throw new Error('Wrong environment')
 const restaurant=RESTAURANTS.find(r=>r.name==='Hamra Bistro')
 const base=vars.KEYCLOAK_PUBLIC_URL||vars.KEYCLOAK_URL
 if(new URL(base).hostname!==`keycloak-${target}.supplifyerp.com`)throw new Error('Wrong identity provider')
 const form=new URLSearchParams({grant_type:'password',client_id:vars.KEYCLOAK_CLIENT_ID,username:restaurant.owner.email,password:DEMO_PASSWORD})
 if(vars.KEYCLOAK_CLIENT_SECRET)form.set('client_secret',vars.KEYCLOAK_CLIENT_SECRET)
 const response=await fetch(`${base}/realms/${vars.KEYCLOAK_REALM}/protocol/openid-connect/token`,{method:'POST',body:form,signal:AbortSignal.timeout(20000)})
 const data=await response.json()
 if(!response.ok||!data.access_token)throw new Error(`Seeded ${target} authentication failed (${response.status}): ${data.error||'unknown'} - ${data.error_description||'No token issued'}`)
 return {token:data.access_token,refreshToken:data.refresh_token,restaurantName:restaurant.name,slug:'hamra-bistro',api:`https://api-${target}.supplifyerp.com`,web:`https://app-${target}.supplifyerp.com`}
}
