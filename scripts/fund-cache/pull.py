"""Download selected fund shareholder reports, then extract explicit fund columns.
Requires lxml. Source cache belongs outside the public site.
"""
from pathlib import Path
import argparse,json,urllib.request,time
from extract import extract
p=argparse.ArgumentParser();p.add_argument('--cik',required=True);p.add_argument('--ticker',required=True);p.add_argument('--cache-root',type=Path,required=True);p.add_argument('--reports',type=int,default=4);a=p.parse_args()
if not a.cik.isdigit() or not 1<=a.reports<=20:raise SystemExit('Invalid CIK/report count')
def get(url):
 request=urllib.request.Request(url,headers={'User-Agent':'Roy Liu Research Desk royrliu@utexas.edu'})
 with urllib.request.urlopen(request,timeout=45) as response:
  data=response.read(64000001)
  if len(data)>64000000:raise ValueError('Fund source exceeds offline size limit')
  return data
cik=str(int(a.cik));profile=json.loads(get('https://data.sec.gov/submissions/CIK'+cik.zfill(10)+'.json'))
if int(profile['cik'])!=int(cik) or a.ticker not in profile.get('tickers',[]):raise ValueError('SEC fund issuer/ticker mismatch')
r=profile['filings']['recent'];sources=[]
for i,form in enumerate(r['form']):
 if form not in ['N-CSR','N-CSRS']:continue
 accession=r['accessionNumber'][i];document=r['primaryDocument'][i]
 if '/' in document or '..' in document:raise ValueError('Invalid fund document name')
 sources.append({'cik':cik,'ticker':a.ticker,'name':profile['name'],'form':form,'accession':accession,'date':r['filingDate'][i],'period':r['reportDate'][i],'url':'https://www.sec.gov/Archives/edgar/data/'+cik+'/'+accession.replace('-','')+'/'+document})
 if len(sources)>=a.reports:break
for source in sources:
 folder=a.cache_root/source['accession'];folder.mkdir(parents=True,exist_ok=True);(folder/'metadata.json').write_text(json.dumps(source))
 if not (folder/'filing.htm').exists():(folder/'filing.htm').write_bytes(get(source['url']));time.sleep(.25)
 result=extract((folder/'filing.htm').read_bytes(),source);(folder/'inventory.json').write_text(json.dumps(result,separators=(',',':')))
 print(a.ticker,source['form'],source['period'],len(result['observations']),flush=True)
