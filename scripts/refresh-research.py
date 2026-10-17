"""Refresh a dated SEC library. No API keys; server/CLI fetch avoids browser CORS.
Usage: python3 scripts/refresh-research.py --as-of 2026-10-17 --start 2015
Filing dates and company facts are restricted to the chosen cutoff. Macro downloads
are offered at the provider; this script does not pretend they are vintage data.
"""
import argparse,datetime,json,time,urllib.request
from pathlib import Path
COMPANIES={'MCD':63908,'AAPL':320193,'CAT':18230,'KO':21344,'NKE':320187}
TAGS=['Revenues','RevenueFromContractWithCustomerExcludingAssessedTax','SalesRevenueNet','NetIncomeLoss','EarningsPerShareDiluted','NetCashProvidedByUsedInOperatingActivities','PaymentsToAcquirePropertyPlantAndEquipment','Assets','StockholdersEquity','LongTermDebtCurrent','LongTermDebtNoncurrent','WeightedAverageNumberOfDilutedSharesOutstanding','OperatingIncomeLoss']
def get(url):
    time.sleep(.2)
    req=urllib.request.Request(url,headers={'User-Agent':'RoyLiuResearchDesk royrliu@utexas.edu'})
    with urllib.request.urlopen(req,timeout=60) as r:return json.load(r)
def rows(data,cik,start,cutoff):
    out=[]
    for i,form in enumerate(data['form']):
        date=data['filingDate'][i]
        if form not in ('10-K','10-K/A','10-Q','10-Q/A','8-K','8-K/A','DEF 14A') or not start<=date<=cutoff:continue
        acc=data['accessionNumber'][i];doc=data['primaryDocument'][i]
        if not doc:continue
        out.append({'form':form,'date':date,'period':data.get('reportDate',['']*len(data['form']))[i],'accession':acc,'url':f'https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace("-","")}/{doc}'})
    return out
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--as-of',default=datetime.date.today().isoformat());parser.add_argument('--start',type=int,default=2015);args=parser.parse_args();datetime.date.fromisoformat(args.as_of)
    target=Path(__file__).resolve().parents[1]/'assets/research/library';target.mkdir(exist_ok=True)
    for ticker,cik in COMPANIES.items():
        data=get(f'https://data.sec.gov/submissions/CIK{cik:010}.json');filings=rows(data['filings']['recent'],cik,f'{args.start}-01-01',args.as_of)
        for part in data['filings'].get('files',[]):
            if part['filingTo']<f'{args.start}-01-01' or part['filingFrom']>args.as_of:continue
            filings+=rows(get('https://data.sec.gov/submissions/'+part['name']),cik,f'{args.start}-01-01',args.as_of)
        facts=get(f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010}.json')['facts'].get('us-gaap',{})
        selected={}
        for tag in TAGS:
            if tag not in facts:continue
            f=facts[tag];units={u:[p for p in observations if p.get('form') in ('10-K','10-K/A') and f'{args.start}-01-01'<=p['end']<=args.as_of and p['filed']<=args.as_of] for u,observations in f['units'].items()}
            selected[tag]={'label':f.get('label',tag),'description':f.get('description',''),'units':units}
        unique={f['accession']:f for f in filings}
        out={'ticker':ticker,'cik':str(cik),'asOf':args.as_of,'start':args.start,'filings':sorted(unique.values(),key=lambda f:f['date'],reverse=True),'factsFile':ticker+'-facts.json'}
        facts_temp=target/(ticker+'-facts.tmp');facts_temp.write_text(json.dumps(selected,separators=(',',':')));facts_temp.replace(target/(ticker+'-facts.json'));temp=target/(ticker+'.tmp');temp.write_text(json.dumps(out,separators=(',',':')));temp.replace(target/(ticker+'.json'));print(ticker,len(unique),'filings;',len(selected),'concepts',flush=True)
if __name__=='__main__':main()
