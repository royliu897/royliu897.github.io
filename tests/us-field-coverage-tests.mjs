import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {toReportPayload} from '../assets/report/sec-adapter.mjs';
const cases=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/us-field-coverage.json.gz',import.meta.url)))),reports={};
const value=(p,key,period)=>['income_statement','balance_sheet','cash_flow'].flatMap(t=>p.financials[t]).find(r=>r.key===key)?.values[period],row=(p,key)=>['income_statement','balance_sheet','cash_flow'].flatMap(t=>p.financials[t]).find(r=>r.key===key);
const expected={PEP:{year:'2025',accounts_receivable:11506,cf_capex:-3887,free_cash_flow:7672,cf_dna:3451},FDX:{year:'2026',accounts_receivable:11518,cf_capex:-3809,free_cash_flow:5116,cf_dna:4369},RTX:{year:'2025',accounts_receivable:14701,pension_liabilities:2067},LOW:{year:'2026',accounts_receivable:1090,cf_dna:2194,cf_capex:-2213,free_cash_flow:7651},TXN:{year:'2025',pension_liabilities:124,cf_capex:-4550,free_cash_flow:2603},UNH:{year:'2025',cf_dna:4361},AMZN:{year:'2025',revenue:716924,cf_capex:-131819,free_cash_flow:7695}};
let checks=0;
for(const [ticker,c]of Object.entries(cases)){
 const before=JSON.stringify(c.data),p=reports[ticker]=toReportPayload(c.data,c.record);assert.equal(JSON.stringify(c.data),before,'Source observations remain immutable: '+ticker);
 const refs=expected[ticker];
 for(const [key,number]of Object.entries(refs))if(key!=='year'){checks++;assert.equal(value(p,key,refs.year),number,ticker+' '+key+' reaches the expected row');}
}
assert.equal(reports.AMZN.financials.columns.includes('2026'),false,'Amazon rolling twelve-month cash flow ending June 2026 is not a new fiscal-year column');
assert.equal(reports.AMZN.financials.period_dates[reports.AMZN.financials.columns.indexOf('2025')],'2025-12-31');
assert.equal(value(reports.AMZN,'cash_from_operations','TTM'),161403,'Issuer-reported rolling twelve-month cash flow remains available to TTM');
assert.match(row(reports.PEP,'cf_capex').provenance['2025'].calculation,/productive-asset/);
assert.match(row(reports.FDX,'cf_capex').provenance['2026'].calculation,/gross capital spending/,'A missing broad disposal series is not silently asserted to be zero');
assert.match(row(reports.PEP,'free_cash_flow').provenance['2025'].calculation,/gross productive-asset capital spending/,'FCF subtracts gross capital spending, not proceeds-netted capex');
assert.equal(value(reports.TXN,'cf_dna','2025'),undefined,'A disclosed depreciation-only component cannot manufacture combined D&A');
assert.equal(value(reports.RTX,'interest_expense','2025'),undefined,'Reported net interest expense does not establish gross interest expense');
assert.equal(value(reports.RTX,'net_interest_income','2025'),-1749,'The disclosed net interest amount remains available in its matching row');
const annual=(val,extra={})=>({val,start:'2025-01-01',end:'2025-12-31',filed:'2026-02-01',accn:'annual',form:'10-K',...extra}),instant=(val,extra={})=>annual(val,{start:undefined,...extra});
const data=fields=>({asOf:'2026-10-30',facts:Object.fromEntries(Object.entries({Revenues:[annual(100e6)],Assets:[instant(200e6)],...fields}).map(([key,points])=>[key,{namespace:'us-gaap',units:{USD:points}}]))});
let p=toReportPayload(data({NetCashProvidedByUsedInOperatingActivities:[annual(100e6)],PaymentsToAcquireProductiveAssets:[annual(40e6)],ProceedsFromSaleOfProductiveAssets:[annual(5e6)],PaymentsToAcquirePropertyPlantAndEquipment:[annual(30e6)]}));
assert.equal(value(p,'cf_capex','2025'),-35);assert.equal(value(p,'free_cash_flow','2025'),60,'Broader productive spending is not added to its PPE component or reduced by sale proceeds for FCF');
p=toReportPayload(data({NetCashProvidedByUsedInOperatingActivities:[annual(100e6)],ProceedsFromSaleOfProductiveAssets:[annual(5e6)],PaymentsToAcquirePropertyPlantAndEquipment:[annual(30e6)],ProceedsFromSaleOfPropertyPlantAndEquipment:[annual(3e6)]}));
assert.equal(value(p,'cf_capex','2025'),-27,'A broader disposal-only value cannot discard a supported PPE spending series');assert.equal(value(p,'free_cash_flow','2025'),70);
p=toReportPayload(data({ReceivablesNetCurrent:[instant(50e6)],AccountsReceivableNetCurrent:[instant(40e6)]}));assert.equal(value(p,'accounts_receivable','2025'),50,'A current receivables total takes precedence over its accounts-only component');
p=toReportPayload(data({DepreciationDepletionAndAmortization:[annual(40e6)],DepreciationAndAmortization:[annual(30e6)]}));assert.equal(value(p,'cf_dna','2025'),40,'A fuller D&A amount takes precedence over the nonproduction component');
const restated=data({Revenues:[annual(100e6),annual(110e6,{filed:'2026-05-01',accn:'quarter-revision',form:'10-Q'})]});p=toReportPayload(restated);assert.equal(value(p,'revenue','2025'),110,'A later 10-Q fiscal-year comparative restatement remains eligible');
const ipo=data({Revenues:[annual(100e6,{form:'S-1'})]});p=toReportPayload(ipo);assert.equal(value(p,'revenue','2025'),100,'IPO annual registration observations are retained');
console.log(`US field coverage passes: ${checks} actual reported value checks across seven holdout issuers, rolling-TTM versus fiscal-year separation, safe receivables/pension/D&A bindings, productive-capital-spending scope, immutable data, aggregate/component precedence and IPO/restatement retention.`);
