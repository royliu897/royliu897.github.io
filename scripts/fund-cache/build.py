"""Compile already extracted, immutable shareholder reports into compact JSON."""
from pathlib import Path
import json,hashlib,argparse
p=argparse.ArgumentParser();p.add_argument('cache_root',type=Path);p.add_argument('output_root',type=Path);a=p.parse_args()
items=[json.loads(f.read_text()) for f in a.cache_root.glob('*/inventory.json')];items.sort(key=lambda d:d['source']['date'])
if not items:raise SystemExit('No extracted shareholder reports')
cik=items[0]['cik'];ticker=items[0]['ticker']
if any(i['cik']!=cik or i['ticker']!=ticker for i in items):raise ValueError('Fund cache issuer identity mismatch')
data={'schema_version':1,'cik':cik,'ticker':ticker,'name':items[-1]['name'],'sources':[i['source'] for i in items],'observations':[v for i in items for v in i['observations']],'summaries':[i['summary'] for i in items]}
body=json.dumps(data,separators=(',',':'));digest=hashlib.sha256(body.encode()).hexdigest()[:16];filename='CIK'+cik+'-'+digest+'.json';a.output_root.mkdir(parents=True,exist_ok=True)
(a.output_root/filename).write_text(body)
manifest={'schema_version':1,'funds':{}}
if (a.output_root/'manifest.json').exists():manifest=json.loads((a.output_root/'manifest.json').read_text())
manifest['funds'][cik]={'ticker':ticker,'file':filename,'latest_period':max(i['source']['period'] for i in items),'bytes':len(body.encode())}
(a.output_root/'manifest.json.tmp').write_text(json.dumps(manifest,separators=(',',':')));(a.output_root/'manifest.json.tmp').replace(a.output_root/'manifest.json')
print(ticker,'sources',len(items),'observations',len(data['observations']),'bytes',len(body.encode()))
