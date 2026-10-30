import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {toFundReport,loadFundReport} from '../assets/report/fund-report.mjs';
const root=new URL('../assets/report/data/funds/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',root))),entry=manifest.funds['1332283'],source=JSON.parse(readFileSync(new URL(entry.file,root))),record={cik:'1332283',ticker:'BDJ',exchange:'NYSE',name:'BlackRock Enhanced Equity Dividend Trust'},snapshot=JSON.stringify(source),quote={ticker:'BDJ',price:9.57,currency:'USD',asOf:'2026-10-29T12:00:00Z'},report=toFundReport(source,record,quote,'2026-10-29');
const row=key=>Object.values(report.financials).filter(Array.isArray).flat().find(r=>r?.key===key);
assert.equal(report.financials.company_type,'fund');assert.deepEqual(report.price,quote,'Price contract remains the quote object used by the report UI');
assert.equal(report.financials.fund.nav_per_share,10.2);assert.equal(report.financials.fund.nav_as_of,'2026-06-30');
assert.equal(row('fund_net_assets').values['2025'],1722.595639,'BDJ second fund column, not BGR first column');
assert.equal(row('fund_net_investment_income').values['2025'],29.626668);assert.equal(row('fund_cash_from_operations').values['2025'],150.63739);
assert.equal(row('fund_nav_per_share').values['2025'],9.74,'NAV is dollars per share, never millions');assert.equal(row('fund_nav_per_share').is_per_share,true);
assert.equal(row('fund_shares_outstanding').values.TTM,176.944689);assert.ok(row('fund_expenses_net').values['2025']<0);assert.ok(row('fund_investment_purchases').values['2025']<0);assert.ok(row('fund_cash_distributions').values['2025']<0);
assert.equal(row('fund_net_investment_income').values.TTM,undefined,'No fictitious corporate TTM EPS or annualized six-month earnings');
assert.ok(!report.financials.income_statement.some(r=>r.key==='eps_basic'||r.key==='revenue'),'Fund investment operations do not become corporate revenue or EPS');
assert.equal(report.financials.fund.annualized_distribution_per_share,.7428);assert.equal(report.financials.fund.distribution_period,'2026-06-30');assert.equal(report.financials.fund.expense_ratio,.88,'Ratio is percentage points as reported');
assert.ok(report.financials.validation.checks.length>=8);assert.ok(report.financials.validation.checks.every(c=>c.status==='pass'));assert.equal(JSON.stringify(source),snapshot);
assert.throws(()=>toFundReport(source,{...record,cik:'1'}),/identity/);assert.throws(()=>toFundReport(source,{...record,ticker:'BGR'}),/identity/);
assert.equal(toFundReport(source,record,{...quote,currency:'TWD'}).price,null,'Mismatched quote currency is excluded');assert.equal(toFundReport(source,record,{...quote,ticker:'BGR'}).price,null,'Another fund quote is excluded');
assert.equal(toFundReport(source,record,quote,'2026-03-04').price,null,'A historical source cutoff also excludes a future live quote');
const old=toFundReport(source,record,null,'2026-03-04');assert.equal(old.financials.fund.nav_as_of,'2025-06-30','Day-before annual filing cannot see later shareholder reports');assert.equal(old.financials.fund.distribution_period,'2025-06-30','Distribution-summary dates also respect filing availability, not only their as-of date');assert.ok(old.financials.source_coverage.sources.every(s=>s.date<='2026-03-04'));assert.equal(old.financials.balance_sheet.find(r=>r.key==='fund_net_assets').values['2025'],undefined);
// Run the actual multi-fund table extractor on a small, unchanged table fixture.
const python=`import sys,json\nfrom pathlib import Path\nsys.path.insert(0,sys.argv[1])\nfrom extract import extract\nm=json.loads(Path(sys.argv[2]).read_text());raw=Path(sys.argv[3]).read_bytes();d=extract(raw,m);print(json.dumps(d))\n`;
const extraction=spawnSync('python3',['-c',python,fileURLToPath(new URL('../scripts/fund-cache/',import.meta.url)),fileURLToPath(new URL('./fixtures/bdj-2025-report-source.json',import.meta.url)),fileURLToPath(new URL('./fixtures/bdj-2025-report-tables.html',import.meta.url))],{encoding:'utf8'});assert.equal(extraction.status,0,extraction.stderr);
const actual=JSON.parse(extraction.stdout),assets=actual.observations.find(p=>p.key==='fund_total_assets'),nav=actual.observations.find(p=>p.key==='fund_nav_per_share');assert.equal(assets.value,1749377887);assert.equal(nav.value,9.74);assert.equal(assets.table_index,0);assert.ok(actual.selected_tables.find(t=>t.kind==='balance').columns.includes(2));
const realNow=Date.now;let now=realNow(),calls=0;Date.now=()=>now;
try{
 const fetcher=async url=>{calls++;if(calls===1)throw Error('Transient failure');return {ok:true,json:async()=>String(url).endsWith('manifest.json')?manifest:source};};
 assert.equal(await loadFundReport(record,{},quote,fetcher),null);assert.equal(await loadFundReport(record,{},quote,fetcher),null);assert.equal(calls,1,'Failed manifests back off without request spam');
 now+=60001;const loaded=await loadFundReport(record,{},quote,fetcher);assert.equal(loaded.financials.company_type,'fund');assert.deepEqual(loaded.price,quote);assert.equal(calls,3,'Manifest can retry and issuer cache loads once');
 const cached=await loadFundReport(record,{},quote,fetcher);assert.equal(cached.financials.fund.nav_per_share,10.2);assert.equal(calls,3);
}finally{Date.now=realNow;}
console.log('Fund report passes: actual BDJ multi-fund column isolation, NAV/accounting identities, source immutability, source cutoff, fund-native rows, dollars/per-share units, signed outflows, quote-object contract and retryable cache fallback.');
