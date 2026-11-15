import json, subprocess, urllib.request, urllib.parse
PROJECT = '745872f2-9149-452f-99e9-9af97704705b'
ENV = '75074755-9b3b-4f18-9e48-6fa2957f1d8b'
def variables(service):
    p = subprocess.run(['railway.cmd','variables','--project',PROJECT,'--environment',ENV,'--service',service,'--json'], capture_output=True,text=True,shell=True,timeout=60)
    if p.returncode: raise RuntimeError('Unable to read runtime configuration')
    return json.loads(p.stdout)
kc = variables('2745e741-1f54-4e31-846a-25d7790c26f4')
base = 'https://keycloak.supplifyerp.com'
form = urllib.parse.urlencode({'client_id':'admin-cli','grant_type':'password','username':kc['KEYCLOAK_ADMIN'],'password':kc['KEYCLOAK_ADMIN_PASSWORD']}).encode()
with urllib.request.urlopen(urllib.request.Request(base+'/realms/master/protocol/openid-connect/token',data=form),timeout=30) as response:
    token = json.load(response)['access_token']
headers = {'Authorization':'Bearer '+token}
def get(path):
    with urllib.request.urlopen(urllib.request.Request(base+path,headers=headers),timeout=30) as response: return json.load(response)
realm = get('/admin/realms/supplify-prod')
users = get('/admin/realms/supplify-prod/users?email='+urllib.parse.quote('ghadimdallaldev@outlook.com')+'&exact=true')
print(json.dumps({'matchingOwnedAccounts':len(users),'resetPasswordAllowed':realm.get('resetPasswordAllowed'),'smtpHost':realm.get('smtpServer',{}).get('host'),'smtpConfigured':bool(realm.get('smtpServer'))}))
if len(users) == 1:
    # Sends a recovery link only; no password or required actions are changed here.
    request = urllib.request.Request(base+'/admin/realms/supplify-prod/users/'+users[0]['id']+'/execute-actions-email', data=b'["UPDATE_PASSWORD"]', headers={**headers,'Content-Type':'application/json'}, method='PUT')
    with urllib.request.urlopen(request,timeout=60) as response: print('recovery_email_http_status',response.status)
