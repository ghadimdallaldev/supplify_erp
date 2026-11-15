import subprocess, tarfile, io, shutil, hashlib, json, sys
from pathlib import Path

root=Path(__file__).resolve().parents[2]
name = sys.argv[1] if len(sys.argv) > 1 else 'pilot-2026-11-13'
if not name.startswith('pilot-') or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in name): raise ValueError('Invalid snapshot name')
target=root/'.release-checkouts'/name
if target.exists(): raise RuntimeError('Refusing to overwrite an existing source snapshot')
target.mkdir(parents=True)
paths=['apps/api','apps/web','deploy','vendor','scripts','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.dockerignore','.gitignore','.npmrc']
tracked=set(subprocess.check_output(['git','ls-files'],cwd=root,text=True).splitlines())
paths.extend(p for p in tracked if '/' not in p and p not in paths)
paths=[p for p in paths if p in tracked or any(t.startswith(p+'/') for t in tracked)]
archive=subprocess.check_output(['git','archive','HEAD',*paths],cwd=root)
with tarfile.open(fileobj=io.BytesIO(archive)) as stream: stream.extractall(target,filter='data')
changed=subprocess.check_output(['git','ls-files','--modified','--others','--exclude-standard','--','apps/api/src','apps/web/src','deploy/keycloak'],cwd=root,text=True).splitlines()
manifest={}
for name in changed:
    source=root/name
    if not source.is_file(): raise RuntimeError('Unexpected deleted source: '+name)
    destination=target/name
    destination.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(source,destination)
    manifest[name]=hashlib.sha256(source.read_bytes()).hexdigest()
(target/'.railwayignore').write_text('output/\nnode_modules/\n.git/\n.release-checkouts/\n')
evidence={'baseCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'sourceFiles':manifest,'snapshot':str(target)}
Path(__file__).with_name('preprod-source.json').write_text(json.dumps(evidence,indent=2))
print(json.dumps({'sourceFiles':len(manifest),'snapshot':str(target),'baseCommit':evidence['baseCommit']}))
