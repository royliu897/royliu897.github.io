// Audit saved native-currency report payloads without additional provider calls.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {reviewSnapshot,compareReviewSnapshots} from '../assets/report/data-review.mjs';
const args=process.argv.slice(2),directory=args[0];
const option=name=>{const index=args.indexOf(name);if(index<0)return null;if(!args[index+1]||args[index+1].startsWith('--'))throw Error('Missing value for '+name);return args[index+1];};
if(!directory||directory.startsWith('--'))throw Error('Usage: node scripts/audit-report-quality.mjs PAYLOAD_DIRECTORY [--baseline prior.json] [--output review.json] [--strict]');
const baselineFile=option('--baseline'),output=option('--output');
const prior=baselineFile?JSON.parse(await readFile(baselineFile,'utf8')):null;
if(prior&&prior.version!==1)throw Error('Unsupported audit baseline version');
const records=[],seen=new Set();
for(const file of (await readdir(directory)).filter(f=>f.endsWith('.json')).sort()){
 const payload=JSON.parse(await readFile(path.join(directory,file),'utf8'));
 if(!payload.financials||!payload.profile)throw Error(file+' is not a report payload');
 const snapshot=reviewSnapshot(payload),identity=snapshot.cik+'|'+snapshot.symbol;
 if(seen.has(identity))throw Error('Duplicate security payload: '+identity);seen.add(identity);
 const before=prior?.records?.find(r=>r.snapshot.cik===snapshot.cik&&r.snapshot.symbol===snapshot.symbol)?.snapshot;
 const changes=before?compareReviewSnapshots(before,snapshot):[];
 const failedChecks=snapshot.periods.flatMap(p=>p.checks.filter(c=>c.status==='review').map(c=>({period:p.period,...c})));
 records.push({snapshot,changes,failed_checks:failedChecks});
}
if(!records.length)throw Error('No report payloads found');
const missingSecurities=(prior?.records||[]).filter(r=>!seen.has(r.snapshot.cik+'|'+r.snapshot.symbol)).map(r=>r.snapshot.symbol);
const exceptions=records.reduce((n,r)=>n+r.changes.length+r.failed_checks.length,missingSecurities.length);
const result={version:1,generated_at:new Date().toISOString(),scope:'Loaded-source coverage and reconciliation; changed values can be legitimate filing revisions. Not a completeness guarantee.',status:exceptions?'review':'no_exceptions',missing_securities:missingSecurities,records};
if(output)await writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({securities:records.length,exceptions,status:result.status,baseline:!!prior}));
if(args.includes('--strict')&&exceptions)process.exitCode=2;
