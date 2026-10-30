import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {resolvePilot} from '../scripts/coverage-pilot/resolver.mjs';
const fixture=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/coverage-pilot-cases.json.gz',import.meta.url))));
const files={'baseline.json':'baseline','inventory.json':'inventory','metadata.json':'metadata','calculations.json':'calculations'};
const load=(ticker,file)=>file==='metadata.json'?{profile:{filings:fixture.cases[ticker].forms}}:fixture.cases[ticker][files[file]];
const baseline=load('PG','baseline.json'),inventory=load('PG','inventory.json'),forms=load('PG','metadata.json').profile.filings,original=JSON.stringify(baseline);
const run=(i=inventory,b=baseline)=>resolvePilot(b,i,[],forms);
const first=run(),get=(result,key)=>result.audit.ledger.find(l=>l.key===key)?.after;
assert.equal(get(first,'cash'),9942);assert.equal(get(first,'treasury_stock'),-143008);assert.equal(get(first,'net_income'),16046);assert.equal(get(first,'cf_net_income'),16144);assert.equal(JSON.stringify(baseline),original,'Baseline and source are immutable');
assert.throws(()=>run({...inventory,cik:'1'}),/issuer/);assert.throws(()=>run({...inventory,filing:{...inventory.filing,period:'2024-06-30'}}),/period/);
function mutateTreasury(change){const copy=structuredClone(inventory);for(const p of copy.facts)if(p.name==='TreasuryStockCommonValue')change(p);return copy;}
assert.equal(get(run(mutateTreasury(p=>{p.namespace='invented';p.namespace_uri='https://example.invalid/';})),'treasury_stock'),null,'Local tag name cannot substitute for a verified standard namespace');
assert.equal(get(run(mutateTreasury(p=>{p.dimensions=[{axis:'srt:BusinessSegmentsAxis',member:'x:SomeSubsidiary'}];p.statement=null;})),'treasury_stock'),null,'Segment facts cannot silently replace consolidated totals');
assert.equal(get(run(mutateTreasury(p=>{p.unit='shares';})),'treasury_stock'),null,'Share counts cannot fill monetary balances');
assert.equal(get(run(mutateTreasury(p=>{p.end='2024-06-30';})),'treasury_stock'),null,'Wrong periods are excluded');
assert.ok(get(run(mutateTreasury(p=>{p.value=0;})),'treasury_stock')===0,'Reported zero is retained');
const mixed=structuredClone(inventory),t=mixed.facts.find(p=>p.name==='TreasuryStockCommonValue'&&p.statement==='balance_sheet');mixed.facts.push({...t,value:t.value+1000000000});const conflicted=run(mixed);assert.equal(get(conflicted,'treasury_stock'),null);assert.equal(conflicted.audit.ledger.find(l=>l.key==='treasury_stock').status,'unresolved');
const restricted=structuredClone(inventory);for(const p of restricted.facts)if(p.name==='CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents')p.label='Cash, cash equivalents and restricted cash';assert.equal(get(run(restricted),'cash'),null,'A broader cash balance cannot fill a narrower cash row without source-caption qualification');
const unknownForms=resolvePilot(baseline,inventory,[],[]);assert.equal(get(unknownForms,'net_income'),16100,'Do not replace existing facts without source-selection evidence');assert.ok(unknownForms.audit.conflicts.some(c=>c.key==='net_income'));
const jb=load('JPM','baseline.json'),ji=load('JPM','inventory.json'),jc=load('JPM','calculations.json'),jf=load('JPM','metadata.json').profile.filings,jr=resolvePilot(jb,ji,jc,jf);assert.equal(get(jr,'securities_investments'),777332);assert.equal(get(jr,'gross_loans'),1493429);assert.equal(get(jr,'interest_income'),193341);
const subtotal=jr.audit.recoveries.find(r=>r.key==='securities_investments').evidence.inputs.find(p=>p.rule==='Reported subtotal verified by calculation linkbase').concept,renamed=structuredClone(ji),renamedCalc=structuredClone(jc);
for(const p of renamed.facts)if(p.qname===subtotal)p.qname='otherissuer:OpaqueSubtotal';for(const c of renamedCalc)if(c.parent===subtotal)c.parent='otherissuer:OpaqueSubtotal';assert.equal(get(resolvePilot(jb,renamed,renamedCalc,jf),'securities_investments'),777332,'Structural subtotal rule is independent of the issuer extension tag');
for(const p of renamed.facts)if(p.qname==='otherissuer:OpaqueSubtotal')p.value+=1e9;assert.equal(get(resolvePilot(jb,renamed,renamedCalc,jf),'securities_investments'),null,'Nonreconciling subtotals are rejected');
let checked=0,heldoutChecked=0;
for(const [ticker,c]of Object.entries(fixture.cases)){
 const result=resolvePilot(c.baseline,c.inventory,c.calculations,c.forms);
 for(const ref of fixture.references.filter(r=>r.ticker===ticker&&r.expected!==null)){assert.ok(Math.abs(get(result,ref.key)-ref.expected)<.001,ticker+' '+ref.key+' matches curated source reference');checked++;if(['KO','COST','BAC','ALL'].includes(ticker))heldoutChecked++;}
 for(const l of result.audit.ledger){assert.ok(['available','unmapped','unavailable','ineligible','unresolved'].includes(l.status));assert.ok(l.after===null||Number.isFinite(l.after));}
}
assert.equal(checked,60);assert.equal(heldoutChecked,28);
console.log('Pilot passes: 60 historical numerical targets (including one narrower-scope CAT target excluded from production), held-out checks, source immutability, source-form precedence, namespace/unit/period/dimension guards, zero retention, conflict abstention, and calculation-graph structural equivalence.');

assert.equal(get(first,'minority_interest_income'),-98);const cat=resolvePilot(load('CAT','baseline.json'),load('CAT','inventory.json'),load('CAT','calculations.json'),load('CAT','metadata.json').profile.filings);assert.equal(get(cat,'minority_interest_income'),2);

assert.equal(get(first,'other_equity'),-596,'Residual is refreshed after restoring treasury stock; matches the separately disclosed ESOP reserve');
