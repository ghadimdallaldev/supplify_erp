import json, subprocess, time, uuid, urllib.parse
from pathlib import Path

PROJECT = '745872f2-9149-452f-99e9-9af97704705b'
ENV = '75074755-9b3b-4f18-9e48-6fa2957f1d8b'
DB_SERVICE = 'ee4799d5-2e8d-4892-b943-109745bb0637'

def variables(service):
    p = subprocess.run(['railway.cmd', 'variables', '--project', PROJECT, '--environment', ENV, '--service', service, '--json'], capture_output=True, text=True, shell=True, timeout=60)
    if p.returncode: raise RuntimeError('Unable to read Railway connection settings')
    return json.loads(p.stdout)

def docker(args, data=None):
    p = subprocess.run(['docker', *args], input=data.encode() if data is not None else None, capture_output=True, timeout=600)
    if p.returncode:
        # Credentials never appear in command arguments or diagnostic output.
        raise RuntimeError('Docker operation failed: ' + p.stderr.decode(errors='replace')[-1200:])
    return p.stdout.decode().strip()

settings = variables(DB_SERVICE)
url = urllib.parse.urlparse(settings['DATABASE_PUBLIC_URL'])
container = 'supplify-pilot-restore-' + uuid.uuid4().hex[:10]
report = {'source': 'Railway production logical snapshot', 'startedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'databases': []}
started = time.monotonic()
try:
    docker(['run', '-d', '--name', container, '--label', 'supplify.task=pilot-restore-2026-11-13', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:18'])
    for _ in range(30):
        p = subprocess.run(['docker', 'exec', container, 'pg_isready', '-U', 'postgres'], capture_output=True)
        if p.returncode == 0: break
        time.sleep(1)
    user = urllib.parse.unquote(url.username)
    password = urllib.parse.unquote(url.password)
    remote = ['-h', url.hostname, '-p', str(url.port), '-U', user]
    dbs = docker(['exec', '-i', container, 'sh', '-c', 'read -r PGPASSWORD; export PGPASSWORD; exec psql "$@"', 'sh', *remote, '-d', url.path.lstrip('/'), '-Atc', "SELECT datname FROM pg_database WHERE datname NOT IN ('postgres','template0','template1') ORDER BY datname"], password + '\n').splitlines()
    # Only the application and Keycloak DBs are relevant; fail closed on surprises.
    for source in dbs:
        if source not in ('supplify', 'keycloak', url.path.lstrip('/')): continue
        target = 'drill_' + source.replace('-', '_')
        dump = '/tmp/' + target + '.dump'
        source_version = docker(['exec', '-i', container, 'sh', '-c', 'read -r PGPASSWORD; export PGPASSWORD; exec psql "$@"', 'sh', *remote, '-d', source, '-Atc', 'SHOW server_version'], password + '\n')
        docker(['exec', '-i', container, 'sh', '-c', 'read -r PGPASSWORD; export PGPASSWORD; exec pg_dump "$@"', 'sh', *remote, '-d', source, '-Fc', '--no-owner', '--no-acl', '-f', dump], password + '\n')
        docker(['exec', container, 'createdb', '-U', 'postgres', target])
        docker(['exec', container, 'pg_restore', '-U', 'postgres', '-d', target, '--exit-on-error', '--no-owner', '--no-acl', dump])
        tables = docker(['exec', container, 'psql', '-U', 'postgres', '-d', target, '-Atc', "SELECT table_schema || '.' || table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_type='BASE TABLE' ORDER BY 1"]).splitlines()
        checks = {}
        for table in ['public.schema_migrations', 'public.app_user', 'public.customer_order', 'public.realm', 'public.user_entity']:
            if table in tables:
                checks[table] = int(docker(['exec', container, 'psql', '-U', 'postgres', '-d', target, '-Atc', 'SELECT count(*) FROM ' + table]))
        report['databases'].append({'sourceDatabase': source, 'sourceVersion': source_version, 'restoredTableCount': len(tables), 'checks': checks, 'restore': 'passed'})
    if not any(x['sourceDatabase'] == 'keycloak' for x in report['databases']):
        raise RuntimeError('Keycloak database was not included in the restore')
    report['status'] = 'passed'
except Exception as error:
    report['status'] = 'failed'
    report['error'] = str(error)
finally:
    # Remove only the unique container created by this invocation, including its anonymous volume.
    cleanup = subprocess.run(['docker', 'rm', '-f', '-v', container], capture_output=True)
    report['scratchRemoved'] = cleanup.returncode == 0
    report['durationSeconds'] = round(time.monotonic() - started, 1)
    Path(__file__).with_name('hosted-restore-evidence.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report))
if report['status'] != 'passed': raise SystemExit(1)
