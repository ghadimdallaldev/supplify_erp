import json, subprocess, os, urllib.request, secrets, uuid
from pathlib import Path
base = ['railway.cmd','variables','--project','745872f2-9149-452f-99e9-9af97704705b','--environment','75074755-9b3b-4f18-9e48-6fa2957f1d8b','--service','c384fd8a-a6c5-4851-a2e8-623b7dbeba81','--json']
p = subprocess.run(base,capture_output=True,text=True,shell=True,timeout=60)
if p.returncode: raise RuntimeError('Unable to read runtime mail configuration')
settings = json.loads(p.stdout)
payload = json.dumps({'email':'ghadimdallaldev@outlook.com','code':str(secrets.randbelow(900000)+100000),'purpose':'login_email_mfa','locale':'en','challengeId':'pilot-mail-test-'+uuid.uuid4().hex}).encode()
request = urllib.request.Request('https://api.supplifyerp.com/api/internal/auth/otp/email', data=payload, headers={'Content-Type':'application/json','Authorization':'Bearer '+settings['AUTH_EMAIL_OTP_INTERNAL_SECRET']})
try:
    with urllib.request.urlopen(request,timeout=60) as response: print('production_otp_http',response.status,json.load(response))
except urllib.error.HTTPError as error:
    print('production_otp_http',error.code)
# Run the actual invitation renderer/transport with runtime env values, never a secrets file.
settings['SKIP_RAILWAY_ENV_FILE'] = '1'
result = subprocess.run(['node', str(Path(__file__).with_name('send-owned-email-test.mjs'))],env={**os.environ,**settings},timeout=90)
raise SystemExit(result.returncode)
