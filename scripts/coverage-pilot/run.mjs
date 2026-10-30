import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolvePilot} from './resolver.mjs';
const root='/home/royl/projects/sftsaf/coverage-pilot';
for(const ticker of process.argv.slice(2)){
 const dir=root+'/'+ticker,baseline=JSON.parse(readFileSync(dir+'/baseline.json')),inventory=JSON.parse(readFileSync(dir+'/inventory.json')),calcs=existsSync(dir+'/calculations.json')?JSON.parse(readFileSync(dir+'/calculations.json')):[],{payload,audit}=resolvePilot(baseline,inventory,calcs,JSON.parse(readFileSync(dir+'/metadata.json')).profile.filings);
 writeFileSync(dir+'/pilot.json',JSON.stringify(payload));writeFileSync(dir+'/audit.json',JSON.stringify(audit,null,2));
 console.log(JSON.stringify({ticker,template:audit.template,before:audit.before_populated,after:audit.after_populated,visible:audit.visible_cells,recovered:audit.recoveries.map(r=>[r.key,r.value,r.evidence.rule]),corrections:audit.corrections.map(c=>[c.key,c.before,c.after]),conflicts:audit.conflicts.map(c=>[c.key,c.existing,c.filing]),unsupported:audit.unsupported_template_keys}));
}
