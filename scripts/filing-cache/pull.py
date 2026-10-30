"""Build an immutable SEC source cache outside the public website.
No credentials, company-specific mappings, or downloads on report requests.
"""
import argparse, hashlib, json, time, urllib.request, urllib.error, sys, datetime
from pathlib import Path
from extract import extract

parser=argparse.ArgumentParser()
parser.add_argument('--cache-root',type=Path,required=True)
parser.add_argument('--symbols',nargs='+',required=True)
parser.add_argument('--annual-filings',type=int,default=3)
parser.add_argument('--from-year',type=int,default=datetime.date.today().year-4)
parser.add_argument('--latest-quarter',action='store_true')
parser.add_argument('--pilot-root',type=Path)
args=parser.parse_args()
if not 1<=args.annual_filings<=12:parser.error('annual-filings must be 1..12')
args.cache_root.mkdir(parents=True,exist_ok=True)
last_request=0
def get(url):
 global last_request
 time.sleep(max(0,0.25-(time.monotonic()-last_request)))
 last_request=time.monotonic()
 req=urllib.request.Request(url,headers={'User-Agent':'Roy Liu Research Desk royrliu@utexas.edu','Accept':'application/json,text/html'})
 with urllib.request.urlopen(req,timeout=45) as response:
  value=response.read(64000001)
  if len(value)>64000000:raise ValueError('Source exceeds offline extraction limit')
  return value
api='https://research-api.royrliu.com'
directory=json.loads(get(api+'/directory'))['companies']
def filing_profile(cik,start,end):
 try:return json.loads(get(api+'/company/CIK'+cik+'/filings?from='+str(start)+'&to='+str(end)))
 except urllib.error.HTTPError as error:
  body=error.read().decode('utf8',errors='replace')
  if error.code!=400 or 'Narrow the filing year range' not in body or start>=end:raise
  middle=(start+end)//2
  newer=filing_profile(cik,middle+1,end);older=filing_profile(cik,start,middle)
  if int(newer['cik'])!=int(older['cik']):raise ValueError('Historical filing issuer mismatch')
  combined={f['accession']:f for f in older['filings']+newer['filings']}
  return {**newer,'filings':sorted(combined.values(),key=lambda f:f['date'],reverse=True)}
summary=[]
for ticker in args.symbols:
 try:
  record=next(c for c in directory if c['ticker']==ticker)
  profile=filing_profile(record['cik'],args.from_year,datetime.date.today().year)
  if int(profile['cik'])!=int(record['cik']):raise ValueError('Filing directory issuer mismatch')
  reports=sorted([f for f in profile['filings'] if f['form']=='10-K'],key=lambda f:(f.get('period',''),f['date']),reverse=True)
  selected=[];periods=set()
  for filing in reports:
   if filing.get('period') in periods:continue
   periods.add(filing.get('period'));selected.append(filing)
   if len(selected)>=args.annual_filings:break
  if args.latest_quarter:
   quarters=sorted([f for f in profile['filings'] if f['form']=='10-Q'],key=lambda f:f['date'],reverse=True)
   if quarters:selected.append(quarters[0]);periods.add(quarters[0].get('period'))
  # Include amendments for selected periods; they do not erase originals.
  selected += [f for f in profile['filings'] if f['form'] in ['10-K/A','10-Q/A'] and f.get('period') in periods]
  for filing in selected:
   folder=args.cache_root/str(int(record['cik']))/filing['accession'];folder.mkdir(parents=True,exist_ok=True)
   metadata={'record':record,'profile':profile,'filing':filing}
   (folder/'metadata.json').write_text(json.dumps(metadata))
   if not (folder/'filing.htm').exists():
    pilot=args.pilot_root/ticker if args.pilot_root else None
    old=json.loads((pilot/'metadata.json').read_text()) if pilot and (pilot/'metadata.json').exists() else None
    raw=(pilot/'filing.htm').read_bytes() if old and old['filing']['accession']==filing['accession'] else get(filing['url'])
    (folder/'filing.htm').write_bytes(raw)
   raw=(folder/'filing.htm').read_bytes()
   try:inv=extract(raw,metadata)
   except ValueError as error:
    failure={'ticker':ticker,'accession':filing['accession'],'status':'unsupported','reason':str(error)}
    (folder/'extraction-error.json').write_text(json.dumps(failure));summary.append(failure);print(json.dumps(failure),flush=True);continue
   if (folder/'extraction-error.json').exists():(folder/'extraction-error.json').unlink()
   inv['source_sha256']=hashlib.sha256(raw).hexdigest()
   (folder/'inventory.json').write_text(json.dumps(inv,separators=(',',':')))
   summary.append({'ticker':ticker,'accession':filing['accession'],'period':filing['period'],'facts':len(inv['facts']),'bytes':len(raw),'statements':inv['selected_statements'],'status':'extracted'})
   print(json.dumps(summary[-1]),flush=True)
  facts_file=args.cache_root/str(int(record['cik']))/'facts.json'
  if not facts_file.exists():facts_file.write_bytes(get(api+'/company/CIK'+record['cik']+'/facts'))
 except Exception as error:
  summary.append({'ticker':ticker,'status':'error','reason':str(error)})
  print(json.dumps(summary[-1]),flush=True)
(args.cache_root/'extraction-run.json').write_text(json.dumps(summary,indent=2))
if any(r['status']=='error' for r in summary):sys.exit(1)
