import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectTaiwanMarket,loadTaiwanMarket} from '../assets/report/native-market.mjs';
import {reportValuation} from '../assets/report/native-valuation.mjs';
import {translatePayloadToUsd} from '../assets/report/usd-display.mjs';

const url='https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_d',knowledge='2026-10-30';
const snapshot={version:1,currency:'TWD',known_at:'2026-10-30',source_url:url,rows:{'2454':{asOf:'2026-10-29',price:100,pe:20,pb:5,financial_period:'2026Q2'},'2330':{asOf:'2026-10-29',price:200,pe:30,pb:6,financial_period:'2026Q2'}}};
const official=selectTaiwanMarket(snapshot,'2454',knowledge);
assert.equal(official.provider,'TWSE');assert.equal(official.price,100);assert.equal(official.pe,20);assert.equal(official.pb,5);assert.equal(official.asOf,'2026-10-29');assert.equal(official.source_url,url);assert.equal(official.financial_period,'2026Q2');
assert.equal(selectTaiwanMarket(snapshot,'9999',knowledge),null,'Unknown issuer cannot borrow another stock ratio');
assert.equal(selectTaiwanMarket({...snapshot,version:2},'2454',knowledge),null);assert.equal(selectTaiwanMarket({...snapshot,currency:'USD'},'2454',knowledge),null);
assert.equal(selectTaiwanMarket(snapshot,'2454','2026-10-29'),null,'Snapshot learned after cutoff is unavailable even when market date predates cutoff');
assert.equal(selectTaiwanMarket(snapshot,'2454','2026-11-06'),null,'Eight-day-old source is stale');assert.ok(selectTaiwanMarket(snapshot,'2454','2026-11-05'),'Exactly seven days remains eligible');
assert.equal(selectTaiwanMarket({...snapshot,known_at:'2026-10-31'},'2454',knowledge),null);
for(const known_at of [undefined,null,'','0000','2026-02-30'])assert.equal(selectTaiwanMarket({...snapshot,known_at},'2454',knowledge),null,'Valid snapshot knowledge date is required');
const rowSnapshot=extra=>({...snapshot,rows:{'2454':{...snapshot.rows['2454'],...extra}}});
for(const asOf of ['2026-10-31','2026-02-30','bad',undefined])assert.equal(selectTaiwanMarket(rowSnapshot({asOf}),'2454',knowledge),null,'Invalid/future calendar date rejected');
assert.equal(selectTaiwanMarket({...snapshot,known_at:'2026-10-28'},'2454',knowledge),null,'Snapshot cannot know a market close occurring after snapshot date');
for(const price of [0,-1,NaN,Infinity,'100'])assert.equal(selectTaiwanMarket(rowSnapshot({price}),'2454',knowledge),null,'A numeric positive official close is required');
const absent=selectTaiwanMarket(rowSnapshot({pe:'',pb:0}),'2454',knowledge);assert.equal(absent.pe,null);assert.equal(absent.pb,null,'Blank or nonpositive ratios are unavailable, never zero-filled');

const row=(key,values,extra={})=>({key,values,provenance:{},...extra});
function financials(extra={}){return {native_provider:'Taiwan MOPS',ticker:'TWSE:2454',cik:'TWSE2454',knowledge_as_of:knowledge,columns:['2025','TTM'],period_dates:['2025-12-31','2026-06-30'],income_statement:[row('eps_diluted',{})],balance_sheet:[row('shareholders_equity',{TTM:1000})],cash_flow:[],current_shares:{status:'unavailable'},splits:[],official_valuation:official,...extra};}
let f=financials(),v=reportValuation(100,f);
assert.equal(v.pe,20);assert.equal(v.pb,5,'Dated published P/B can fill a blank without share-count assumptions');assert.equal(v.marketCap,null);assert.equal(v.ev,null);assert.equal(v.ps,null);assert.equal(v.evToSales,null);assert.equal(v.evToEbitda,null,'Published ratios do not manufacture company values');
assert.equal(v.bases.pb,'TWSE close 2026-10-29');
for(const field of ['book_value_per_share','common_outstanding','market_cap'])assert.equal(official[field],undefined,'Rounded ratios are not reverse-engineered into precise '+field);
for(const invalid of [{...official,provider:'OTHER'},{...official,currency:'KRW'},{...official,known_at:'2026-10-31'},{...official,asOf:'2026-11-01'},{...official,asOf:'2026-10-20'},{...official,known_at:'0000'}]){
 const value=reportValuation(100,financials({official_valuation:invalid}));assert.equal(value.pe,null,'Invalid/stale/unknown source cannot fill P/E');assert.equal(value.pb,null,'Invalid/stale/unknown source cannot fill P/B');
}
for(const eps of [0,-1]){
 const value=reportValuation(100,financials({income_statement:[row('eps_diluted',{TTM:eps,'2025':2})]}));assert.equal(value.pe,null,'A selected current zero/loss cannot be replaced with a positive official/older-year P/E');assert.equal(value.pb,5,'A loss does not erase an otherwise valid independent P/B');
}
v=reportValuation(100,financials({balance_sheet:[row('shareholders_equity',{TTM:-100,'2025':1000})]}));assert.equal(v.pb,null,'A current negative book value cannot be replaced with positive older/source P/B');assert.equal(v.pe,20);
v=reportValuation(100,financials({income_statement:[row('eps_diluted',{TTM:4})]}));assert.equal(v.pe,25,'Direct derived ratio takes precedence over a differing published ratio');assert.equal(v.bases.pe,'TTM');
v=reportValuation(100,financials({current_shares:{status:'available',common_outstanding:100e6,asOf:'2026-06-30',multiple_classes:false}}));assert.equal(v.pb,10,'Verified direct market-cap/book calculation remains ahead of external ratio');
v=reportValuation(100,financials({current_shares:{status:'available',common_outstanding:100e6,asOf:'2026-06-30',multiple_classes:true}}));assert.equal(v.marketCap,null);assert.equal(v.ev,null,'A source P/B does not bypass multi-class total-company valuation restrictions');
// Current native price and EPS translate together; published ratios remain
// dimensionless and retain their original source close/date for explanation.
f=financials({income_statement:[row('eps_diluted',{'2025':2}),row('shares_diluted',{'2025':100},{is_shares:true})]});
const payload={profile:{currency:'TWD'},price:{price:100,currency:'TWD'},financials:f},usd=translatePayloadToUsd(payload,{base:'USD',quote:'TWD',usd_per_unit:1/32});
const nativeValue=reportValuation(payload.price.price,f),usdValue=reportValuation(usd.price.price,usd.financials);
assert.equal(nativeValue.pe,50);assert.equal(nativeValue.bases.pe,'FY 2025');assert.equal(usdValue.pe,nativeValue.pe);assert.equal(usdValue.pb,nativeValue.pb);assert.equal(usd.financials.official_valuation.price,100);assert.equal(usd.financials.official_valuation.currency,'TWD');

let calls=[];
const fetcher=async target=>{calls.push(String(target));return {ok:true,json:async()=>snapshot};};
assert.equal((await loadTaiwanMarket('2454',knowledge,fetcher)).pb,5);assert.equal((await loadTaiwanMarket('2330',knowledge,fetcher)).pb,6);assert.equal(calls.length,1,'One shared same-origin snapshot request serves multiple issuers');assert.match(calls[0],/\/assets\/report\/data\/taiwan-market\.json$/);assert.ok(!calls[0].includes('openapi.twse.com.tw'),'No cross-origin request in the report path');
const actual=JSON.parse(readFileSync(new URL('../assets/report/data/taiwan-market.json',import.meta.url),'utf8'));
for(const ticker of ['2330','2454']){const result=selectTaiwanMarket(actual,ticker,actual.known_at);assert.ok(result&&result.pe>0&&result.pb>0);assert.equal(result.financial_period,actual.rows[ticker].financial_period);}
console.log('Native market tests pass: dated same-origin snapshot, calendar/knowledge/staleness guards, independent P/E/P/B fallback, current loss/equity rejection, no invented shares/EV, source close preservation and FX invariance.');

// Transient retrieval failures must permit a later retry rather than sticking
// for a complete browser session; backoff prevents rapid repeated requests.
const retryModule=await import('../assets/report/native-market.mjs?adversarial-retry'),originalNow=Date.now;let now=100000,retryCalls=0;
try{
 Date.now=()=>now;
 const retryFetch=async()=>{retryCalls++;return retryCalls===1?{ok:false}:{ok:true,json:async()=>snapshot};};
 assert.equal(await retryModule.loadTaiwanMarket('2454',knowledge,retryFetch),null);assert.equal(retryCalls,1);
 assert.equal(await retryModule.loadTaiwanMarket('2454',knowledge,retryFetch),null);assert.equal(retryCalls,1,'Backoff avoids a tight source-request loop');
 now+=60001;assert.equal((await retryModule.loadTaiwanMarket('2454',knowledge,retryFetch)).pb,5);assert.equal(retryCalls,2,'A failed promise is cleared for later retry');
}finally{Date.now=originalNow;}
