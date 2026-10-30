import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {reportValuation,nativeValuation} from '../assets/report/native-valuation.mjs';
import {translatePayloadToUsd} from '../assets/report/usd-display.mjs';
import {toReportPayload,loadReportCompany} from '../assets/report/sec-adapter.mjs';

// Deliberately independent scenarios: different fields have different periods
// and prerequisites. Matching accounting totals cannot detect these failures.
const row=(key,values)=>({key,values});
function fixture(){return {
 columns:['2024','2025','TTM'],period_dates:['2024-12-31','2025-12-31','2026-06-30'],
 current_shares:{status:'available',common_outstanding:2e6,asOf:'2026-06-30',multiple_classes:false},splits:[],
 income_statement:[row('eps_diluted',{'2024':3,'2025':4,TTM:5}),row('eps_basic',{'2025':4,TTM:5}),row('shares_diluted',{'2025':999,TTM:999}),row('revenue',{'2025':80,TTM:100}),row('operating_income',{'2025':10,TTM:30}),row('pretax_income',{'2025':9,TTM:29})],
 balance_sheet:[row('shareholders_equity',{'2025':100,TTM:300}),row('short_term_debt',{'2025':20,TTM:40}),row('long_term_debt',{'2025':30,TTM:40}),row('cash',{'2025':10,TTM:30})],
 cash_flow:[row('cf_dna',{'2025':2,TTM:3}),row('free_cash_flow',{'2025':8,TTM:20})]
};}
const find=(f,table,key)=>f[table].find(r=>r.key===key),close=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-9,label+': '+actual+' != '+expected);
const reason=(result,key)=>assert.ok(result.reasons?.[key],key+' blank must identify its own missing/invalid dependency');
let f=fixture(),before=JSON.stringify(f),v=reportValuation(100,f);
assert.equal(JSON.stringify(f),before,'Valuation must not mutate statement data');
assert.equal(v.pe,20);assert.equal(v.marketCap,200,'Market cap uses actual outstanding shares, not 999M diluted weighted shares');close(v.pb,2/3,'P/B uses current eligible balance');assert.equal(v.ev,250);
assert.equal(nativeValuation(100,f).pe,v.pe,'Legacy native API stays compatible');

f=fixture();f.income_statement=f.income_statement.filter(r=>r.key!=='shares_diluted');v=reportValuation(100,f);assert.equal(v.pe,20,'Missing weighted shares cannot blank independently available P/E');assert.equal(v.pb,2/3);

f=fixture();for(const key of ['eps_diluted','eps_basic'])delete find(f,'income_statement',key).values.TTM;v=reportValuation(100,f);assert.equal(v.pe,25,'Missing TTM earnings use latest reported FY');assert.match(String(v.bases?.pe||v.basis),/2025/,'Annual earnings basis must be labelled');close(v.pb,2/3,'Annual EPS fallback must not force older annual equity');assert.equal(v.ev,250,'Annual EPS fallback must not force older annual cash/debt');
f=fixture();delete find(f,'income_statement','eps_diluted').values.TTM;v=reportValuation(100,f);assert.equal(v.pe,20,'Available basic TTM EPS precedes an older diluted fiscal year');
f=fixture();find(f,'income_statement','pretax_income').values={'2024':9};v=reportValuation(100,f);assert.equal(v.evToPretax,null,'Fallback is latest reported FY, not an arbitrary older nonempty cell');reason(v,'evToPretax');assert.equal(v.pe,20,'Stale pretax does not suppress current earnings');
f=fixture();f.columns=['2026Q1','2026Q2'];f.period_dates=['2026-03-31','2026-06-30'];for(const r of f.balance_sheet)r.values={'2026Q1':r.values['2025'],'2026Q2':r.values.TTM};for(const r of [...f.income_statement,...f.cash_flow])r.values={'2026Q1':1,'2026Q2':2};v=reportValuation(100,f);close(v.pb,2/3,'Quarter-only issuers still have eligible current balance-sheet multiples');assert.equal(v.ev,250);assert.equal(v.pe,null,'A quarterly EPS observation is not silently annualized');assert.equal(v.ps,null,'Quarter-only revenue is not presented as annual or TTM sales');
f=fixture();for(const key of ['eps_diluted','eps_basic'])find(f,'income_statement',key).provenance={TTM:{start:'2023-01-01',end:'2023-12-31'}};v=reportValuation(100,f);assert.equal(v.pe,25,'A row called TTM whose source predates latest FY cannot supersede the latest FY');
f=fixture();find(f,'balance_sheet','shareholders_equity').provenance={TTM:{end:'2020-12-31'}};v=reportValuation(100,f);assert.equal(v.pb,2,'A stale balance hidden under TTM must not supersede newer annual equity');

f=fixture();f.income_statement=f.income_statement.filter(r=>!r.key.startsWith('eps_'));v=reportValuation(100,f);assert.equal(v.pe,null);reason(v,'pe');close(v.pb,2/3,'Missing EPS must not suppress price/book');assert.equal(v.ps,2);

for(const bad of [-2,0]){f=fixture();find(f,'income_statement','eps_diluted').values.TTM=bad;find(f,'income_statement','eps_basic').values.TTM=bad;v=reportValuation(100,f);assert.equal(v.pe,null,'An available loss/zero cannot be hidden by choosing older profitable FY');reason(v,'pe');}
f=fixture();find(f,'balance_sheet','shareholders_equity').values.TTM=-10;v=reportValuation(100,f);assert.equal(v.pb,null,'Negative current book equity cannot fall back to older positive equity');reason(v,'pb');assert.equal(v.pe,20);

f=fixture();delete f.current_shares;v=reportValuation(100,f);assert.equal(v.marketCap,null);assert.equal(v.pb,null);reason(v,'pb');assert.equal(v.pe,20,'Price/earnings does not need total company market cap');
f=fixture();f.current_shares.multiple_classes=true;v=reportValuation(100,f);assert.equal(v.marketCap,null,'One class price cannot value all classes without a complete class model');assert.equal(v.pe,20,'Verified selected-class EPS remains usable independently');
for(const bad of [0,-1,NaN,undefined]){f=fixture();f.current_shares.common_outstanding=bad;v=reportValuation(100,f);assert.equal(v.marketCap,null,'Nonpositive/nonfinite share counts are ineligible');for(const value of Object.values(v))if(typeof value==='number')assert.ok(Number.isFinite(value),'Never return NaN or Infinity');}

f=fixture();f.current_shares.asOf='2025-12-31';f.splits=[{date:'2026-02-01',ratio:2,type:'split'}];v=reportValuation(100,f);assert.equal(v.marketCap,null,'A pre-split count is not a verified current count');assert.equal(v.pe,20,'Already normalized EPS is a separate dependency');
f=fixture();f.knowledge_as_of='2026-06-01';v=reportValuation(100,f);assert.equal(v.marketCap,null,'A share count dated after the knowledge cutoff cannot value the company');
for(const date of ['',null,'not-a-date']){f=fixture();f.current_shares.asOf=date;assert.equal(reportValuation(100,f).marketCap,null,'Undated or invalid dated share counts must be withheld');}

f=fixture();find(f,'balance_sheet','cash').values.TTM=1000;find(f,'balance_sheet','short_term_debt').values.TTM=0;find(f,'balance_sheet','long_term_debt').values.TTM=0;v=reportValuation(100,f);assert.equal(v.ev,-800,'Reported zero debt is valid; negative EV is not a missing numerator');assert.equal(v.evToSales,-8);
f=fixture();f.balance_sheet=f.balance_sheet.filter(r=>r.key!=='cash');v=reportValuation(100,f);assert.equal(v.ev,null,'Missing cash must not be silently treated as zero');assert.equal(v.pe,20);close(v.pb,2/3,'EV input failure must not suppress P/B');
f=fixture();delete find(f,'balance_sheet','long_term_debt').values.TTM;v=reportValuation(100,f);assert.equal(v.ev,240,'EV uses one coherent fiscal-year cash/debt snapshot when the current snapshot is incomplete');close(v.pb,2/3,'EV fiscal-year fallback does not force older book equity');
f=fixture();find(f,'balance_sheet','long_term_debt').provenance={TTM:{end:'2025-12-31'}};v=reportValuation(100,f);assert.equal(v.ev,240,'Matching column names do not justify mixing different cash/debt balance dates');

f=fixture();delete find(f,'cash_flow','cf_dna').values.TTM;v=reportValuation(100,f);close(v.evToEbitda,250/12,'EBITDA fallback requires operating income and D&A from the same FY');assert.match(String(v.bases?.evToEbitda||v.basis),/2025/);close(v.evToEbit,250/30,'Independent EBIT metric still uses available TTM');
f=fixture();find(f,'income_statement','operating_income').provenance={TTM:{start:'2025-07-01',end:'2026-06-30'}};find(f,'cash_flow','cf_dna').provenance={TTM:{start:'2025-01-01',end:'2025-12-31'}};v=reportValuation(100,f);close(v.evToEbitda,250/12,'Two TTM labels cannot conceal different actual financial periods');
f=fixture();delete find(f,'income_statement','pretax_income').values.TTM;v=reportValuation(100,f);close(v.evToPretax,250/9,'One missing TTM metric falls back independently');assert.equal(v.ps,2);

f=fixture();const payload={financials:f,profile:{currency:'TWD'},price:{price:100,currency:'TWD'},historical_prices:{},dividends:[]},fx={base:'USD',quote:'TWD',usd_per_unit:1/32,per_usd:32},usd=translatePayloadToUsd(payload,fx),native=reportValuation(100,f),translated=reportValuation(usd.price.price,usd.financials);
for(const key of ['pe','pb','ps','evToSales','evToEbitda','evToEbit','evToPretax','evToFcf'])close(translated[key],native[key],key+' invariant under consistent display currency translation');
assert.equal(usd.financials.current_shares.common_outstanding,f.current_shares.common_outstanding,'USD display never rescales outstanding-share counts');
assert.equal(reportValuation(NaN,f),null);assert.equal(reportValuation(0,f),null);
const reported=val=>({start:'2025-01-01',end:'2025-12-31',filed:'2026-02-01',accn:'native2025',form:'MOPS-ANNUAL',val}),raw={cik:'TWSE2330',asOf:'2026-10-29',provider:'Taiwan MOPS',facts:{Revenue:{namespace:'ifrs-full',units:{TWD:[reported(100e6)]}},BasicEarningsLossPerShare:{namespace:'ifrs-full',units:{'TWD/shares':[reported(5)]}}}};
assert.equal(toReportPayload(raw,{ticker:'2330'},{price:100,currency:'USD'},'annual','TWSE:2330').price,null,'ADR/foreign quote currency cannot silently combine with native EPS');
assert.equal(toReportPayload(raw,{ticker:'2330'},{price:100,currency:'TWD'},'annual','TWSE:2330').price.price,100,'Matching currency quote remains usable');

// Exercise the real compiled UI's valuation entry point, not only its helper.
const source=readFileSync(new URL('../assets/report/report-app.js',import.meta.url),'utf8'),start=source.indexOf('function mZ(');assert.ok(start>=0,'Compiled valuation entry point exists');let end=source.indexOf('{',start),depth=1;for(end++;end<source.length&&depth;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}
const compiled=vm.runInNewContext('('+source.slice(start,end)+')',{reportValuation,nativeValuation,hZ:(a,b)=>a==null||b==null?undefined:a+b});
f=fixture();f.income_statement=f.income_statement.filter(r=>r.key!=='shares_diluted');assert.equal(compiled(100,f).pe,20,'Actual UI must use independent metric dependencies, not legacy weighted-share gate');

// A CIK-addressed metadata response describes the issuer, not the selected
// security. It must not overwrite ACME/ACME-PA with the route token CIK1.
const fetchBefore=globalThis.fetch,instant=val=>({...reported(val),start:undefined,end:'2026-06-30',filed:'2026-07-20',form:'10-Q'}),us={cik:'1',asOf:'2026-10-29',facts:{Revenues:{namespace:'us-gaap',units:{USD:[reported(100e6)]}},EarningsPerShareBasic:{namespace:'us-gaap',units:{'USD/shares':[reported(5)]}},WeightedAverageNumberOfSharesOutstandingBasic:{namespace:'us-gaap',units:{shares:[reported(2e6)]}},CommonStockSharesOutstanding:{namespace:'us-gaap',units:{shares:[instant(2e6)]}},Assets:{namespace:'us-gaap',units:{USD:[instant(400e6)]}},StockholdersEquity:{namespace:'us-gaap',units:{USD:[instant(300e6)]}}}},model={cik:'1',selected_ticker:'ACME',asOf:'2026-07-20',eligible_single_common_class:true,status:'available',common_listed_classes:1,common_context_classes:['CommonStockMember'],class_conflicts:[],unknown_common_members:[],unknown_tickers:[],selected_kind:'common',listings:[{ticker:'ACME',kind:'common'},{ticker:'ACME-PA',kind:'preferred'}]};
globalThis.fetch=async input=>{
 const url=String(input);
 if(url.endsWith('/directory'))return Response.json({companies:[{cik:'1',ticker:'ACME',exchange:'NYSE',name:'Acme common'},{cik:'1',ticker:'ACME-PA',exchange:'NYSE',name:'Acme preferred'}]});
 if(url.endsWith('/facts'))return Response.json(us);
 if(url.includes('/filings?'))return Response.json({cik:'1',ticker:'CIK1',tickers:['ACME','ACME-PA'],industry:'Manufacturing',filings:[]});
 if(url.endsWith('/splits'))return Response.json({cik:'1',status:'available',events:[]});
 if(url.includes('/quote/'))return Response.json({ticker:url.split('/').at(-1),price:url.endsWith('ACME-PA')?25:100,currency:'USD'});
 if(url.endsWith('/data/filings/manifest.json'))return Response.json({companies:{'1':{file:'CIK1-1234567890abcdef.json'}}});
 if(url.endsWith('/CIK1-1234567890abcdef.json'))return Response.json({schema_version:1,cik:'1',facts:{},sources:[],conflicts:[],rejections:[],security_models:[model]});
 throw Error('Unexpected adversarial loader URL '+url);
};
try{
 const common=await loadReportCompany('NYSE:ACME'),preferred=await loadReportCompany('NYSE:ACME-PA');
 assert.equal(common.financials.security_kind,'common','Issuer metadata must retain selected common-security identity');
 assert.equal(reportValuation(common.price.price,common.financials).marketCap,200,'Preferred tickers do not suppress a verified single-common-class company value');
 assert.equal(preferred.financials.security_kind,'preferred','Selected preferred security retains its own identity');
 assert.equal(reportValuation(preferred.price.price,preferred.financials).pe,null,'Preferred price cannot use issuer ordinary-common EPS');
}finally{globalThis.fetch=fetchBefore;}
console.log('Valuation adversarial cases pass: independent dependencies, actual shares, explicit annual fallback, latest balances, common-period EBITDA, losses/zero, multiclass/splits, missing-versus-zero debt/cash, FX invariance, immutable input and compiled UI entry point.');

// A current company value must not be combined with arbitrarily old debt/cash.
{
 const old={columns:['2017','2025','TTM'],period_dates:['2017-12-31','2025-12-31','2026-06-30'],knowledge_as_of:'2026-10-30',current_shares:{status:'available',common_outstanding:1000000,asOf:'2026-06-30'},income_statement:[],cash_flow:[],balance_sheet:['short_term_debt','long_term_debt','cash','shareholders_equity'].map(key=>({key,values:{2017:10},provenance:{2017:{end:'2017-12-31'}}}))};
 const v=nativeValuation(100,old);assert.equal(v.marketCap,100);assert.equal(v.ev,null);assert.equal(v.pb,null);
 for(const r of old.balance_sheet)r.values['2025']=20;
 const recent=nativeValuation(100,old);assert.equal(recent.ev,120);assert.equal(recent.pb,5);assert.equal(recent.bases.ev,'Balance 2025-12-31');
}
