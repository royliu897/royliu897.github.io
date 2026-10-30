"""Local feasibility pilot: structured SEC filing inventory, not a production API.
Requires lxml. Reads cached filings only; no network or AI mapping at this stage.
"""
from pathlib import Path
import re,json,html,datetime,sys
from lxml import html as LH
def local(node):return str(node.tag).split(':')[-1].lower()
def text(node):return re.sub(r'\s+',' ',''.join(node.itertext())).strip()
def attrs(node):return {k.lower():v for k,v in node.attrib.items()}
def descendant(node,name):return next((n for n in node.iterdescendants() if local(n)==name),None)
def date(node,name):
 n=descendant(node,name);return text(n) if n is not None else None
def extract(raw,metadata):
 root=LH.fromstring(raw);cik=str(int(metadata['record']['cik']));period=metadata['filing']['period'];contexts={};units={};excluded={'foreign_issuer':0,'typed_dimension':0,'unsupported_unit':0,'unsupported_format':0,'nil':0};filing=metadata['filing']
 for node in root.iter():
  if local(node)=='context':
   ident=descendant(node,'identifier');a=attrs(node)
   if ident is None or not text(ident).isdigit() or str(int(text(ident)))!=cik:excluded['foreign_issuer']+=1;continue
   if ident.get('scheme') not in ['http://www.sec.gov/CIK','https://www.sec.gov/CIK']:continue
   dims=[{'axis':n.get('dimension'),'member':text(n)} for n in node.iterdescendants() if local(n)=='explicitmember'];typed=any(local(n)=='typedmember' for n in node.iterdescendants())
   contexts[a.get('id')]={'start':date(node,'startdate'),'end':date(node,'enddate') or date(node,'instant'),'dimensions':dims,'typed':typed}
  if local(node)=='unit':
   measures=[text(n).split(':')[-1] for n in node.iterdescendants() if local(n)=='measure'];divide=any(local(n)=='unitdenominator' for n in node.iterdescendants())
   if len(measures)==1:units[node.get('id')]=measures[0]
   elif len(measures)==2 and divide:units[node.get('id')]='/'.join(measures)
 table_nodes=[n for n in root.iter() if local(n)=='table'];table_ids={n:i for i,n in enumerate(table_nodes)};tables={i:{'index':i,'facts':[],'kind':None} for i in range(len(table_nodes))};facts=[];conflicts=[];seen={}
 # Inline prefixes are checked against the namespace declarations in source.
 ns=dict(re.findall(r'xmlns:([\w.-]+)=["\']([^"\']+)["\']',raw.decode('utf8',errors='replace')[:150000]))
 for node in root.iter():
  if local(node)!='nonfraction':continue
  a=attrs(node);ctx=contexts.get(a.get('contextref'));unit=units.get(a.get('unitref'));qname=a.get('name','');namespace,sep,name=qname.partition(':')
  if not sep or not ctx or not ctx['end']:continue
  if a.get('xsi:nil') in ['true','1']:excluded['nil']+=1;continue
  if not re.fullmatch(r'[A-Z]{3}(?:/shares)?|shares|pure',unit or ''):excluded['unsupported_unit']+=1;continue
  if a.get('continuedat'):excluded['unsupported_format']+=1;continue
  fmt=a.get('format','').split(':')[-1].lower();rawvalue=text(node)
  if 'zerodash' in fmt or 'fixed-zero' in fmt:value=0
  else:
   if fmt and not re.fullmatch(r'num-?dot-?decimal|num-?comma-?decimal',fmt):excluded['unsupported_format']+=1;continue
   v=re.sub(r'[()\s\u00a0]','',rawvalue)
   if not re.fullmatch(r'[+-]?[0-9.,]+',v):continue
   try:value=float(v.replace('.','').replace(',','.')) if 'comma' in fmt else float(v.replace(',',''))
   except ValueError:continue
   if rawvalue.startswith('(') or a.get('sign')=='-':value=-abs(value)
  try:scale=int(a.get('scale',0))
  except ValueError:continue
  if abs(scale)>12:continue
  value*=10**scale
  table=next((n for n in node.iterancestors() if local(n)=='table'),None);row=next((n for n in node.iterancestors() if local(n)=='tr'),None);label=''
  if row is not None:
   parts=[]
   for cell in row:
    if node is cell or any(n is node for n in cell.iterdescendants()):break
    t=text(cell)
    if re.search(r'[A-Za-z]',t):parts.append(t)
   label=' '.join(parts)
  record={'qname':qname,'namespace':namespace,'namespace_uri':ns.get(namespace),'name':name,'unit':unit,'value':value,**ctx,'context_ref':a.get('contextref'),'scale':scale,'decimals':a.get('decimals'),'label':label,'table':table_ids.get(table),'fact_id':a.get('id'),'filed':filing['date'],'accession':filing['accession'],'source_url':filing['url'],'source_kind':'inline-XBRL'}
  key=(qname,unit,ctx['start'],ctx['end'],json.dumps(ctx['dimensions'],sort_keys=True),ctx['typed']);old=seen.get(key)
  if old is not None and old['value']!=value:conflicts.append({'qname':qname,'context_ref':record['context_ref'],'values':[old['value'],value]})
  else:seen[key]=record
  facts.append(record)
  if table is not None:tables[table_ids[table]]['facts'].append(record)
 if not contexts or not any(c['end']==period for c in contexts.values()):raise ValueError('Requested issuer/period not found in filing contexts')
 for table in tables.values():
  current=[f for f in table['facts'] if f['end']==period and (not f['start'] or 330<=(datetime.date.fromisoformat(f['end'])-datetime.date.fromisoformat(f['start'])).days<=380)]
  tags={f['name'] for f in current};companywide=sum(not f['dimensions'] and not f['typed'] for f in current)
  if 'NetCashProvidedByUsedInOperatingActivities' in tags and ('NetCashProvidedByUsedInFinancingActivities' in tags or 'NetCashProvidedByUsedInInvestingActivities' in tags):table['kind']='cash_flow'
  elif 'Assets' in tags and 'LiabilitiesAndStockholdersEquity' in tags:table['kind']='balance_sheet'
  elif {'EarningsPerShareBasic','EarningsPerShareDiluted'}&tags and {'NetIncomeLoss','ProfitLoss','NetIncomeLossAvailableToCommonStockholdersBasic'}&tags:table['kind']='income_statement'
  table['score']=companywide;table['current_facts']=len(current)
 selected={}
 for kind in ['income_statement','balance_sheet','cash_flow']:
  candidates=[t for t in tables.values() if t['kind']==kind]
  if candidates:selected[kind]=max(candidates,key=lambda t:(t['score'],t['current_facts']))['index']
 for f in facts:f['statement']=next((k for k,v in selected.items() if v==f['table']),None)
 return {'schema_version':1,'cik':cik,'ticker':metadata['record']['ticker'],'filing':filing,'facts':facts,'selected_statements':selected,'conflicts':conflicts,'exclusions':excluded,'scope':'Tagged numeric filing facts, including dimensional observations. Statement identification uses standard-concept signatures. Raw observations are not automatically equivalent to template rows.'}
if __name__=='__main__':
 root=Path(sys.argv[1]);tickers=sys.argv[2:] or ['PG','CAT','JPM','TRV','KO','COST','BAC','ALL']
 for ticker in tickers:
  folder=root/ticker
  try:
   start=datetime.datetime.now();metadata=json.loads((folder/'metadata.json').read_text());result=extract((folder/'filing.htm').read_bytes(),metadata);result['parse_ms']=(datetime.datetime.now()-start).total_seconds()*1000;(folder/'inventory.json').write_text(json.dumps(result,separators=(',',':')))
   print(ticker,len(result['facts']),result['selected_statements'],round(result['parse_ms']),flush=True)
  except Exception as e:print(ticker,'ERROR',str(e),flush=True)
