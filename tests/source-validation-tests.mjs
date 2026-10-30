import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {extractClassFacts} from '../sec-worker/class-facts.mjs';
import {mergeClassFacts,needsClassSupplement,supplementClassFacts} from '../assets/report/filing-supplement.mjs';
import {toReportPayload,reportCurrencySymbol} from '../assets/report/sec-adapter.mjs';
const xml=await readFile(new URL('./fixtures/visa-2025-class-instance.xml',import.meta.url),'utf8');
const source=JSON.parse(await readFile(new URL('./fixtures/visa-class-source.json',import.meta.url),'utf8'));
const parsed=extractClassFacts(xml,{cik:'1403161',ticker:'V',filing:source});
assert.equal(parsed.share_class.identity,'StatementClassOfStockAxis:A');
const data=mergeClassFacts({cik:'1403161',asOf:'2026-10-29',facts:{}},parsed);
const payload=toReportPayload(data,{ticker:'V'},null,'annual','NYSE.V');
const row=key=>[...payload.financials.income_statement,...payload.financials.balance_sheet].find(r=>r.key===key);
assert.equal(row('eps_basic').values['2025'],10.22);
assert.equal(row('eps_diluted').values['2025'],10.20);
assert.equal(row('shares_basic').values['2025'],1714);
assert.equal(row('shares_diluted').values['2025'],1966);
assert.equal(row('net_income').values['2025'],20058,'Class A basic allocated income must never overwrite consolidated income');
assert.equal(row('shareholders_equity').values['2025'],37909,'Total equity 37,915 minus disclosed NCI 6');
assert.ok(payload.financials.validation.checks.length>=3);
assert.ok(payload.financials.validation.checks.every(c=>c.status==='pass'));
assert.equal(row('eps_basic').provenance['2025'].source_url,source.url);
assert.throws(()=>extractClassFacts(xml,{cik:'320193',ticker:'V',filing:source}),/entity/);
assert.equal(extractClassFacts(xml,{cik:'1403161',ticker:'WRONG',filing:source}).status,'unavailable');
assert.throws(()=>mergeClassFacts(data,{...parsed,cik:'320193'}),/identity/);
assert.throws(()=>mergeClassFacts(data,{...parsed,share_class:{identity:'StatementClassOfStockAxis:B'}}),/classes/);
assert.equal(needsClassSupplement(data),false,'Normal complete recent source does not fetch supplements');
const empty={cik:'2120882',asOf:'2026-10-29',facts:{}};
for(const ticker of ['SKHY','HXSCL']){
 const p=toReportPayload(empty,{ticker},null,'annual',ticker);
 assert.equal(p.profile.currency,null);assert.equal(p.financials.source_coverage.status,'unavailable');
 assert.match(p.profile.coverage,/untagged/);assert.equal(p.price,null);
 assert.ok(p.financials.income_statement.every(r=>!Object.keys(r.values).length));
}
assert.equal(reportCurrencySymbol('KRW'),'₩');
// An annual/YTD denominator can be reconstructed without summing quarterly EPS.
const synthetic=structuredClone(data),add=(name,unit,points)=>synthetic.facts[name]={units:{[unit]:points.map(p=>({...p,form:'10-Q',filed:'2026-08-01',accn:'test-q'}))}};
const duration=(start,end,val)=>({start,end,val});
add('RevenueFromContractWithCustomerExcludingAssessedTax','USD',[duration('2025-10-01','2026-06-30',30e9)]);
for(const name of ['WeightedAverageNumberOfSharesOutstandingBasic','WeightedAverageNumberOfDilutedSharesOutstanding'])synthetic.facts[name].units.shares.push(...[duration('2025-10-01','2026-06-30',1900e6),duration('2024-10-01','2025-06-30',2000e6)].map(p=>({...p,form:'10-Q',filed:'2026-08-01',accn:'test-q',share_class:parsed.share_class.identity})));
const syntheticReport=toReportPayload(synthetic,{ticker:'V'}).financials;
assert.ok(syntheticReport.income_statement.find(r=>r.key==='shares_diluted').values.TTM>1800);
// A response from another issuer is flagged rather than merged.
const deficient={...data,facts:{Assets:data.facts.Assets}};
const wrong=await supplementClassFacts(deficient,{cik:'1403161',ticker:'V'},{filings:[source]},async()=>({...parsed,cik:'320193'}));
assert.equal(wrong.filing_supplement.status,'unavailable');
console.log('Source validation passes: actual Visa multi-class SEC fixture, exact EPS/equity, independent identities, CIK/class isolation, weighted TTM shares and honest SK hynix coverage.');
