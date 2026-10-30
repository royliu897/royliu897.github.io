import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeTaiwanStatement} from '../sec-worker/taiwan-financials.mjs';
import {toReportPayload} from '../assets/report/sec-adapter.mjs';
import {translatePayloadToUsd} from '../assets/report/usd-display.mjs';
import {nativeValuation} from '../assets/report/native-valuation.mjs';
import {normalizeShareSeries} from '../assets/report/share-basis.mjs';
import {resolveDefinition,definitionById} from '../assets/report/definition-graph.mjs';
const text=readFileSync(new URL('./fixtures/mops-tsmc-2025.xhtml',import.meta.url),'utf8'),old=readFileSync(new URL('./fixtures/mops-tsmc-2015.xml',import.meta.url),'utf8'),profile={ticker:'2330'},asOf='2026-10-29';
const result=normalizeTaiwanStatement(text,profile,2025,4,asOf),data={cik:'TWSE2330',asOf,provider:'Taiwan MOPS',facts:result.facts},p=toReportPayload(data,profile,{price:2415,currency:'TWD'},'annual','TWSE:2330'),f=p.financials;
const v=(table,key,year='2025')=>f[table].find(r=>r.key===key)?.values[year];
assert.equal(result.facts.Revenue.units.TWD[0].val,3809054272000);assert.equal(v('income_statement','revenue'),3809054.272);assert.equal(v('income_statement','eps_basic'),66.26);assert.equal(v('income_statement','cogs'),1527760.293);
assert.equal(v('balance_sheet','long_term_debt'),896061.999);assert.equal(v('cash_flow','cf_capex'),-1271613.484);assert.equal(v('cash_flow','free_cash_flow'),1002565.096);assert.equal(v('cash_flow','cf_dna'),688096.37);assert.equal(v('cash_flow','cf_working_capital'),-96752.05);assert.equal(v('cash_flow','cf_dividends'),-466779.199);
assert.equal(f.validation.checks.filter(c=>c.status==='review').length,0);assert.equal(result.conflicts.length,0);
assert.equal(result.facts.Revenue.units.TWD[0].publication_date_unknown,true);
for(const bad of [text.replace('Consolidated report','Individual report'),text.replace('name="tifrs-notes:CompanyID" contextRef="AsOf20251231">2330','name="tifrs-notes:CompanyID" contextRef="AsOf20251231">2317')]){
 if(bad===text)continue;assert.throws(()=>normalizeTaiwanStatement(bad,profile,2025,4,asOf));
}
assert.throws(()=>normalizeTaiwanStatement(text,{ticker:'2317'},2025,4,asOf),/identity|metadata/);assert.throws(()=>normalizeTaiwanStatement(text,profile,2024,4,asOf),/metadata/);assert.throws(()=>normalizeTaiwanStatement(text,profile,2025,2,asOf),/metadata/);
const legacy=normalizeTaiwanStatement(old,profile,2015,4,asOf);assert.equal(legacy.facts.BasicEarningsLossPerShare.units['TWD/shares'][0].val,11.82);assert.equal(legacy.facts.TW_tifrs_bsci_ci_OperatingRevenue.units.TWD[0].val,843497368000);
// Source observations remain immutable; displaying USD must preserve ratios,
// percentages, share counts and the actual reported native values.
const before=JSON.stringify(p),fx={base:'USD',quote:'TWD',per_usd:32,usd_per_unit:1/32},usd=translatePayloadToUsd(p,fx);
assert.equal(usd.financials.income_statement.find(r=>r.key==='eps_basic').values['2025'],66.26/32);assert.equal(usd.profile.currency,'USD');assert.equal(usd.profile.reporting_currency,'TWD');assert.equal(JSON.stringify(p),before);assert.deepEqual(usd.financials.roic_series,f.roic_series);
assert.throws(()=>translatePayloadToUsd(p,{...fx,quote:'KRW'}),/does not match/);
f.native_provider='Taiwan MOPS';f.current_shares={status:'available',common_outstanding:25932370067,asOf:'2025-12-31',multiple_classes:false};
const a=nativeValuation(p.price.price,f),b=nativeValuation(p.price.price/32,{...usd.financials,native_provider:f.native_provider,current_shares:f.current_shares});assert.equal(a.basis,'FY 2025','A reported fiscal year in the TTM slot is labelled as that FY');assert.ok(Math.abs(a.pe-b.pe)<1e-10);assert.ok(Math.abs(a.evToFcf-b.evToFcf)<1e-10);
assert.equal(nativeValuation(2415,{...f,current_shares:{...f.current_shares,multiple_classes:true}}).marketCap,null);
const facts=legacy.facts.BasicEarningsLossPerShare.units['TWD/shares'],basis=normalizeShareSeries({eps_basic:facts},{events:[{id:'synthetic',date:'2020-01-01',ratio:2,type:'split',known_at:'2020-01-01'}],feed_status:'available'},{knowledge_as_of:asOf,target_share_basis:asOf});
assert.equal(basis.series.eps_basic[0].normalization.basis_status,'unresolved');assert.ok(Number.isNaN(basis.series.eps_basic[0].val));
assert.match(resolveDefinition({label:'P/E',group:'Valuation · FY 2025'}).formula,/FY 2025/);assert.match(definitionById('market_cap',{nativeValuation:true}).formula,/period-end common/);
console.log('Taiwan source fixtures pass: issuer/period/CFS identity, old XML and inline scales, loans+bonds, signed cash flows, FX immutability and ratio invariance, and unknown-publication split quarantine.');
