import subprocess, xml.etree.ElementTree as ET, re, time, json, shutil
from pathlib import Path
root=Path(__file__).parent
def adb(*args):
    return subprocess.check_output(['adb','-s','emulator-5554',*args],text=True,stderr=subprocess.STDOUT,timeout=30)
def hierarchy(name):
    adb('shell','uiautomator','dump','/sdcard/pilot-smoke.xml')
    path=root/name
    adb('pull','/sdcard/pilot-smoke.xml',str(path))
    return ET.parse(path).getroot()
def screenshot(name):
    adb('shell','screencap','-p','/sdcard/pilot-smoke.png')
    adb('pull','/sdcard/pilot-smoke.png',str(root/name))
nodes=hierarchy('android-final-start.xml')
screenshot('android-final-start.png')
signIn=next((n for n in nodes.iter('node') if n.get('text')=='Sign in'),None)
if signIn is None: raise RuntimeError('Native sign-in control missing')
bounds=[int(x) for x in re.findall(r'\d+',signIn.get('bounds'))]
adb('shell','input','tap',str((bounds[0]+bounds[2])//2),str((bounds[1]+bounds[3])//2))
time.sleep(4)
nodes=hierarchy('android-sso.xml')
texts=[n.get('text','') for n in nodes.iter('node')]
# Handle the browser's first-run account prompt only on this isolated emulator.
withoutAccount=next((n for n in nodes.iter('node') if n.get('text')=='Use without an account'),None)
if withoutAccount is not None:
    bounds=[int(x) for x in re.findall(r'\d+',withoutAccount.get('bounds'))]
    adb('shell','input','tap',str((bounds[0]+bounds[2])//2),str((bounds[1]+bounds[3])//2))
    time.sleep(3)
    nodes=hierarchy('android-sso.xml')
    texts=[n.get('text','') for n in nodes.iter('node')]
screenshot('android-sso.png')
report={'target':'API 35 emulator','buildVersionCode':27,'nativeSignInRendered':True,'keycloakHostVisible':any('keycloak.supplifyerp.com' in x for x in texts),'passwordInputVisible':any(n.get('password')=='true' for n in nodes.iter('node')),'authenticatedOrderFlowTested':False}
(root/'android-sso-evidence.json').write_text(json.dumps(report,indent=2))
cache=Path('C:/Users/ghadi.mdallal/AppData/Local/Temp/eas-cli-nodejs/eas-build-run-cache/69e55e43-93dc-4f9f-b424-b2a21e74e189_de477af2-8729-4411-84a8-534fa4e6d39f.apk')
shutil.copy2(cache,root/'supplify-pilot-1.1.0-27.apk')
print(json.dumps(report))
