// Compare every displayed CAGR with independently evaluated endpoint eligibility.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {loadStatisticsEvaluator} from './statistics-evaluator.mjs';
import {auditCagrGroups} from '../../assets/report/cagr-availability.mjs';
const args=process.argv.slice(2),directory=args[0],output=args.includes('--output')?args[args.indexOf('--output')+1]:null;
if(!directory||directory.startsWith('--'))throw Error('Usage: node scripts/report-frontend/audit-statistics.mjs PAYLOAD_DIRECTORY [--output FILE] [--strict]');
const evaluate=await loadStatisticsEvaluator(),results=[];
for(const file of (await readdir(directory)).filter(f=>f.endsWith('.json')).sort()){
 const p=JSON.parse(await readFile(path.join(directory,file),'utf8'));if(!p.financials)throw Error(file+' is not a report payload');
 const f=p.financials;if(f.company_type==='fund')continue;
 const groups=evaluate(f).groups,audit=auditCagrGroups(f,groups);results.push({symbol:f.ticker||file,cik:f.cik,...audit});
}
if(!results.length)throw Error('No eligible report payloads');
const issues=results.flatMap(r=>r.issues.map(issue=>({symbol:r.symbol,...issue}))),counts={};for(const r of results)for(const c of r.cells)counts[c.status]=(counts[c.status]||0)+1;
const result={scope:'Checks the deployed CAGR renderer against source-row endpoints. Does not independently establish that source mappings or filing coverage are complete.',securities:results.length,counts,issues,results};
if(output)await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({securities:results.length,counts,issues}));if(args.includes('--strict')&&issues.length)process.exitCode=2;
