import fs from 'node:fs';
import assert from 'node:assert/strict';
import {toReportPayload} from '../assets/report/sec-adapter.mjs';

const root=new URL('./fixtures/',import.meta.url);
const read=name=>JSON.parse(fs.readFileSync(new URL(name,root)));
const a=toReportPayload(read('aapl-sign-facts.json'));
const reference=read('fastfs-aapl-2025-sign-reference.json').expected;
let compared=0;
for(const [table,refTable] of [['income_statement','income_statement'],['balance_sheet','balance_sheet'],['cash_flow','cashflow_statement']])for(const row of a.financials[table]){
 const expected=reference[table]?.[row.key],actual=row.values['2025'];
 if(expected&&actual){assert.equal(Math.sign(actual),Math.sign(expected),row.key+' sign must match FastFS');compared++;}
}
const b=toReportPayload(read('bobs-sec-facts.json'),read('bobs-sec-profile.json'));
const bq=toReportPayload(read('bobs-sec-facts.json'),{},null,'quarterly');
assert.equal(b.financials.available_periods.annual,false);
assert.equal(b.financials.available_periods.quarterly,true);
assert.match(b.profile.coverage,/annual history unavailable/);
assert.equal(bq.financials.income_statement.find(r=>r.key==='revenue').values['2026Q2'],619.57);
const fixture={asOf:'2026-10-29',facts:{IncomeTaxExpenseBenefit:{units:{USD:[{start:'2025-01-01',end:'2025-12-31',filed:'2026-02-01',form:'10-K',val:-5e6}]}},Revenues:{units:{USD:[{start:'2025-01-01',end:'2025-12-31',filed:'2026-02-01',form:'10-K',val:100e6}]}}}};
assert.equal(toReportPayload(fixture).financials.income_statement.find(r=>r.key==='income_tax').values['2025'],5,'Tax benefits stay positive');
assert.ok(compared>=30,'Must compare actual mapped rows');
console.log('Passed '+compared+' live FastFS row-sign comparisons; BOBS quarterly coverage and positive tax-benefit regression.');

assert.ok(bq.financials.income_statement.find(r=>r.key==='interest_expense').values['2026Q2']<0,'BOBS disclosed nonoperating interest expense is mapped and negative');
