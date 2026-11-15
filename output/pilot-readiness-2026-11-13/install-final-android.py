import json, subprocess, time
from pathlib import Path
root=Path(__file__).parent
build='de477af2-8729-4411-84a8-534fa4e6d39f'
for attempt in range(30):
    p=subprocess.run(['eas.cmd','build:view',build,'--json'],cwd='C:/myProjects/supplify-mobile',capture_output=True,text=True,shell=True,timeout=60)
    if p.returncode: raise RuntimeError('Unable to inspect final APK build')
    raw=json.loads(p.stdout)
    data={k:raw.get(k) for k in ['id','status','platform','appVersion','appBuildVersion','createdAt','completedAt','artifacts','metrics']}
    (root/'android-final-build.json').write_text(json.dumps(data,indent=2))
    print(json.dumps({'status':data['status'],'build':data['appBuildVersion']}),flush=True)
    if data['status']=='FINISHED': break
    if data['status'] in ['ERRORED','CANCELED']: raise RuntimeError('Final Android build did not succeed')
    time.sleep(20)
else: raise RuntimeError('Final APK build still running; no install attempted')
with (root/'android-final-install.log').open('w') as log:
    result=subprocess.run(['eas.cmd','build:run','--platform','android','--id',build],cwd='C:/myProjects/supplify-mobile',stdout=log,stderr=subprocess.STDOUT,shell=True,timeout=900)
if result.returncode: raise RuntimeError('Final APK emulator installation failed')
p=subprocess.run(['adb','-s','emulator-5554','shell','dumpsys','package','com.supplify.mobile'],capture_output=True,text=True,timeout=15)
versions=[line.strip() for line in p.stdout.splitlines() if 'versionCode=' in line or 'versionName=' in line]
report={'buildId':build,'installed':True,'versions':versions,'target':'API 35 emulator'}
(root/'android-final-install.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report),flush=True)
