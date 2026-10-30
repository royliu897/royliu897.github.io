from pathlib import Path
import urllib.request,json,time
root=Path('/home/royl/projects/sftsaf/coverage-pilot');root.mkdir(exist_ok=True)
api='https://research-api.royrliu.com';sample=['PG','CAT','JPM','TRV','KO','COST','BAC','ALL']
def get(url):
 req=urllib.request.Request(url,headers={'User-Agent':'Roy Liu Research Desk royrliu@utexas.edu','Accept':'application/json,text/html'})
 with urllib.request.urlopen(req,timeout=35) as response:return response.read(20000001)
directory=json.loads(get(api+'/directory'))['companies']
for ticker in sample:
 record=next(c for c in directory if c['ticker']==ticker);folder=root/ticker;folder.mkdir(exist_ok=True)
 try:
  if not (folder/'metadata.json').exists():
   profile=json.loads(get(api+'/company/CIK'+record['cik']+'/filings?from=2025'));filing=next(f for f in profile['filings'] if f['form']=='10-K')
   (folder/'metadata.json').write_text(json.dumps({'record':record,'profile':profile,'filing':filing},indent=2))
  metadata=json.loads((folder/'metadata.json').read_text());filing=metadata['filing']
  if not (folder/'facts.json').exists():(folder/'facts.json').write_bytes(get(api+'/company/CIK'+record['cik']+'/facts'))
  if not (folder/'filing.htm').exists():(folder/'filing.htm').write_bytes(get(filing['url']))
  print(ticker,filing['period'],(folder/'filing.htm').stat().st_size,flush=True)
 except Exception as e:print(ticker,'ERROR',str(e),flush=True)
 time.sleep(.15)
