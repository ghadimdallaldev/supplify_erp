import sys
from pathlib import Path
exec(Path(__file__).with_name('inspect-backup-schema.py').read_text().split('result=query(')[0])
instance='9a8c9d28-373a-4ad5-a148-8886454d1b7c'
proposal={'volumeInstanceId':instance,'scheduleKinds':['DAILY','WEEKLY'],'createInitialBackup':True,'environment':'production','sourceService':'Postgres'}
if '--apply' not in sys.argv:
    print(json.dumps({'dryRun':True,**proposal}))
    raise SystemExit(0)
schedule=query('mutation { volumeInstanceBackupScheduleUpdate(kinds:[DAILY,WEEKLY], volumeInstanceId:"'+instance+'") }')
backup=query('mutation { volumeInstanceBackupCreate(name:"Pilot readiness 2026-11-13", volumeInstanceId:"'+instance+'") { workflowId } }')
Path(__file__).with_name('backup-configuration-result.json').write_text(json.dumps({'proposal':proposal,'schedule':schedule,'backup':backup},indent=2))
print(json.dumps({'schedule':schedule,'backup':backup}))
