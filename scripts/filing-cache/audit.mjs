import {readFile,readdir,writeFile} from 'node:fs/promises';
import {mergePrimaryFilings} from '../../assets/report/primary-filing-supplement.mjs';
import {toReportPayload} from '../../assets/report/sec-adapter.mjs';
const [cacheRoot,output]=process.argv.slice(2),publicRoot=new URL('../../assets/report/data/filings/',import.meta.url),manifest=JSON.parse(await readFile(new URL('manifest.json',publicRoot),'utf8'));
const references=JSON.parse(await readFile(new URL('../coverage-pilot/reference-cells.json',import.meta.url),'utf8')),results=[];
for(const [cik,entry]of Object.entries(manifest.companies)){
 const data=JSON.parse(await readFile(cacheRoot+'/'+cik+'/facts.json','utf8')),supplement=JSON.parse(await readFile(new URL(entry.file,publicRoot),'utf8'));
 const accession=(await readdir(cacheRoot+'/'+cik)).find(n=>/^\d{10}-\d{2}-\d{6}$/.test(n)),metadata=JSON.parse(await readFile(cacheRoot+'/'+cik+'/'+accession+'/metadata.json','utf8')),record={...metadata.record,...metadata.profile};
 const before=toReportPayload(data,record),enriched=mergePrimaryFilings(data,supplement),start=performance.now(),report=toReportPayload(enriched,record),normalizeMs=performance.now()-start;
 const rows=r=>['income_statement','balance_sheet','cash_flow'].flatMap(t=>r.financials[t]),find=(r,key,year)=>rows(r).find(row=>row.key===key)?.values[year];
 const selected=references.filter(r=>r.ticker===entry.ticker&&r.expected!==null).map(ref=>({key:ref.key,period:ref.period,expected:ref.expected,actual:find(report,ref.key,ref.period.slice(0,4))??null,assessment:entry.ticker==='CAT'&&ref.key==='interest_expense'?'scope_excluded':'assessed',pass:entry.ticker==='CAT'&&ref.key==='interest_expense'?undefined:Math.abs(find(report,ref.key,ref.period.slice(0,4))-ref.expected)<.001}));
 const changed=[];for(const row of rows(report))for(const [period,value]of Object.entries(row.values))if(/^\d{4}$/.test(period)&&find(before,row.key,period)!==value)changed.push({key:row.key,period,before:find(before,row.key,period)??null,after:value,source:row.provenance?.[period]});
 const sourceMatches=[];
 for(const [name,fact]of Object.entries(supplement.facts))for(const [unit,points]of Object.entries(fact.units))for(const p of points){if(p.unresolved||p.filed>data.asOf)continue;const year=p.end.slice(0,4),row=rows(report).find(r=>r.key===p.mapping_key),provenance=row?.provenance?.[year];if(!row||provenance?.accn!==p.accn)continue;sourceMatches.push({key:p.mapping_key,period:p.end,concept:name,unit,accession:p.accn});}
 results.push({ticker:entry.ticker,cik,filings:supplement.sources.length,bytes:entry.bytes,normalization_ms:Math.round(normalizeMs*100)/100,columns:report.financials.columns.filter(c=>/^\d{4}$/.test(c)).length,selected_references:selected,primary_cells_with_selected_accession:sourceMatches.length,source_conflicts:supplement.conflicts,scope_rejections:supplement.rejections,validation:report.financials.validation,changed});
}
const assessed=results.flatMap(r=>r.selected_references).filter(r=>r.assessment==='assessed'),summary={issuers:results.length,filings:results.reduce((n,r)=>n+r.filings,0),selected_reference_pass:assessed.filter(r=>r.pass).length,selected_reference_assessed:assessed.length,scope_excluded:results.flatMap(r=>r.selected_references).filter(r=>r.assessment==='scope_excluded'),failures:assessed.filter(r=>!r.pass),source_inventory_bytes:results.reduce((n,r)=>n+r.bytes,0),limitation:'Selected references and accounting consistency checks are not a completeness percentage. Corpus was used during development, not an untouched holdout.'};
if(output)await writeFile(output,JSON.stringify({generated_at:new Date().toISOString(),summary,results},null,2));
console.log(JSON.stringify(summary,null,2));
if(summary.failures.length)process.exitCode=1;
