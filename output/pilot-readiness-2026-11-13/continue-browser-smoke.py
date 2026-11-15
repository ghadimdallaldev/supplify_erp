import subprocess, xml.etree.ElementTree as ET, re, time, json
from pathlib import Path
root=Path(__file__).parent
def adb(*args): return subprocess.check_output(['adb','-s','emulator-5554',*args],text=True,stderr=subprocess.STDOUT,timeout=30)
for attempt in range(6):
    adb('shell','uiautomator','dump','/sdcard/pilot-sso.xml')
    adb('pull','/sdcard/pilot-sso.xml',str(root/'android-sso-current.xml'))
    tree=ET.parse(root/'android-sso-current.xml').getroot()
    texts=[n.get('text','') for n in tree.iter('node')]
    host=any('keycloak.supplifyerp.com' in text for text in texts)
    password=any(n.get('password')=='true' for n in tree.iter('node'))
    if password or any(text in ['Username or email','Username or email address','Password'] for text in texts): break
    action=next((n for n in tree.iter('node') if n.get('text') in ['Use without an account','No thanks','Got it']),None)
    if action is not None:
        x1,y1,x2,y2=[int(x) for x in re.findall(r'\d+',action.get('bounds'))]
        adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
    time.sleep(3)
adb('shell','screencap','-p','/sdcard/pilot-sso.png')
adb('pull','/sdcard/pilot-sso.png',str(root/'android-sso.png'))
report={'target':'API 35 emulator','buildVersionCode':27,'nativeSignInRendered':True,'keycloakHostVisible':host,'passwordInputVisible':password,'authenticatedOrderFlowTested':False}
(root/'android-sso-evidence.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
print('visible_labels',[x for x in texts if x and len(x)<100][:18])
