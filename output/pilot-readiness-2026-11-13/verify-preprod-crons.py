import json, subprocess, re, urllib.request
from pathlib import Path
p=subprocess.run(['railway.cmd','logs','8e0c944f-cf3e-4f06-a4af-29f4e3f2a4b3','--project','745872f2-9149-452f-99e9-9af97704705b','--service','0efcfe8e-df71-4dd1-b2d5-5a81c88d2904','--environment','4914bd75-3288-459a-ae9a-4dcdf5593d49','--lines','1200','--json'],capture_output=True,text=True,shell=True,timeout=50)
if p.returncode: raise RuntimeError('Unable to read preproduction runtime logs')
events=[]
for line in p.stdout.splitlines():
    try: entry=json.loads(line)
    except ValueError: continue
    attrs=entry.get('attributes',{})
    if isinstance(attrs,dict): entry={**entry,**attrs}
    if entry.get('event') in ['cron.completed','cron.failed']:
        events.append({k:entry.get(k) for k in ['timestamp','time','event','job','durationMs']})
health={}
for path in ['health','ready']:
    with urllib.request.urlopen('https://api-preprod.supplifyerp.com/'+path,timeout=20) as response: health[path]={'http':response.status,'body':json.load(response)}
report={'deployment':'8e0c944f-cf3e-4f06-a4af-29f4e3f2a4b3','health':health,'events':events,'completedJobs':sorted(set(x['job'] for x in events if x['event']=='cron.completed')),'failureCount':sum(x['event']=='cron.failed' for x in events)}
Path(__file__).with_name('preprod-crons.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'health':health,'completedJobs':report['completedJobs'],'failureCount':report['failureCount'],'eventCount':len(events)}))
