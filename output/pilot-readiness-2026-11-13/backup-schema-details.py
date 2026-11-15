from pathlib import Path
exec(Path(__file__).with_name('inspect-backup-schema.py').read_text().split('result=query(')[0])
q='{ environment:__type(name:"Environment") { fields { name args { name type { name ofType { name } } } type { name kind ofType { name kind ofType { name kind } } } } } backup:__type(name:"VolumeInstanceBackup") { fields { name type { name ofType { name } } } } schedule:__type(name:"VolumeInstanceBackupSchedule") { fields { name type { name ofType { name } } } } }'
d=query(q)
d['environment']['fields']=[f for f in d['environment']['fields'] if 'volume' in f['name'].lower()]
print(json.dumps(d))
