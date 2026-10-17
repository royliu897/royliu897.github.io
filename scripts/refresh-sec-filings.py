"""Refresh static SEC filing metadata. Run from the repository root; no credentials needed."""
import datetime,json,time,urllib.request
from pathlib import Path
path=Path(__file__).resolve().parents[1]/'assets/research/filings.json'
asof=datetime.date.today().isoformat()
result={'asOf':asof,'source':'https://data.sec.gov/submissions/','companies':{}}
for ticker,cik in {'MCD':63908,'AAPL':320193,'CAT':18230,'KO':21344,'NKE':320187}.items():
    req=urllib.request.Request(f'https://data.sec.gov/submissions/CIK{cik:010}.json',headers={'User-Agent':'RoyLiuResearchDesk personal research royrliu@utexas.edu'})
    with urllib.request.urlopen(req,timeout=30) as response:data=json.load(response)
    r=data['filings']['recent'];result['companies'][ticker]=[]
    for i,form in enumerate(r['form']):
        if form not in ('10-K','10-Q','DEF 14A'):continue
        result['companies'][ticker].append({'form':form,'filingDate':r['filingDate'][i],'reportDate':r.get('reportDate',['']*len(r['form']))[i],'url':f'https://www.sec.gov/Archives/edgar/data/{cik}/{r["accessionNumber"][i].replace("-","")}/{r["primaryDocument"][i]}'})
    time.sleep(.25)
# Replace only once all five lookups succeed; failures leave the previous snapshot intact.
temporary=path.with_suffix('.tmp');temporary.write_text(json.dumps(result,indent=2));temporary.replace(path)
print('Updated SEC metadata:',asof)
