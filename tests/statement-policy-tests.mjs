import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {selectStatementSources,templateConcepts} from '../assets/report/statement-source-policy.mjs';
import {toReportPayload,concepts} from '../assets/report/sec-adapter.mjs';
import {missingValueDefinition} from '../assets/report/value-availability.mjs';
const p=(concept,val,form='10-K',filed='2026-02-01')=>({concept,val,form,filed,start:'2025-01-01',end:'2025-12-31',accn:form+filed});
let excluded=[];let selected=selectStatementSources([p('NetIncomeLoss',57048),p('NetIncomeLoss',57000,'DEF 14A','2026-04-01')],'net_income','bank',excluded);assert.equal(selected.length,1);assert.equal(selected[0].val,57048);assert.equal(excluded.length,1);
selected=selectStatementSources([p('NetIncomeLoss',57048),p('NetIncomeLoss',57060,'10-Q','2026-05-01')],'net_income','bank');assert.equal(selected.length,2,'Later financial-statement comparatives remain eligible for restatements');
assert.equal(selectStatementSources([p('NetIncomeLoss',42,'S-1')],'net_income','').length,1,'IPO registration history is retained');
assert.equal(selectStatementSources([p('NetIncomeLoss',42,'8-K')],'net_income','').length,1,'A sole disclosure remains a fallback when no financial statement observation is available');
assert.deepEqual(selectStatementSources([p('NetIncomeLoss',100),p('ProfitLoss',105)],'net_income','').map(p=>p.val),[100]);
assert.deepEqual(selectStatementSources([p('NetIncomeLoss',100),p('ProfitLoss',105)],'cf_net_income','').map(p=>p.val),[105]);
assert.deepEqual(selectStatementSources([p('InvestmentIncomeInterest',28032),p('InterestIncomeOperating',193341)],'interest_income','bank').map(p=>p.val),[193341]);
assert.equal(selectStatementSources([p('InvestmentIncomeInterest',28032)],'interest_income','bank').length,0,'A securities-interest component is not a bank total');
const registryBefore=JSON.stringify(concepts);templateConcepts(concepts,'insurance');templateConcepts(concepts,'bank');assert.equal(JSON.stringify(concepts),registryBefore,'Template bindings do not mutate the shared registry');
const cases=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/statement-policy-facts.json.gz',import.meta.url)))),references=JSON.parse(readFileSync(new URL('../scripts/coverage-pilot/reference-cells.json',import.meta.url)));
let checked=0,matched=0;
for(const [ticker,c]of Object.entries(cases)){
 const before=JSON.stringify(c.data),result=toReportPayload(c.data,c.record),f=result.financials,lookup=key=>['income_statement','balance_sheet','cash_flow'].flatMap(t=>f[t]).find(r=>r.key===key);
 for(const reference of references.filter(r=>r.ticker===ticker&&r.expected!==null)){checked++;const actual=lookup(reference.key)?.values[c.year];if(ticker==='PG'&&reference.key==='cash'||ticker==='CAT'&&reference.key==='interest_expense'){assert.equal(actual,undefined,'Full-filing context is still required for '+ticker+' '+reference.key);}else{assert.ok(Math.abs(actual-reference.expected)<.001,ticker+' '+reference.key+' matches the curated reference');matched++;}}
 assert.equal(JSON.stringify(c.data),before,'Raw observations remain unchanged');
 for(const table of ['income_statement','balance_sheet','cash_flow'])for(const row of f[table])for(const reason of Object.values(row.availability||{}))assert.ok(['unmapped','unavailable','ineligible','unresolved'].includes(reason.status));
 if(ticker==='PG'){const def=missingValueDefinition(lookup('cash'),c.year);assert.match(def.group,/Ineligible/);assert.match(def.formula,/restricted cash|component/);assert.ok(f.source_selection.excluded_observations.some(p=>p.form==='DEF 14A'));}
 if(ticker==='ALL'){assert.equal(lookup('other_expense').availability[c.year].status,'unmapped');assert.equal(lookup('minority_interest_income').values[c.year],16);}
}
assert.equal(checked,60);assert.equal(matched,58);
console.log('Statement policy passes: 58/60 curated values from existing feeds; two require full-filing context. Tests cover source-form precedence, restatement/IPO retention, income scope, bank totals, source immutability and sparse blank reasons.');
