import listings from './data/taiwan-directory.json' with {type:'json'};
import {normalizeTaiwanStatement} from './taiwan-financials.mjs';
import {mergeDartStatements} from './dart-financials.mjs';
import {parseYahooSplits} from './split-feed.mjs';
export const taiwanListings=listings;
const pending=new Map();
export async function loadTaiwanProfile(ticker){
 const row=listings.find(c=>c.ticker===ticker);if(!row)throw Object.assign(Error('This Taiwan security is not in the TWSE listed-company directory.'),{status:404});
 return {...row,provider:'Taiwan MOPS',currency:'TWD',quote_symbol:ticker+'.TW',native:true,source_url:'https://openapi.twse.com.tw/v1/opendata/t187ap03_L'};
}
export async function loadTaiwanStatement(profile,year,quarter,env,ctx){
 const asOf=new Date().toISOString().slice(0,10),url=`https://mopsov.twse.com.tw/server-java/FileDownLoad?functionName=t164sb01&step=9&co_id=${profile.ticker}&year=${year}&season=${quarter}&report_id=C`,key=new Request(`https://research-api.royrliu.com/internal/mops/${profile.ticker}/${year}/${quarter}?v=6`),hit=await caches.default.match(key);if(hit)return hit.json();
 if(pending.has(key.url))return pending.get(key.url);
 const task=(async()=>{
  if(env.UPSTREAM_LIMIT&&!(await env.UPSTREAM_LIMIT.limit({key:'mops'})).success)throw Error('MOPS request budget reached. Retry shortly.');
  const response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0',Accept:'text/html,application/xhtml+xml'},redirect:'manual',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('MOPS statement is unavailable (HTTP '+response.status+').');
  if(Number(response.headers.get('content-length'))>12000000)throw Error('MOPS statement exceeds supported size.');
  const text=await response.text(),value=normalizeTaiwanStatement(text,profile,year,quarter,asOf);
  ctx.waitUntil(caches.default.put(key,new Response(JSON.stringify(value),{headers:{'Cache-Control':'public, max-age=21600'}})));return value;
 })();pending.set(key.url,task);try{return await task;}finally{pending.delete(key.url);}
}
export async function loadTaiwanFacts(ticker,env,ctx){
 const profile=await loadTaiwanProfile(ticker),asOf=new Date().toISOString().slice(0,10),year=Number(asOf.slice(0,4)),month=Number(asOf.slice(5,7)),key=new Request(`https://research-api.royrliu.com/internal/mops-report/${ticker}?v=6`),hit=await caches.default.match(key);if(hit)return {...await hit.json(),asOf};
 const results=[],failed=[];let firstYear=year-1;
 try{results.push(await loadTaiwanStatement(profile,firstYear,4,env,ctx));}catch(e){failed.push({year:firstYear,quarter:4,reason:e.message});firstYear--;results.push(await loadTaiwanStatement(profile,firstYear,4,env,ctx));}
 // History is fetched in separate cached requests by the client. Parsing one
 // filing per Worker invocation avoids accumulating CPU cost across a decade.
 const periods=[2,4,6,8,10].map(n=>[firstYear-n,4]).filter(([y])=>y>=2013);
 if(firstYear>2013&&!periods.some(([y])=>y===2013))periods.push([2013,4]);
 if(asOf>=year+'-11-16')periods.push([year,3]);if(asOf>=year+'-08-16')periods.push([year,2]);if(asOf>=year+'-05-16')periods.push([year,1]);
 const value={cik:'TWSE'+ticker,provider:'Taiwan MOPS',asOf,fetchedAt:new Date().toISOString(),entityName:profile.name,history_periods:periods,facts:mergeDartStatements(results),source_coverage:{status:failed.length?'partial':'available',sources:results.flatMap(r=>r.sources),unavailable_periods:failed,conflicts:results.flatMap(r=>r.conflicts),excluded_contexts:results.reduce((n,r)=>n+r.excluded_contexts,0),scope:'Taiwan-IFRS consolidated primary statements from MOPS. Entity-wide numeric contexts only; dimensional detail is excluded. Original filing publication times are not verified: retrieval dates are used as conservative knowledge dates, so these observations must not be used for historical point-in-time backtests. TWSE listed companies are supported; TPEx is not yet included.'}};
 ctx.waitUntil(caches.default.put(key,new Response(JSON.stringify(value),{headers:{'Cache-Control':'public, max-age='+(failed.length?300:21600)}})));return value;
}
export async function loadTaiwanSplits(ticker,env,ctx){
 const profile=await loadTaiwanProfile(ticker),cik='TWSE'+ticker,key=new Request(`https://research-api.royrliu.com/internal/twse-splits/${ticker}?v=6`),hit=await caches.default.match(key);if(hit)return hit.json();
 try{const response=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${profile.quote_symbol}?interval=1mo&period1=0&period2=${Math.floor(Date.now()/1000)}&events=splits`,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error();const value=parseYahooSplits(await response.json(),profile.quote_symbol,cik,new Date().toISOString());ctx.waitUntil(caches.default.put(key,new Response(JSON.stringify(value),{headers:{'Cache-Control':'public, max-age=86400'}})));return value;}catch{return {cik,status:'unavailable',events:[],reason:'Native split history could not be verified.'};}
}
