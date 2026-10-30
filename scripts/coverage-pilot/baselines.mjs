import {readFileSync,writeFileSync} from 'node:fs';
import {toReportPayload} from '/home/royl/royliu897.github.io/assets/report/sec-adapter.mjs';
const root='/home/royl/projects/sftsaf/coverage-pilot';
for(const ticker of process.argv.slice(2)){
 const dir=root+'/'+ticker,m=JSON.parse(readFileSync(dir+'/metadata.json')),facts=JSON.parse(readFileSync(dir+'/facts.json')),p=toReportPayload(facts,{...m.record,...m.profile},null,'annual',m.record.exchange+':'+ticker),year=p.financials.columns.filter(c=>/^\d{4}$/.test(c)).at(-1);
 writeFileSync(dir+'/baseline.json',JSON.stringify(p));
 console.log(ticker,p.financials.company_type||'general',year,JSON.stringify(['income_statement','balance_sheet','cash_flow'].map(t=>[t,p.financials[t].filter(r=>!r.key.startsWith('_')&&r.values[year]==null).map(r=>r.key)])));
}
