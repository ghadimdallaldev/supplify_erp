from pathlib import Path
exec(Path(__file__).with_name('inspect-backup-schema.py').read_text().split('result=query(')[0])
d=query('{ environment(id:"75074755-9b3b-4f18-9e48-6fa2957f1d8b") { volumeInstances { edges { node { id volumeId serviceId mountPath } } } } }')
report=[]
for edge in d['environment']['volumeInstances']['edges']:
    volume=edge['node']
    if volume['serviceId']!='ee4799d5-2e8d-4892-b943-109745bb0637': continue
    instance=volume['id']
    result=query('{ schedules:volumeInstanceBackupScheduleList(volumeInstanceId:"'+instance+'") { id kind cron retentionSeconds createdAt } backups:volumeInstanceBackupList(volumeInstanceId:"'+instance+'") { id createdAt expiresAt scheduleId name } }')
    report.append({**volume,**result})
Path(__file__).with_name('production-backup-schedule.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
