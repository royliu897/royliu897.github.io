import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {mergePrimaryFilings} from '../../assets/report/primary-filing-supplement.mjs';
import {toReportPayload} from '../../assets/report/sec-adapter.mjs';
const [cacheArgument,output]=process.argv.slice(2);if(!cacheArgument)throw Error('Usage: node scripts/filing-cache/check-quarter.mjs EXTERNAL_CACHE_ROOT [RESULTS_JSON]');
const read=p=>JSON.parse(readFileSync(p,'utf8')),root=fileURLToPath(new URL('../../assets/report/data/filings/',import.meta.url)),cache=resolve(cacheArgument)+'/',manifest=read(join(root,'manifest.json')),results=[];
for(const [cik,entry]of Object.entries(manifest.companies)){
 const supplement=read(root+entry.file),source=supplement.sources.filter(s=>s.form.startsWith('10-Q')).sort((a,b)=>b.date.localeCompare(a.date))[0];if(!source)continue;
 const metadata=read(cache+cik+'/'+source.accession+'/metadata.json'),record={...metadata.record,...metadata.profile},raw=read(cache+cik+'/facts.json'),merged=mergePrimaryFilings(raw,supplement),f=toReportPayload(merged,record,null,'quarterly').financials,rows=[...f.income_statement,...f.balance_sheet,...f.cash_flow];let checked=0;const failures=[];
 for(const [name,fact]of Object.entries(supplement.facts))for(const [unit,points]of Object.entries(fact.units))for(const p of points){
  if(p.accn!==source.accession||p.end!==source.period||p.unresolved||p.excluded_from_mapping||!['revenue','operating_income','total_assets','cash','cash_from_operations'].includes(p.mapping_key))continue;
  if(p.start&&(Date.parse(p.end)-Date.parse(p.start))/86400000>110)continue;
  const at=f.period_dates.indexOf(p.end),label=f.columns[at],actual=rows.find(r=>r.key===p.mapping_key)?.values[label];checked++;if(!Number.isFinite(actual)||Math.abs(actual-p.val/1e6)>.001)failures.push({key:p.mapping_key,unit,label,expected:p.val/1e6,actual:actual??null});
 }
 const cutoff=new Date(Date.parse(source.date)-86400000).toISOString().slice(0,10),prior=mergePrimaryFilings({...raw,asOf:cutoff},supplement),leaked=Object.values(prior.facts).flatMap(f=>Object.values(f.units).flat()).filter(p=>p.source_priority==='primary-statement'&&p.accn===source.accession).length;
 results.push({ticker:entry.ticker,quarter:source.period,checked,failures,as_of_leaked_primary_observations:leaked});
}
const report={generated_at:new Date().toISOString(),scope:'Direct cached current-quarter or instant observations compared with quarterly report output, and day-before-filing primary-observation cutoff. Not an independent audit of all quarterly disclosures.',checks:results.reduce((n,r)=>n+r.checked,0),results};if(output)writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(results.some(r=>r.failures.length||r.as_of_leaked_primary_observations))process.exitCode=1;
