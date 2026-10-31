import {extractPrimaryLegacy} from './primary-legacy.mjs';
import {mergeClassFacts} from '../assets/report/filing-supplement.mjs';
import {compilePrimaryFilings} from '../assets/report/primary-filing-supplement.mjs';
import {appendCriticalStatementFacts} from '../scripts/filing-cache/critical-statements.mjs';
import {extractSecurityContext,extractListedClassSupplement} from '../scripts/filing-cache/security-context.mjs';
import {extractPrimaryInline} from './primary-inline.mjs';

export {INGESTION_VERSION} from './primary-ingestion-version.mjs';
export const HISTORY_START=2009;
export function validateFiling(filing,cik){
 if(!/^\d{10}-\d{2}-\d{6}$/.test(filing?.accession||'')||!/^(?:10-[KQ]|20-F|40-F)(?:\/A)?$/.test(filing.form||'')||!/^\d{4}-\d{2}-\d{2}$/.test(filing.period||'')||!/^\d{4}-\d{2}-\d{2}$/.test(filing.date||'')||filing.period>filing.date)throw Error('Unsupported filing metadata');
 const prefix='https://www.sec.gov/Archives/edgar/data/'+Number(cik)+'/'+filing.accession.replaceAll('-','')+'/';
 if(!filing.url?.startsWith(prefix)||!/^[-A-Za-z0-9_.]+\.html?$/.test(filing.url.slice(prefix.length)))throw Error('Filing source identity mismatch');
 return filing;
}
export function submissionRows(data,cik){
 return (data.form||[]).flatMap((form,i)=>{
  if(!/^(?:10-[KQ]|20-F|40-F)(?:\/A)?$/.test(form))return [];
  const filing={form,accession:data.accessionNumber?.[i],date:data.filingDate?.[i],period:data.reportDate?.[i],url:'https://www.sec.gov/Archives/edgar/data/'+Number(cik)+'/'+String(data.accessionNumber?.[i]).replaceAll('-','')+'/'+data.primaryDocument?.[i]};
  try{return [validateFiling(filing,cik)];}catch{return [];}
 });
}
export function selectPrimaryFilings(filings,asOf){
 const available=filings.filter(f=>f.date<=asOf&&f.period<=asOf&&Number(f.period.slice(0,4))>=HISTORY_START-1).sort((a,b)=>b.date.localeCompare(a.date));
 const annual=[],periods=new Set();for(const f of available)if(['10-K','20-F','40-F'].includes(f.form)&&!periods.has(f.period)){periods.add(f.period);annual.push(f);if(annual.length>=22)break;}
 const latestQuarter=available.find(f=>f.form==='10-Q'),selected=[...(latestQuarter?[latestQuarter]:[]),...annual],dates=new Set(selected.map(f=>f.period));
 const amendments=available.filter(f=>f.form.endsWith('/A')&&dates.has(f.period));
 return [...amendments,...selected].filter((f,i,a)=>a.findIndex(x=>x.accession===f.accession)===i).slice(0,32);
}
export function compileInlineFiling(source,record,filing,sourceSha){
 validateFiling(filing,record.cik);
 const inventory=extractPrimaryInline(source,{record,filing});inventory.source_sha256=sourceSha;const result=appendCriticalStatementFacts(compilePrimaryFilings([inventory],record),[inventory]);
 if(!Object.keys(inventory.selected_statements).length)throw Object.assign(Error('No unambiguous primary statement tables were identified'),{permanent:true});
 attachSecurity(result,source,record,filing,inventory);
 return {result,inventory};
}
export function combinePrimarySupplements(parts,cik){
 const out={schema_version:1,cik:String(Number(cik)),facts:{},sources:[],conflicts:[],rejections:[],security_models:[],listed_class_supplements:{},scope:'Automatically retrieved annual and latest-quarter primary filings; unproven contexts and ambiguous mappings are withheld.'};
 const seenSources=new Set(),blockedClasses=new Set();
 for(const part of parts){
  if(part.schema_version!==1||String(Number(part.cik))!==out.cik)throw Error('Stored primary snapshot identity mismatch');
  for(const s of part.sources||[]){validateFiling(s,cik);if(!seenSources.has(s.accession)){seenSources.add(s.accession);out.sources.push(s);}}
  for(const [name,fact]of Object.entries(part.facts||{})){
   const target=out.facts[name]??={...fact,units:{}};if(target.namespace!==fact.namespace)throw Error('Stored primary snapshot namespace mismatch');
   for(const [unit,points]of Object.entries(fact.units||{}))(target.units[unit]??=[]).push(...points);
  }
  out.conflicts.push(...part.conflicts||[]);out.rejections.push(...part.rejections||[]);out.security_models.push(...part.security_models||[]);
  for(const [ticker,s]of Object.entries(part.listed_class_supplements||{})){
   if(blockedClasses.has(ticker))continue;
   try{const old=out.listed_class_supplements[ticker]||{cik:out.cik,ticker,facts:{},sources:[]},merged=mergeClassFacts(old,s);out.listed_class_supplements[ticker]={...merged,status:'available',sources:[...(old.sources||[]),...(s.sources||(s.source?[s.source]:[]))],scope:'Source-verified selected-class observations.'};}
   catch{blockedClasses.add(ticker);delete out.listed_class_supplements[ticker];out.rejections.push({ticker,reason:'Conflicting listed-class identities across retrieved filings'});}
  }
 }
 out.sources.sort((a,b)=>a.date.localeCompare(b.date));out.security_models.sort((a,b)=>a.asOf.localeCompare(b.asOf));
 return out;
}

function attachSecurity(result,source,record,filing,inventory){
 const options={cik:record.cik,ticker:record.ticker,tickers:record.tickers||[],filing,inventory};
 try{
  const {model}=extractSecurityContext(source,options);result.security_models=[model];
  const tickers=[...new Set([record.ticker,...model.listings.filter(s=>s.kind==='common').map(s=>s.ticker)])].slice(0,12);
  result.listed_class_supplements={};
  for(const ticker of tickers)try{const s=extractListedClassSupplement(source,{...options,ticker});if(s.status==='available'||Object.keys(s.facts||{}).length)result.listed_class_supplements[ticker]=s;}catch{}
 }catch{result.security_extraction_status='unresolved';}
}

export function compileLegacyFiling(inputs,record,filing,html,sourceSha,sourceInputs){
 validateFiling(filing,record.cik);const inventory=extractPrimaryLegacy(inputs,{record,filing});inventory.source_sha256=sourceSha;
 if(!Object.keys(inventory.selected_statements).length)throw Object.assign(Error('No unambiguous consolidated XBRL presentation roles'),{permanent:true});
 for(const evidence of Object.values(inventory.statement_evidence))evidence.inputs=sourceInputs;
 const result=appendCriticalStatementFacts(compilePrimaryFilings([inventory],record),[inventory]);attachSecurity(result,html,record,filing,inventory);return {result,inventory};
}
