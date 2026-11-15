import json, pathlib, urllib.request
cfg=json.loads(pathlib.Path('C:/Users/ghadi.mdallal/.railway/config.json').read_text())
token=cfg['user'].get('token') or cfg['user']['accessToken']
def query(q):
    request=urllib.request.Request('https://backboard.railway.com/graphql/v2',data=json.dumps({'query':q}).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+token,'User-Agent':'Supplify pilot readiness verification'})
    with urllib.request.urlopen(request,timeout=30) as response: result=json.load(response)
    if result.get('errors'): raise RuntimeError(str(result['errors']))
    return result['data']
result=query('{ __schema { queryType { fields { name args { name type { kind name ofType { name kind } } } type { name kind ofType { name kind } } } } } }')
fields=[f for f in result['__schema']['queryType']['fields'] if 'backup' in f['name'].lower() or 'volume' in f['name'].lower()]
print(json.dumps(fields))
