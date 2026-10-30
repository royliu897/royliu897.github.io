import os,subprocess,json,time,argparse,getpass,datetime
from pathlib import Path
parser=argparse.ArgumentParser(description='Refresh listed issuer links from OpenDART periodic filing metadata; credentials are never saved.')
parser.add_argument('--from',dest='start',required=True,help='YYYYMMDD')
parser.add_argument('--to',dest='end',required=True,help='YYYYMMDD')
args=parser.parse_args()
for value in [args.start,args.end]:datetime.datetime.strptime(value,'%Y%m%d')
if args.start>args.end:raise SystemExit('The start date must precede the end date')
key=os.environ.get('DART_API_KEY') or getpass.getpass('OpenDART API key: ');rows={}

def request(page):
 query='bgn_de='+args.start+'&end_de='+args.end+'&pblntf_ty=A&page_count=100&page_no='+str(page)
 config='url = "https://opendart.fss.or.kr/api/list.json?crtfc_key='+key+'&'+query+'"\n'
 result=subprocess.run(['curl','-sS','--connect-timeout','6','--max-time','20','--config','-'],input=config.encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=24)
 if result.returncode:raise RuntimeError('Directory source request failed with curl code '+str(result.returncode))
 d=json.loads(result.stdout)
 if d.get('status')!='000':raise RuntimeError('DART status '+str(d.get('status')))
 return d
first=request(1);total=int(first['total_page']);print('DART periodic-report directory pages',total,flush=True)
if total>80:raise SystemExit('Unexpectedly large directory query')
for page in range(1,total+1):
 if page==1:d=first
 else:
  for attempt in range(3):
   try:d=request(page);break
   except Exception:
    if attempt==2:raise
    time.sleep(1+attempt)

 for x in d['list']:
  ticker=x.get('stock_code','').strip()
  if len(ticker)==6 and ticker.isdigit():rows[ticker]={'ticker':ticker,'corp_code':x['corp_code'],'name':x['corp_name'],'local_name':x['corp_name'],'exchange':'KRX'}
 if page%5==0:print('Directory progress',page,'/',total,'listed issuers',len(rows),flush=True)
 time.sleep(.6)
if len(rows)<1000:raise SystemExit('Too few issuers; keeping the previous directory')
for code,name in [('000660','SK hynix'),('005930','Samsung Electronics')]:
 if code in rows:rows[code]['name']=name
p=Path(__file__).resolve().parents[1]/'sec-worker/data';p.mkdir(exist_ok=True)
(p/'dart-directory.json').write_text(json.dumps(list(rows.values()),ensure_ascii=False,separators=(',',':')))
(p/'dart-directory-source.json').write_text(json.dumps({'source':'OpenDART periodic disclosure list','period':args.start+'/'+args.end,'snapshot':datetime.date.today().isoformat(),'listing_count':len(rows),'limitation':'Not a complete current exchange directory; newly listed issuers without a periodic report in this interval may be absent.'}))
print('Saved',len(rows),'listed issuer links from regulator filing metadata',flush=True)
