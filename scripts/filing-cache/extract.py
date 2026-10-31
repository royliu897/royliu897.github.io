"""Offline structured SEC filing extraction for the versioned primary cache.
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
 root=LH.fromstring(raw);cik=str(int(metadata['record']['cik']));period=metadata['filing']['period'];contexts={};units={};context_definitions={};unit_definitions={};excluded={'foreign_issuer':0,'typed_dimension':0,'unsupported_unit':0,'unsupported_format':0,'nil':0};filing=metadata['filing']
 for node in root.iter():
  if local(node)=='context':
   ident=descendant(node,'identifier');a=attrs(node)
   context_id=a.get('id')
   if not context_id:continue
   dimension_signature=tuple(sorted((n.get('dimension'),text(n)) for n in node.iterdescendants() if local(n)=='explicitmember'))
   definition=(text(ident) if ident is not None else None,ident.get('scheme') if ident is not None else None,date(node,'startdate'),date(node,'enddate'),date(node,'instant'),dimension_signature,any(local(n)=='typedmember' for n in node.iterdescendants()))
   # An ignored foreign definition must never leave an earlier same-ID issuer
   # context alive. Equal repeated resources are harmless; contradictions are
   # ambiguous XBRL and invalidate extraction rather than assigning stale scope.
   if context_id in context_definitions and context_definitions[context_id]!=definition:raise ValueError('Conflicting duplicate XBRL context identifier')
   context_definitions[context_id]=definition
   if ident is None or not text(ident).isdigit() or str(int(text(ident)))!=cik:excluded['foreign_issuer']+=1;continue
   if ident.get('scheme') not in ['http://www.sec.gov/CIK','https://www.sec.gov/CIK']:continue
   dims=[{'axis':n.get('dimension'),'member':text(n)} for n in node.iterdescendants() if local(n)=='explicitmember'];typed=any(local(n)=='typedmember' for n in node.iterdescendants())
   contexts[a.get('id')]={'start':date(node,'startdate'),'end':date(node,'enddate') or date(node,'instant'),'dimensions':dims,'typed':typed}
  if local(node)=='unit':
   measures=[text(n).split(':')[-1] for n in node.iterdescendants() if local(n)=='measure'];divide=any(local(n)=='unitdenominator' for n in node.iterdescendants())
   unit_id=node.get('id');definition=(tuple(measures),divide)
   if not unit_id:continue
   if unit_id in unit_definitions and unit_definitions[unit_id]!=definition:raise ValueError('Conflicting duplicate XBRL unit identifier')
   unit_definitions[unit_id]=definition
   if len(measures)==1:units[unit_id]=measures[0]
   elif len(measures)==2 and divide:units[node.get('id')]='/'.join(measures)
 table_nodes=[n for n in root.iter() if local(n)=='table'];table_ids={n:i for i,n in enumerate(table_nodes)};tables={i:{'index':i,'facts':[],'kind':None} for i in range(len(table_nodes))};facts=[];conflicts=[];seen={}
 # Classify explicitly headed balance-sheet sections; never infer a
 # current liability from a broad concept name such as NotesAndLoansPayable.
 row_scopes={}
 for table_node in table_nodes:
  scope=None
  for row_node in table_node.iterdescendants():
   if local(row_node)!='tr' or next((n for n in row_node.iterancestors() if local(n)=='table'),None) is not table_node:continue
   label=next((text(cell) for cell in row_node if re.search(r'[A-Za-z]',text(cell))), '')
   clean_label=re.sub(r'[^a-z]','',label.lower())
   if clean_label=='currentliabilities':scope='current_liabilities'
   elif clean_label.startswith('totalliabilities') or (not any(local(n)=='nonfraction' for n in row_node.iterdescendants()) and clean_label.startswith(('noncurrentliabilities','longtermliabilities','longtermdebt','stockholder','shareholder'))):scope=None
   row_scopes[row_node]=scope
   if clean_label.startswith('totalcurrentliabilities'):scope=None
 # Inline prefixes are checked against the namespace declarations in source.
 ns=dict(re.findall(r'xmlns:([\w.-]+)\s*=\s*["\']([^"\']+)["\']',raw[:150000].decode('utf8',errors='replace')))
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
  record={'qname':qname,'namespace':namespace,'namespace_uri':ns.get(namespace),'name':name,'unit':unit,'value':value,**ctx,'context_ref':a.get('contextref'),'scale':scale,'decimals':a.get('decimals'),'label':label,'table':table_ids.get(table),'fact_id':a.get('id'),'balance_classification':row_scopes.get(row),'filed':filing['date'],'accession':filing['accession'],'source_url':filing['url'],'source_kind':'inline-XBRL'}
  key=(qname,unit,ctx['start'],ctx['end'],json.dumps(ctx['dimensions'],sort_keys=True),ctx['typed']);old=seen.get(key)
  if old is not None and old['value']!=value:conflicts.append({'qname':qname,'context_ref':record['context_ref'],'values':[old['value'],value]})
  else:seen[key]=record
  facts.append(record)
  if table is not None:tables[table_ids[table]]['facts'].append(record)
 if not contexts or not any(c['end']==period for c in contexts.values()):raise ValueError('Requested issuer/period not found in filing contexts')
 def caption_for(table_node):
  chunks=[text(table_node)[:320]]
  for ancestor in [table_node,*list(table_node.iterancestors())[:3]]:
   for node in list(ancestor.itersiblings(preceding=True))[:4]:
    if not isinstance(node.tag,str):continue
    if local(node)=='table' or any(local(n)=='table' for n in node.iterdescendants()):break
    content=text(node)
    if len(content)<1500:chunks.append(content)
  return chunks
 patterns={
  'income_statement':r'consolidated (?:statements? of (?:income|earnings|operations)|results of operations)',
  'balance_sheet':r'consolidated (?:balance sheets?|(?:statements? of )?financial position)',
  'cash_flow':r'consolidated statements? of cash flows?'
 }
 for table in tables.values():
  current=[f for f in table['facts'] if f['end']==period and (not f['start'] or 70<=(datetime.date.fromisoformat(f['end'])-datetime.date.fromisoformat(f['start'])).days<=380)]
  tags={f['name'] for f in current};companywide=sum(not f['dimensions'] and not f['typed'] for f in current)
  if 'NetCashProvidedByUsedInOperatingActivities' in tags and ('NetCashProvidedByUsedInFinancingActivities' in tags or 'NetCashProvidedByUsedInInvestingActivities' in tags):table['kind']='cash_flow'
  elif 'Assets' in tags and 'LiabilitiesAndStockholdersEquity' in tags:table['kind']='balance_sheet'
  elif {'EarningsPerShareBasic','EarningsPerShareDiluted'}&tags and {'NetIncomeLoss','ProfitLoss','NetIncomeLossAvailableToCommonStockholdersBasic'}&tags:table['kind']='income_statement'
  table['score']=companywide;table['current_facts']=len(current);table['current_tags']=tags
  caption_chunks=caption_for(table_nodes[table['index']]);table['caption']=' '.join(caption_chunks)
  table['caption_verified']=bool(table['kind'] and (re.search(patterns[table['kind']],table['caption'],re.I) or any(re.sub(r'[^a-z]','',c.lower()) in {'income_statement':{'incomestatements','statementsofincome','statementsofoperations','statementsofearnings'},'balance_sheet':{'balancesheets','balancesheet','statementsoffinancialposition'},'cash_flow':{'cashflowsstatements','statementsofcashflows','statementofcashflows'}}[table['kind']] for c in caption_chunks)))
 # A printed balance sheet may span two adjacent HTML tables. Require an
 # independently captioned pair, complementary signatures, and matching
 # company-wide asset/liability totals for every disclosed balance date.
 # This is deliberately narrower than concatenating arbitrary nearby tables.
 balance_pairs=[]
 for i in range(len(table_nodes)-1):
  left,right=tables[i],tables[i+1]
  if left['kind'] or right['kind']:continue
  if not re.search(patterns['balance_sheet'],left['caption'],re.I) or not re.search(patterns['balance_sheet'],right['caption'],re.I):continue
  if 'Assets' not in left['current_tags'] or 'LiabilitiesAndStockholdersEquity' not in right['current_tags']:continue
  if 'LiabilitiesAndStockholdersEquity' in left['current_tags'] or 'Assets' in right['current_tags']:continue
  if min(left['score'],right['score'])<3:continue
  totals=[]
  for table,name in [(left,'Assets'),(right,'LiabilitiesAndStockholdersEquity')]:
   values={};bad=False
   for f in table['facts']:
    if f['name']!=name or f['start'] or f['dimensions'] or f['typed']:continue
    if not re.fullmatch(r'[A-Z]{3}',f['unit']) or not re.fullmatch(r'https?://fasb\.org/us-gaap/\d{4}(?:-\d{2}-\d{2})?',f['namespace_uri'] or ''):continue
    key=(f['end'],f['unit'])
    if key in values and values[key]!=f['value']:bad=True
    values[key]=f['value']
   totals.append((values,bad))
  a,b=totals
  if a[1] or b[1] or not a[0] or a[0]!=b[0] or not any(k[0]==period for k in a[0]):continue
  # Conflicting duplicate concepts across the proposed pair invalidate it.
  pair_conflicts=False;observations={}
  for f in left['facts']+right['facts']:
   key=(f['namespace_uri'] or f['qname'],f['name'],f['unit'],f['start'],f['end'],json.dumps(f['dimensions'],sort_keys=True),f['typed'])
   if key in observations and observations[key]!=f['value']:pair_conflicts=True
   observations[key]=f['value']
  if not pair_conflicts:balance_pairs.append([i,i+1])
 selected={};selected_tables={}
 for kind in ['income_statement','balance_sheet','cash_flow']:
  candidates=[[t['index']] for t in tables.values() if t['kind']==kind and t['caption_verified']]
  if kind=='balance_sheet':candidates+=balance_pairs
  if len(candidates)==1:selected[kind]=candidates[0][0];selected_tables[kind]=candidates[0]
 for f in facts:f['statement']=next((k for k,v in selected_tables.items() if f['table'] in v),None)
 return {'schema_version':1,'cik':cik,'ticker':metadata['record']['ticker'],'filing':filing,'facts':facts,'selected_statements':selected,'statement_evidence':{k:{'table':v,'tables':selected_tables[k],'caption':' '.join(tables[i]['caption'] for i in selected_tables[k])[:1500],'method':'standard-concept signatures plus consolidated-statement captions; split balance sheets require adjacent complementary tables and equal dated totals; ambiguous candidates withheld'} for k,v in selected.items()},'conflicts':conflicts,'exclusions':excluded,'scope':'Tagged numeric filing facts, including dimensional observations. Statement identification uses standard-concept signatures. Raw observations are not automatically equivalent to template rows.'}
if __name__=='__main__':
 root=Path(sys.argv[1]);tickers=sys.argv[2:] or ['PG','CAT','JPM','TRV','KO','COST','BAC','ALL']
 for ticker in tickers:
  folder=root/ticker
  try:
   start=datetime.datetime.now();metadata=json.loads((folder/'metadata.json').read_text());result=extract((folder/'filing.htm').read_bytes(),metadata);result['parse_ms']=(datetime.datetime.now()-start).total_seconds()*1000;(folder/'inventory.json').write_text(json.dumps(result,separators=(',',':')))
   print(ticker,len(result['facts']),result['selected_statements'],round(result['parse_ms']),flush=True)
  except Exception as e:print(ticker,'ERROR',str(e),flush=True)
