import {readdir,readFile,mkdir,writeFile,rename,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {reviewedScopeInventories} from './reviewed-scopes.mjs';
import {extractSecurityContext,extractListedClassSupplement,combineListedClassSupplements,validateListedClassHistory} from './security-context.mjs';
import {compilePrimaryFilings} from '../../assets/report/primary-filing-supplement.mjs';
const [cacheRoot,outputRoot]=process.argv.slice(2);
if(!cacheRoot||!outputRoot)throw Error('Usage: node scripts/filing-cache/build.mjs CACHE_ROOT PUBLIC_OUTPUT');
await mkdir(outputRoot,{recursive:true});
let manifest={schema_version:1,companies:{}};
try{manifest=JSON.parse(await readFile(outputRoot+'/manifest.json','utf8'));}catch{}
const report=[];
for(const cik of await readdir(cacheRoot)){
 if(!/^\d+$/.test(cik))continue;
 const inventories=[],securityModels=[],classSupplements=new Map(),securityFailures=[];let record;
 for(const accession of await readdir(cacheRoot+'/'+cik)){
  if(!/^\d{10}-\d{2}-\d{6}$/.test(accession))continue;
  const folder=cacheRoot+'/'+cik+'/'+accession;
  try{await access(folder+'/extraction-error.json');report.push({cik,accession,status:'not_built',reason:'Extraction validation failed; existing feed remains in use'});continue;}catch(error){if(error.code!=='ENOENT')throw error;}
  try{const inventory=JSON.parse(await readFile(folder+'/inventory.json','utf8'));inventories.push(inventory);const metadata=JSON.parse(await readFile(folder+'/metadata.json','utf8'));record={...metadata.profile,...metadata.record,industry:metadata.profile?.industry};
   const text=await readFile(folder+'/filing.htm','utf8'),options={cik:record.cik,ticker:record.ticker,tickers:record.tickers||[],filing:metadata.filing,inventory};
   let selectedTickers=[record.ticker];
   try{const security=extractSecurityContext(text,options);securityModels.push(security.model);selectedTickers=[...new Set([record.ticker,...security.model.listings.filter(s=>s.kind==='common').map(s=>s.ticker)])];}catch(error){securityFailures.push({accession,stage:'security_cover',reason:error.message});}
   for(const ticker of selectedTickers)try{if(!classSupplements.has(ticker))classSupplements.set(ticker,[]);classSupplements.get(ticker).push(extractListedClassSupplement(text,{...options,ticker}));}catch(error){securityFailures.push({accession,ticker,stage:'listed_class',reason:error.message});}}
  catch(error){if(error.code==='ENOENT'){report.push({cik,accession,status:'not_built',reason:'No supported extracted inventory; existing feed remains in use'});continue;}throw Error('Invalid cache '+folder+': '+error.message);}
 }
 if(!record||!inventories.length)continue;
 try{for(const reviewed of await reviewedScopeInventories(cacheRoot,cik)){
  const existing=inventories.find(i=>i.filing.accession===reviewed.filing.accession);
  if(existing){const ids=new Set(existing.facts.map(p=>[p.qname,p.start,p.end,p.context_ref,p.label].join('|')));existing.facts.push(...reviewed.facts.filter(p=>!ids.has([p.qname,p.start,p.end,p.context_ref,p.label].join('|'))));existing.statement_evidence={...existing.statement_evidence,...reviewed.statement_evidence};}
  else inventories.push(reviewed);
 }}catch(error){if(error.code==='ENOENT')report.push({cik,status:'review_not_applied',reason:'Registered legacy source evidence is absent from this partial offline cache'});else throw error;}

 inventories.sort((a,b)=>a.filing.date.localeCompare(b.filing.date));
 const result=compilePrimaryFilings(inventories,record);
 securityModels.sort((a,b)=>a.asOf.localeCompare(b.asOf));
 result.security_models=securityModels;result.security_model=securityModels.at(-1)||null;
 result.listed_class_supplements=Object.fromEntries([...classSupplements].map(([ticker,values])=>[ticker,combineListedClassSupplements(values,{cik:record.cik,ticker})]));
 for(const [ticker,values]of classSupplements){
  const folder=cacheRoot+'/'+cik+'/listed-class-history/'+ticker,expectedClass=result.listed_class_supplements[ticker]?.share_class?.identity;
  let names;try{names=await readdir(folder);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  for(const name of names){if(!/^\d{10}-\d{2}-\d{6}\.json$/.test(name))continue;try{values.push(validateListedClassHistory(JSON.parse(await readFile(folder+'/'+name,'utf8')),{cik:record.cik,ticker,expectedClass}));}catch(error){securityFailures.push({ticker,file:name,stage:'historical_listed_class',reason:error.message});}}
  values.sort((a,b)=>(a.source?.date||'').localeCompare(b.source?.date||''));result.listed_class_supplements[ticker]=combineListedClassSupplements(values,{cik:record.cik,ticker});
 }
 result.listed_class_supplement=result.listed_class_supplements[record.ticker];
 if(securityFailures.length)result.security_extraction_failures=securityFailures;
 const body=JSON.stringify(result),hash=createHash('sha256').update(body).digest('hex').slice(0,16),file='CIK'+Number(cik)+'-'+hash+'.json';
 await writeFile(outputRoot+'/'+file,body);
 manifest.companies[String(Number(cik))]={file,ticker:record.ticker,latest_period:inventories.map(i=>i.filing.period).sort().at(-1),filings:inventories.length,bytes:Buffer.byteLength(body)};
 report.push({cik,ticker:record.ticker,filings:inventories.length,bytes:Buffer.byteLength(body),concepts:Object.keys(result.facts).length,conflicts:result.conflicts.length,rejected_scopes:result.rejections.length,single_common:result.security_model?.eligible_single_common_class,common_class_contexts:result.security_model?.common_context_classes,class_supplement:result.listed_class_supplement.status,class_concepts:Object.keys(result.listed_class_supplement.facts||{}).length,security_failures:securityFailures});
}
// Publish the manifest last so readers never see a partially written object.
await writeFile(outputRoot+'/manifest.json.tmp',JSON.stringify(manifest));await rename(outputRoot+'/manifest.json.tmp',outputRoot+'/manifest.json');
console.log(JSON.stringify(report,null,2));
