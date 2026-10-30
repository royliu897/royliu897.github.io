import assert from 'node:assert/strict';
import {buildMappingAudit} from '../assets/report/mapping-audit.mjs';
import {mappingRegistry} from '../assets/report/concept-registry.mjs';
import {toReportPayload} from '../assets/report/sec-adapter.mjs';
const annual=(value,extra={})=>({start:'2024-10-01',end:'2025-09-30',val:value,filed:'2025-11-06',accn:'0001403161-25-000089',form:'10-K',...extra});
const fact=(name,points,unit='USD',namespace='us-gaap')=>({namespace,label:name,description:'Source definition of '+name,units:{[unit]:points}});
const data={cik:'1403161',asOf:'2026-10-29',facts:{
 RevenueFromContractWithCustomerExcludingAssessedTax:fact('Revenue',[annual(40e9)]),
 CostsAndExpenses:fact('Total costs',[annual(16.006e9)]),
 PaymentsToAcquireProductiveAssets:fact('Productive assets',[annual(1.482e9)]),
 GeneralAndAdministrativeExpense:fact('G&A',[annual(1.926e9),annual(99e9,{filed:'2027-01-01'})]),
 FutureConcept:fact('Future',[annual(99,{filed:'2027-01-01'})]),
 FootnoteDetail:fact('Footnote',[annual(0)]),
 OtherCurrency:fact('Euro',[annual(-20)],'EUR'),
 PureRate:fact('Rate',[annual(.12)],'pure'),
 WrongDuration:fact('Short period',[annual(5,{start:'2025-08-01'})]),
 CustomSameName:fact('Custom',[annual(123)],'USD','issuer'),
 Assets:fact('Assets',[{...annual(1e9),start:undefined}]),
}};
const payload=toReportPayload(data,{ticker:'V'}),audit=payload.financials.mapping_audit;
assert.ok(audit.rows.find(r=>r.tag==='us-gaap:CostsAndExpenses'));
assert.equal(audit.rows.find(r=>r.tag==='us-gaap:GeneralAndAdministrativeExpense').observations['2025'].value,1.926e9);
assert.ok(!audit.rows.some(r=>r.tag.includes('RevenueFrom')||r.tag.endsWith(':Assets')),'Registered tags stay out of the inventory');
assert.ok(!audit.rows.some(r=>/FutureConcept|WrongDuration/.test(r.tag)));
assert.equal(audit.rows.find(r=>r.tag==='us-gaap:FootnoteDetail').observations['2025'].value,0,'Genuine zeros remain visible');
assert.equal(audit.rows.find(r=>r.unit==='EUR').observations['2025'].value,-20,'Foreign units and original signs are retained');
assert.equal(audit.rows.find(r=>r.unit==='pure').observations['2025'].value,.12,'Pure ratios are not silently multiplied by 100');
assert.ok(audit.rows.every(r=>!r.observations.TTM));
assert.equal(audit.rows[0].observations['2025'].source_url,'https://www.sec.gov/Archives/edgar/data/1403161/000140316125000089/');
assert.equal(audit.ai_status,'not_connected');assert.match(audit.scope,/residual Other/);
assert.equal(payload.financials.income_statement.find(r=>r.key==='gross_profit').values['2025'],undefined,'Audit must not manufacture Visa gross profit');
assert.ok(mappingRegistry().find(r=>r.target==='revenue').tags.includes('Revenues'));
// Same local name in a custom taxonomy cannot hide behind a standard alias.
const custom=structuredClone(data);custom.facts.Revenue= fact('Custom revenue',[annual(8)],'USD','issuer');
assert.ok(buildMappingAudit(custom,payload.financials).rows.some(r=>r.tag==='issuer:Revenue'));
// Quarterly raw disclosures preserve standalone, YTD and annual contexts separately.
const q={cik:'1403161',asOf:'2026-10-29',facts:{Unregistered:fact('Raw',[
 annual(5,{start:'2026-04-01',end:'2026-06-30',filed:'2026-07-29'}),
 annual(14,{start:'2025-10-01',end:'2026-06-30',filed:'2026-07-29'}),
 annual(5,{start:undefined,end:'2026-06-30',filed:'2026-07-29'})])}};
const qa=buildMappingAudit(q,{columns:['2026Q3'],period_dates:['2026-06-30']},true);
assert.deepEqual(qa.rows.map(r=>r.kind).sort(),['YTD','instant','quarter']);
const duplicate=structuredClone(data);duplicate.facts.CostsAndExpenses.units.USD.push(annual(1));
assert.equal(buildMappingAudit(duplicate,payload.financials).rows.find(r=>r.tag==='us-gaap:CostsAndExpenses').observations['2025'].conflicts.length,1);
assert.equal(data.facts.CostsAndExpenses.units.USD[0].conflicts,undefined,'Raw observations stay immutable');
console.log('Mapping audit passes: explicit registry, period/cutoff/unit/classification isolation, source links, conflicts, zero/sign preservation and no invented gross profit.');
