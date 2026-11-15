import json, subprocess, urllib.request, urllib.error
base=['railway.cmd','variables','--project','745872f2-9149-452f-99e9-9af97704705b','--service','0efcfe8e-df71-4dd1-b2d5-5a81c88d2904','--environment','4914bd75-3288-459a-ae9a-4dcdf5593d49','--json']
p=subprocess.run(base,capture_output=True,text=True,shell=True,timeout=45)
settings=json.loads(p.stdout)
for route in ['otp','keycloak']:
    request=urllib.request.Request('https://api-preprod.supplifyerp.com/api/internal/auth/'+route+'/email',data=b'{}',headers={'Content-Type':'application/json','Authorization':'Bearer '+settings['AUTH_EMAIL_OTP_INTERNAL_SECRET']})
    try:
        with urllib.request.urlopen(request,timeout=20) as response: print(route,response.status,response.read().decode()[:500])
    except urllib.error.HTTPError as error: print(route,error.code,error.read().decode()[:500])
