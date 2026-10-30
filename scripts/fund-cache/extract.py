"""Offline N-CSR/N-CSRS fund-column extraction. No company financial overrides."""
from pathlib import Path
from lxml import html
import re,json,hashlib,datetime
def text(node):return re.sub(r'\s+',' ',''.join(node.itertext())).strip()
def norm(s):return re.sub(r'[^a-z0-9]','',s.lower())
def label(s):return re.sub(r'\([a-z](?:\)|\)[,\s]*)','',s).strip()
def number(s):
 s=re.sub(r'\([a-z]+\)','',s,flags=re.I);s=re.sub(r'[$,%\s\u2000-\u200f\xa0]','',s)
 if s in ['—','–','-']:return 0.0
 if not re.fullmatch(r'\(?-?\d+(?:\.\d+)?\)?',s):return None
 return float(s.strip('()'))*(-1 if s.startswith('(') else 1)
def date(s):
 m=re.search(r'(\d{2})/(\d{2})/(\d{2,4})',s)
 if not m:return None
 a,b,y=map(int,m.groups());y=y+2000 if y<94 else y+1900 if y<100 else y
 try:return datetime.date(y,a,b).isoformat()
 except ValueError:return None
def cells(row):
 result=[]
 for c in row.xpath('./td|./th'):
  value=text(c);result += [value]*int(c.get('colspan','1'))
 return result
BALANCE={
 'investmentsatvalueunaffiliated':'fund_unaffiliated_investments','investmentsatvalueaffiliated':'fund_affiliated_investments','cash':'fund_cash','foreigncurrencyatvalue':'fund_foreign_currency','totalassets':'fund_total_assets','totalliabilities':'fund_total_liabilities','netassets':'fund_net_assets','paidincapital':'fund_paid_in_capital','accumulatedearningsloss':'fund_accumulated_earnings','sharesoutstanding':'fund_shares_outstanding','netassetvalue':'fund_nav_per_share'}
OPERATIONS={'totalinvestmentincome':'fund_total_investment_income','totalexpensesafterfeeswaivedandorreimbursed':'fund_expenses_net','netinvestmentincome':'fund_net_investment_income','netrealizedandunrealizedgain':'fund_total_gain','netincreaseinnetassetsresultingfromoperations':'fund_net_operations','netdecreaseinnetassetsresultingfromoperations':'fund_net_operations'}
CHANGES={'netinvestmentincome':'fund_net_investment_income','netrealizedgain':'fund_net_realized_gain','netchangeinunrealizedappreciationdepreciation':'fund_net_unrealized_gain','netincreaseinnetassetsresultingfromoperations':'fund_net_operations','decreaseinnetassetsresultingfromdistributionstoshareholders':'fund_distributions'}
CASH={'netcashprovidedbyoperatingactivities':'fund_cash_from_operations','netcashusedforoperatingactivities':'fund_cash_from_operations','proceedsfromsalesoflongterminvestmentsandprincipalpaydownspayups':'fund_investment_sales','purchasesoflongterminvestments':'fund_investment_purchases','premiumsreceivedfromoptionswritten':'fund_option_premiums_received','premiumspaidonclosingoptionswritten':'fund_option_premiums_paid','cashdividendspaidtoshareholders':'fund_cash_distributions','netcashusedforfinancingactivities':'fund_cash_from_financing','netcashprovidedbyfinancingactivities':'fund_cash_from_financing','cashimpactfromforeignexchangefluctuations':'fund_forex_cash_effect','netincreasedecreaseinrestrictedandunrestrictedcashandforeigncurrency':'fund_cash_change','restrictedandunrestrictedcashandforeigncurrencyatendofyear':'fund_ending_cash','restrictedandunrestrictedcashandforeigncurrencyatendofperiod':'fund_ending_cash'}
HIGHLIGHTS={'netassetvalueendofyear':'fund_nav_per_share','netassetvalueendofperiod':'fund_nav_per_share','marketpriceendofyear':'fund_market_price_per_share','marketpriceendofperiodyear':'fund_market_price_per_share','marketpriceendofperiod':'fund_market_price_per_share','netrealizedandunrealizedgainloss':'fund_gain_per_share','netincreasedecreasefrominvestmentoperations':'fund_operations_per_share','totaldistributions':'fund_distributions_per_share','netassetsendofyear000':'fund_net_assets','netassetsendofperiod000':'fund_net_assets','portfolioturnoverrate':'fund_turnover_ratio','totalexpensesafterfeeswaivedandorreimbursed':'fund_expense_ratio'}
def extract(raw,metadata):
 cik=str(int(metadata['cik']));ticker=metadata['ticker'];filing=metadata
 if not re.fullmatch(r'[A-Z0-9.-]{1,15}',ticker):raise ValueError('Invalid fund ticker')
 if metadata['form'] not in ['N-CSR','N-CSRS'] or not metadata['url'].startswith('https://www.sec.gov/Archives/edgar/data/'+cik+'/'+metadata['accession'].replace('-','')+'/'):raise ValueError('Fund source issuer/accession mismatch')
 root=html.fromstring(raw);plain=text(root);name=norm(metadata['name'])
 # The primary report cover must identify this fund and its CIK. The table
 # alone is insufficient because a combined report contains many funds.
 if name not in norm(plain[:12000]):raise ValueError('Requested fund not verified on the filing cover')
 declared=re.findall(rb'<[^>]*identifier[^>]*scheme=["\']https?://www\.sec\.gov/CIK["\'][^>]*>\s*(\d+)\s*<',raw,re.I)
 if declared and cik not in {str(int(v)) for v in declared}:raise ValueError('Fund XBRL issuer mismatch')
 observations=[];source_hash=hashlib.sha256(raw).hexdigest();selected=[];summary={}
 def retain(key,value,end,table,row_index,source_label,kind='money',precision='reported-dollar',annual=None):
  if value is None or not end or end>metadata['period']:return
  if key=='fund_expenses_net':value=-abs(value)
  observations.append({'key':key,'value':value,'end':end,'annual':metadata['form']=='N-CSR' if annual is None else annual,'kind':kind,'label':source_label,'table_index':table,'row_index':row_index,'ticker':ticker,'cik':cik,'accession':metadata['accession'],'filed':metadata['date'],'form':metadata['form'],'source_url':metadata['url'],'source_sha256':source_hash,'precision':precision})
 for ti,t in enumerate(root.xpath('//table')):
  rows=[cells(r) for r in t.xpath('./tr|./tbody/tr')];header=None;fundcols=[]
  for ri,row in enumerate(rows[:3]):
   columns=[i for i,v in enumerate(row) if re.fullmatch(re.escape(ticker)+r'(?:\s*\([a-z]\))*',v)]
   if columns:header=ri;fundcols=columns;break
  if rows and any(len(row)>1 and row[0]=='Symbol on New York Stock Exchange' and row[1]==ticker for row in rows):
   for ri,row in enumerate(rows):
    if len(row)<2:continue
    if row[0].startswith('Current Monthly Distribution per Common Share'):summary['monthly_distribution_per_share']=number(row[1])
    if row[0].startswith('Current Annualized Distribution per Common Share'):summary['annualized_distribution_per_share']=number(row[1])
   continue
  if header is None or not fundcols:continue
  labels={norm(label(row[0])) for row in rows if row}
  kind=''
  if {'totalassets','totalliabilities','netassetvalue'}<=labels:kind='balance'
  elif 'totalinvestmentincome' in labels and 'netinvestmentincome' in labels:kind='operations'
  elif 'netcashprovidedbyoperatingactivities' in labels or 'netcashusedforoperatingactivities' in labels:kind='cash'
  elif 'netassetvaluebeginningofyear' in labels or 'netassetvaluebeginningofperiod' in labels:kind='highlights'
  elif 'netrealizedgain' in labels and 'netchangeinunrealizedappreciationdepreciation' in labels:kind='changes'
  if not kind:continue
  selected.append({'table':ti,'kind':kind,'columns':fundcols})
  dates={}
  if kind in ['highlights','changes']:
   for row in rows[header+1:header+4]:
    for col in fundcols:
     if col<len(row) and date(row[col]):dates[col]=date(row[col])
   if not dates:continue
  else:dates={col:metadata['period'] for col in fundcols}
  section=''
  for ri,row in enumerate(rows):
   if not row:continue
   source_label=label(row[0]);n=norm(source_label)
   if n.startswith('ratiostoaveragenetassets'):section='ratios'
   if n=='supplementaldata':section='supplemental'
   mapping={'balance':BALANCE,'operations':OPERATIONS,'changes':CHANGES,'cash':CASH,'highlights':HIGHLIGHTS}[kind];key=mapping.get(n)
   if kind=='highlights' and n=='netinvestmentincome':key='fund_nii_ratio' if section=='ratios' else 'fund_nii_per_share'
   if not key:continue
   for col,end in dates.items():
    if col>=len(row):continue
    v=number(row[col]);value_kind='money'
    if key.endswith('_per_share'):value_kind='per-share'
    elif key.endswith('_ratio'):value_kind='percentage'
    elif key=='fund_shares_outstanding':value_kind='shares'
    if kind=='highlights' and key=='fund_net_assets' and v is not None:v*=1000
    retain(key,v,end,ti,ri,source_label,value_kind,'rounded-thousand' if kind=='highlights' and key=='fund_net_assets' else 'reported-dollar',annual=end.endswith('-12-31') if kind in ['highlights','changes'] else None)
 if not any(p['key']=='fund_net_assets' for p in observations) or not any(p['key']=='fund_nav_per_share' for p in observations):raise ValueError('No verified fund statements found')
 return {'schema_version':1,'cik':cik,'ticker':ticker,'name':metadata['name'],'source':{k:metadata[k] for k in ['accession','form','date','period','url']},'source_sha256':source_hash,'observations':observations,'selected_tables':selected,'summary':{**summary,'as_of':metadata['period'],'filed':metadata['date'],'source_url':metadata['url']}}
