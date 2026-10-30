"""Refresh the server-only TWSE listed-company directory from its official feed."""
import datetime,hashlib,json,urllib.request
from pathlib import Path
url='https://openapi.twse.com.tw/v1/opendata/t187ap03_L'
raw=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'RoyResearch/1.0'}),timeout=30).read()
data=json.loads(raw);rows=[]
for c in data:
 ticker=c['公司代號']
 if not ticker.isdigit() or not 4<=len(ticker)<=6:continue
 rows.append({'ticker':ticker,'exchange':'TWSE','name':c['英文簡稱'] or c['公司名稱'],'local_name':c['公司名稱'],'short_name':c['公司簡稱'],'vat':c['營利事業統一編號'],'issued_shares':c['已發行普通股數或TDR原股發行股數'],'preferred_shares':c['特別股'],'directory_date':c['出表日期']})
if len(rows)<500 or len({r['ticker'] for r in rows})!=len(rows):raise ValueError('Unexpected or duplicate TWSE issuer directory; no files changed')
root=Path(__file__).resolve().parents[1]/'sec-worker/data'
(root/'taiwan-directory.json').write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':'))+'\n')
(root/'taiwan-directory-source.json').write_text(json.dumps({'url':url,'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sha256':hashlib.sha256(raw).hexdigest(),'issuers':len(rows),'scope':'TWSE listed-company metadata; issued ordinary shares are not assumed to be outstanding shares net of treasury'},indent=2)+'\n')
print(f'Updated {len(rows)} TWSE issuer identities. Redeploy the Worker to publish the directory.')
