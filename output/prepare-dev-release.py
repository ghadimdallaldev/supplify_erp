import subprocess,tarfile,io,shutil,hashlib,json,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
release_name=sys.argv[1] if len(sys.argv)>1 else 'dev-ipad-2026-11-14'
if not release_name.startswith('dev-ipad-') or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in release_name):raise RuntimeError('Invalid release name')
target=root/'.release-checkouts'/release_name
if target.exists():raise RuntimeError('Refusing to overwrite a release snapshot')
target.mkdir(parents=True)
tracked=set(subprocess.check_output(['git','ls-files'],cwd=root,text=True).splitlines())
paths=['apps/api','apps/web','deploy/railway','vendor','scripts']
paths.extend(p for p in tracked if '/' not in p)
archive=subprocess.check_output(['git','archive','HEAD',*paths],cwd=root)
with tarfile.open(fileobj=io.BytesIO(archive)) as stream:stream.extractall(target,filter='data')
changed=subprocess.check_output(['git','ls-files','--modified','--others','--exclude-standard','--','apps/api/src','apps/api/db/migrations','apps/web/src'],cwd=root,text=True).splitlines()
manifest={}
for name in changed:
 source=root/name
 if not source.is_file():raise RuntimeError('Unexpected source deletion: '+name)
 if source.suffix not in ['.js','.jsx','.ts','.tsx','.json','.css','.sql']:raise RuntimeError('Unexpected source extension: '+name)
 destination=target/name;destination.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,destination)
 manifest[name]=hashlib.sha256(source.read_bytes()).hexdigest()
for required in ['legal-pack-version.json','apps/api/db/migrations/0232_consumer_checkout_idempotency.sql','apps/web/src/lib/guestCheckoutKey.ts','apps/api/src/lib/product-supplier-access.js']:
 if not (target/required).is_file():raise RuntimeError('Required release file missing: '+required)
(target/'.railwayignore').write_text('output/\nnode_modules/\n.git/\n.release-checkouts/\n')
evidence={'baseCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'sourceFiles':manifest,'snapshot':str(target),'environmentId':'31f40302-dfd1-4d8e-b25a-bdcc794174d7','rollback':{'api':'aa88b335-0097-403a-9b68-127671bea80d','web':'295157a4-7173-44e7-8144-564950181e6f'}}
folder=root/'output/dev-verification-2026-11-14';folder.mkdir(parents=True,exist_ok=True)
(folder/'release-source.json').write_text(json.dumps(evidence,indent=2))
(folder/(release_name+'-source.json')).write_text(json.dumps(evidence,indent=2))
print(json.dumps({'snapshot':str(target),'changedSourceFiles':len(manifest),'baseCommit':evidence['baseCommit'],'includesMigration0232':True,'includesLocalSecrets':False}))
