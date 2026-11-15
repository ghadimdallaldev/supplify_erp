from pathlib import Path
exec(Path(__file__).with_name('inspect-backup-schema.py').read_text().split('result=query(')[0])
d=query('{ __schema { mutationType { fields { name type { name kind ofType { name kind ofType { name kind } } } args { name type { name kind ofType { name kind } } } } } } kinds:__type(name:"VolumeInstanceBackupScheduleKind") { enumValues { name } } workflow:__type(name:"WorkflowId") { fields { name } } }')
d['mutations']=[f for f in d.pop('__schema')['mutationType']['fields'] if 'backup' in f['name'].lower() and ('create' in f['name'].lower() or 'schedule' in f['name'].lower())]
print(json.dumps(d))
