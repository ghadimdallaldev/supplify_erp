import json, subprocess, urllib.request, urllib.parse, uuid, sys
from pathlib import Path
preprod = '--preprod' in sys.argv
env = '4914bd75-3288-459a-ae9a-4dcdf5593d49' if preprod else '75074755-9b3b-4f18-9e48-6fa2957f1d8b'
base = ['railway.cmd','variables','--project','745872f2-9149-452f-99e9-9af97704705b','--environment',env,'--json']
def variables(service):
    p = subprocess.run(base+['--service',service],capture_output=True,text=True,shell=True,timeout=60)
    if p.returncode: raise RuntimeError('Unable to read runtime settings')
    return json.loads(p.stdout)
kc = variables('7d24dab5-57f4-4dbf-9609-12b3b2b29ba2' if preprod else '2745e741-1f54-4e31-846a-25d7790c26f4')
api = variables('0efcfe8e-df71-4dd1-b2d5-5a81c88d2904' if preprod else 'c384fd8a-a6c5-4851-a2e8-623b7dbeba81')
origin = 'https://keycloak-preprod.supplifyerp.com' if preprod else 'https://keycloak.supplifyerp.com'
realmPath = '/admin/realms/supplify-preprod' if preprod else '/admin/realms/supplify-prod'
form = urllib.parse.urlencode({'client_id':'admin-cli','grant_type':'password','username':kc['KEYCLOAK_ADMIN'],'password':kc['KEYCLOAK_ADMIN_PASSWORD']}).encode()
with urllib.request.urlopen(urllib.request.Request(origin+'/realms/master/protocol/openid-connect/token',data=form),timeout=20) as response: token=json.load(response)['access_token']
def call(path, method='GET', body=None, timeout=30):
    request=urllib.request.Request(origin+path,data=json.dumps(body).encode() if body is not None else None,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method=method)
    with urllib.request.urlopen(request,timeout=timeout) as response:
        data=response.read()
        return json.loads(data) if data else {'httpStatus':response.status}
realm = call(realmPath)
original = realm.get('smtpServer',{})
smtp = {
    'from': api.get('EMAIL_FROM_AUTH') or api.get('EMAIL_FROM_ADDRESS') or api.get('SMTP_FROM'),
    'fromDisplayName': api.get('EMAIL_FROM_NAME','Supplify'),
}
username = 'pilot-recovery-' + uuid.uuid4().hex[:12]
userId = None
created = False
report = {'test':'Keycloak password recovery', 'environment':'preprod' if preprod else 'production', 'transport':'supplify-http'}
try:
    call(realmPath,'PUT',{'smtpServer':smtp})
    report['phase']='find_owned_account'
    users=call(realmPath+'/users?email=ghadimdallaldev%40outlook.com&exact=true')
    if not users:
        report['phase']='create_temporary_account'
        call(realmPath+'/users','POST',{'username':username,'email':'ghadimdallaldev@outlook.com','enabled':True,'emailVerified':False,'firstName':'Pilot','lastName':'Recovery Test'})
        created=True
        users = call(realmPath+'/users?username='+username+'&exact=true')
    if len(users)!=1: raise RuntimeError('Could not identify the temporary recovery account')
    userId=users[0]['id']
    report['phase']='send_recovery'
    call(realmPath+'/users/'+userId+'/execute-actions-email?lifespan=300','PUT',['UPDATE_PASSWORD'],timeout=40)
    report['mailRequest']='accepted'
    report['smtpConfiguration']='applied'
except Exception as error:
    # Restore the exact prior SMTP configuration after an unsuccessful diagnostic.
    call(realmPath,'PUT',{'smtpServer':original})
    report['mailRequest']='failed'
    report['smtpConfiguration']='rolled back'
    report['error']=type(error).__name__
    if isinstance(error, urllib.error.HTTPError):
        report['httpStatus']=error.code
        report['errorBody']=error.read().decode()[:500]
finally:
    if userId and created:
        call(realmPath+'/users/'+userId,'DELETE')
        report['temporaryAccountRemoved']=True
    Path(__file__).with_name('recovery-preprod-evidence.json' if preprod else 'recovery-evidence.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report))
