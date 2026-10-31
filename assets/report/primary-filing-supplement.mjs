import {mergeClassFacts} from './filing-supplement.mjs?v=162d5e719d39';
// Offline primary-statement compiler and browser-side cache loader. No ticker
// exceptions, numerical overrides, network parsing, or automatic AI mappings.
import {concepts} from './concept-registry.mjs?v=162d5e719d39';
import {companyTemplate,templateConcepts,preferConceptTotals} from './statement-source-policy.mjs?v=162d5e719d39';
import schema from './row-schema.mjs?v=162d5e719d39';
const days=p=>(Date.parse(p.end)-Date.parse(p.start))/86400000;
const standard=p=>p.namespace==='us-gaap'&&/^https?:\/\/(?:fasb\.org|xbrl\.us)\//.test(p.namespace_uri||'')||p.namespace==='ifrs-full'&&/^https?:\/\/xbrl\.(?:ifrs|iasb)\.org\/taxonomy\//.test(p.namespace_uri||'');
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&Number.isFinite(Date.parse(s));
const clean=s=>String(s||'').toLowerCase().replace(/[^a-z]/g,'');
export const primaryFilingVersion=1;
export function primaryScopeRejection(point,key){
 // A generic taxonomy tag cannot make a captioned operating-cost component
 // a total cost-of-sales measure. Keep the source amount for review instead.
 if(key==='cogs'&&clean(point.label)==='purchasedtransportation')return 'Primary caption is purchased transportation, an identified operating-cost component; it does not establish total cost of goods and services sold.';
 return null;
}

function keysFor(template){
 const result=new Map();
 for(const [table,rows]of [['income_statement',schema[template?template+'_income':'income_statement']],['balance_sheet',schema[template?template+'_balance':'balance_sheet']],['cash_flow',schema.cash_flow]])for(const row of rows)result.set(row.key,table);
 // Inputs for existing derivations must retain their statement scope too.
 for(const key of Object.keys(concepts))if(key.startsWith('_wc_')||key.startsWith('_cf')||key.startsWith('_tw_')||key==='_dividends_per_share')result.set(key,'cash_flow');
 for(const key of ['_equity_including_nci','_debt_current','_long_debt_total','_commercial_paper','_short_borrowings','total_debt','_debt_lease_current','_debt_lease_noncurrent','_debt_lease_total','operating_lease_liabilities_current','operating_lease_liabilities_noncurrent'])result.set(key,'balance_sheet');
 for(const key of ['_pretax_domestic','_pretax_foreign','shares_basic','reported_costs_expenses'])result.set(key,'income_statement');
 return result;
}
export function compilePrimaryFilings(inventories,record){
 const template=companyTemplate(record),registry=templateConcepts(concepts,template),keys=keysFor(template),facts={},conflicts=[],sources=[],rejections=[];
 for(const inv of inventories){
  if(String(Number(inv.cik))!==String(Number(record.cik)))throw Error('Primary inventory issuer mismatch.');
  const filing=inv.filing;
  if(!/^\d{10}-\d{2}-\d{6}$/.test(filing.accession||'')||!validDate(filing.date)||!validDate(filing.period)||!/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//.test(filing.url||'')||!/^10-[KQ](?:\/A)?$/.test(filing.form||''))throw Error('Invalid primary filing metadata.');
  if(!filing.url.startsWith('https://www.sec.gov/Archives/edgar/data/'+Number(record.cik)+'/'+filing.accession.replaceAll('-','')+'/'))throw Error('Primary source URL issuer/accession mismatch.');
  sources.push({...filing,statement_evidence:inv.statement_evidence,source_sha256:inv.source_sha256,selected_statements:inv.selected_statements});
  for(const [key,table]of keys){
   const [aliases=[],type='duration']=registry[key]||[];
   let points=inv.facts.filter(p=>aliases.includes(p.name)&&p.statement===table&&standard(p)&&!p.typed&&!p.dimensions?.length&&Number.isFinite(p.value)&&validDate(p.end)&&p.end<=filing.period&&p.filed===filing.date&&p.accession===filing.accession&&p.source_url===filing.url&&(type==='instant'?!p.start:validDate(p.start)&&days(p)>=70&&days(p)<=380));
   // A broad cash concept is usable only when the issuer itself uses it on
   // the primary cash-and-equivalents line. Restricted-cash totals elsewhere
   // are not substituted, and the original concept remains in provenance.
   if(key==='cash'&&!points.length)points=inv.facts.filter(p=>p.statement==='balance_sheet'&&standard(p)&&p.name==='CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'&&clean(p.label)==='cashandcashequivalents'&&!p.typed&&!p.dimensions?.length&&!p.start&&validDate(p.end)&&p.end<=filing.period&&p.accession===filing.accession&&p.filed===filing.date&&p.source_url===filing.url&&Number.isFinite(p.value)).map(p=>({...p,mapped_name:'CashAndCashEquivalentsAtCarryingValue',mapping_rule:'Primary balance-sheet cash-and-equivalents caption; original broader concept retained'}));
   if(key==='total_debt')points=points.filter(p=>p.name!=='LongTermDebt'||/^(?:total)?debt$/.test(clean(p.label)));
   if(key==='_short_borrowings'){
    const fallback=inv.facts.filter(p=>p.statement==='balance_sheet'&&standard(p)&&!p.typed&&!p.dimensions?.length&&!p.start&&validDate(p.end)&&p.end<=filing.period&&p.accession===filing.accession&&p.filed===filing.date&&p.source_url===filing.url&&Number.isFinite(p.value)&&(
     p.name==='OtherShortTermBorrowings'&&/^shorttermborrowings(?:included|includes|at|$)/.test(clean(p.label))||p.name==='NotesAndLoansPayable'&&p.balance_classification==='current_liabilities'&&/^(?:loansandnotespayable|notesandloanspayable)$/.test(clean(p.label))));
    const ends=new Set(points.map(p=>p.end));points.push(...fallback.filter(p=>!ends.has(p.end)).map(p=>({...p,mapped_name:'ShortTermBorrowings',mapping_rule:'Primary balance-sheet short-term borrowing line; original source concept retained'})));
   }
   if(template==='bank'&&key==='interest_income')points=points.filter(p=>['InterestIncomeOperating','InterestAndDividendIncomeOperating'].includes(p.name));
   if(key==='net_income'&&points.some(p=>['NetIncomeLoss','ProfitLossAttributableToOwnersOfParent'].includes(p.name)))points=points.filter(p=>['NetIncomeLoss','ProfitLossAttributableToOwnersOfParent'].includes(p.name));
   if(key==='cf_net_income'&&points.some(p=>p.name==='ProfitLoss'))points=points.filter(p=>p.name==='ProfitLoss');
   const groups=new Map();for(const p of points){if(!/^[A-Z]{3}(?:\/shares)?$|^shares$/.test(p.unit||''))continue;const id=[p.start,p.end,p.unit].join('|');if(!groups.has(id))groups.set(id,[]);groups.get(id).push(p);}
   for(const original of groups.values()){
    const rejected=original.filter(p=>primaryScopeRejection(p,key)),valid=original.filter(p=>!primaryScopeRejection(p,key));
    for(const p of rejected)rejections.push({key,accession:filing.accession,start:p.start,end:p.end,concept:p.qname,source_label:p.label,reason:primaryScopeRejection(p,key),scope_review:p.scope_review});
    const group=preferConceptTotals(valid.length?valid:rejected.map(p=>({...p,scope_rejection:primaryScopeRejection(p,key)})),key);
    const values=new Set(group.map(p=>p.value)),scopeRejected=group.some(p=>p.scope_rejection),conflict=values.size>1;

    if(conflict)conflicts.push({key,start:group[0].start,end:group[0].end,accession:filing.accession,concepts:group.map(p=>p.qname),values:[...values],reason:'Conflicting primary-statement candidates; no first-match selection'});
    // Keep conflict observations as evidence, but the adapter withholds them.
    for(const p of (conflict?group:[group[0]])){
     const name=p.mapped_name||p.name,fact=facts[name]??={namespace:p.namespace,label:p.label||p.name,units:{}};
     (fact.units[p.unit]??=[]).push({start:p.start||undefined,end:p.end,val:p.value,filed:filing.date,accn:filing.accession,form:filing.form,source_url:filing.url,source_concept:p.qname,context_ref:p.context_ref,fact_id:p.fact_id,source_label:p.label,source_statement:table,source_priority:'primary-statement',mapping_key:key,mapping_rule:p.mapping_rule,source_sha256:inv.source_sha256,...(conflict||scopeRejected?{unresolved:true,excluded_from_mapping:true,unresolved_reason:p.scope_rejection||'Conflicting primary-statement candidates',scope_rejection:p.scope_rejection,scope_review:p.scope_review}:{})});
    }
   }
   const scoped=inv.facts.filter(p=>aliases.includes(p.name)&&p.statement===table&&(p.typed||p.dimensions?.length));
   if(scoped.length&&!points.length)rejections.push({key,accession:filing.accession,reason:'Only dimensional primary-statement observations; generic consolidated mapping withheld',concepts:[...new Set(scoped.map(p=>p.qname))]});
  }
 }
 return {schema_version:primaryFilingVersion,cik:String(record.cik),facts,sources,conflicts,rejections,scope:'Selected annual and latest-quarter primary-statement facts and comparative periods; not every filing disclosure. Dimensional values remain excluded.'};
}
export function mergePrimaryFilings(data,supplement,record={}){
 if(supplement.schema_version!==primaryFilingVersion||String(Number(supplement.cik))!==String(Number(data.cik)))throw Error('Primary filing cache identity/version mismatch.');
 // Copy only modified fact containers and unit arrays; raw observations are immutable.
 const facts={...(data.facts||{})};
 for(const [name,incoming]of Object.entries(supplement.facts||{})){
  const existing=facts[name]||{},fact=facts[name]={...incoming,...existing,units:{...existing.units}};
  if(fact.namespace&&incoming.namespace&&fact.namespace!==incoming.namespace)throw Error('Primary filing cache namespace mismatch.');
  for(const [unit,points]of Object.entries(incoming.units||{})){
   const list=fact.units[unit]=[...(fact.units[unit]||[])],ids=new Set(list.map(p=>[p.start,p.end,p.accn,p.mapping_key,p.source_priority,p.val].join('|')));
   for(const point of points){if(point.filed>data.asOf||point.end>data.asOf)continue;const id=[point.start,point.end,point.accn,point.mapping_key,point.source_priority,point.val].join('|');if(!ids.has(id)){list.push({...point});ids.add(id);}}
  }
 }
 let result={...data,facts};
 const models=(supplement.security_models||[]).filter(m=>String(Number(m.cik))===String(Number(data.cik))&&m.asOf<=data.asOf).sort((a,b)=>a.asOf.localeCompare(b.asOf));
 if(models.length)result.security_model=models.at(-1);
 const ticker=String(record.ticker||'').replaceAll('.','-'),incoming=ticker?supplement.listed_class_supplements?.[ticker]:null;
 if(incoming&&incoming.ticker===ticker&&String(Number(incoming.cik))===String(Number(data.cik))){
  const scoped={...incoming,facts:Object.fromEntries(Object.entries(incoming.facts||{}).map(([name,fact])=>[name,{...fact,units:Object.fromEntries(Object.entries(fact.units).map(([unit,ps])=>[unit,ps.filter(p=>p.end<=data.asOf&&p.filed<=data.asOf&&p.share_class===incoming.share_class?.identity)]))}]))};
  if(Object.values(scoped.facts).some(f=>Object.values(f.units).some(ps=>ps.length))){result=mergeClassFacts(result,scoped);result.filing_supplement={status:incoming.status,sources:(incoming.sources||[]).filter(f=>f.date<=data.asOf),scope:incoming.scope};}
 }
 return {...result,primary_filing_supplement:{status:supplement.conflicts?.length||supplement.rejections?.length?'partial':'available',sources:supplement.sources.filter(s=>s.date<=data.asOf),conflicts:supplement.conflicts,rejections:supplement.rejections,scope:supplement.scope}};
}
let manifestPromise,manifestRetryAt=0;const supplements=new Map(),retryAt=new Map();
export async function supplementPrimaryFilings(data,record,fetcher=fetch){
 try{
  // One small manifest per session. Immutable content-hashed data is cached
  // by the browser/host; extraction and SEC downloads never run on page load.
  if(Date.now()<manifestRetryAt)throw Error('Primary cache retry backoff');
  manifestPromise??=fetcher(String(new URL('./data/filings/manifest.json',import.meta.url)),{signal:AbortSignal.timeout(5000),cache:'no-cache'}).then(async r=>{if(!r.ok)throw Error('Primary cache unavailable');return r.json();}).catch(()=>{manifestPromise=undefined;manifestRetryAt=Date.now()+60000;return null;});
  const manifest=await manifestPromise,entry=manifest?.companies?.[String(Number(record.cik))];
  if(!entry)return {...data,primary_filing_supplement:{status:'unavailable',reason:'No prebuilt primary-statement cache for this issuer. The report uses its existing feeds.'}};
  if(!/^CIK\d+-[a-f0-9]{16}\.json$/.test(entry.file||''))throw Error('Invalid primary cache filename');
  if(Date.now()<(retryAt.get(entry.file)||0))throw Error('Primary cache retry backoff');
  if(!supplements.has(entry.file)){if(supplements.size>=8)supplements.delete(supplements.keys().next().value);supplements.set(entry.file,fetcher(String(new URL('./data/filings/'+entry.file,import.meta.url)),{signal:AbortSignal.timeout(10000)}).then(async r=>{if(!r.ok)throw Error('Primary cache unavailable');return r.json();}).catch(error=>{supplements.delete(entry.file);retryAt.set(entry.file,Date.now()+60000);throw error;}));}
  return mergePrimaryFilings(data,await supplements.get(entry.file),record);
 }catch{return {...data,primary_filing_supplement:{status:'unavailable',reason:'The primary-statement cache could not be validated or loaded. Existing feeds remain in use.'}};}
}
