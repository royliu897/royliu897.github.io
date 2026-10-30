// Offline inventory: candidates are not automatically promoted to table rows.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {concepts} from '../assets/report/sec-adapter.mjs';
export function auditReportCoverage(data){
 const targets=new Map();
 for(const [key,[names]]of Object.entries(concepts))for(const name of names){if(!targets.has(name))targets.set(name,[]);targets.get(name).push(key);}
 const observed=[];
 for(const [concept,fact]of Object.entries(data.facts||{}))for(const [unit,points]of Object.entries(fact.units||{})){
  const eligible=points.filter(p=>Number.isFinite(p.val)&&p.end&&p.end<=data.asOf&&(!p.filed||p.filed<=data.asOf));
  const latest=eligible.sort((a,b)=>b.end.localeCompare(a.end)||(b.filed||'').localeCompare(a.filed||''))[0];
  if(!latest)continue;
  observed.push({concept,label:fact.label,namespace:fact.namespace,unit,period_start:latest.start||null,period_end:latest.end,filed:latest.filed,accession:latest.accn,value:latest.val,canonical_targets:targets.get(concept)||[]});
 }
 const mapped=observed.filter(p=>p.canonical_targets.length),unmapped=observed.filter(p=>!p.canonical_targets.length);
 return {cik:data.cik,asOf:data.asOf,schema_version:1,scope:'SEC CompanyFacts observations only; not a full filing-disclosure inventory',observed_concept_units:observed.length,mapped_concept_units:mapped.length,unmapped_concept_units:unmapped.length,unmapped_disclosures:unmapped,notes:['Unmapped is not synonymous with missing financial-statement rows. Notes, dimensions, duplicate totals and supplemental metrics need review.','Custom tags, dimensional breakdowns and untagged tables require filing-level ingestion.','A canonical target indicates a configured mapping, not proof that every period was selected or all accounting semantics agree.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const path=process.argv[2];if(!path)throw Error('Usage: node scripts/audit-report-coverage.mjs /path/to/worker-facts.json');
 console.log(JSON.stringify(auditReportCoverage(JSON.parse(fs.readFileSync(path))),null,2));
}
