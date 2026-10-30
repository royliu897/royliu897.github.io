import {parseYahooSplits} from './split-feed.mjs';
import {normalizeDartStatement,mergeDartStatements} from './dart-financials.mjs';
import listedKoreanIssuers from './data/dart-directory.json' with {type:'json'};
export const koreanListings=listedKoreanIssuers;
const inflight=new Map();
export async function dartRequest(endpoint,params,env,ctx,ttl=21600){
 if(!env.DART_API_KEY)throw Object.assign(Error('OpenDART API key is not configured.'),{status:503});
 const query=new URLSearchParams(params),key=new Request('https://research-api.royrliu.com/internal/dart/'+endpoint+'?'+query),cached=await caches.default.match(key);if(cached)return cached.json();
 const id=key.url;if(inflight.has(id))return inflight.get(id);
 const task=(async()=>{
  if(env.UPSTREAM_LIMIT&&!(await env.UPSTREAM_LIMIT.limit({key:'dart'})).success)throw Object.assign(Error('OpenDART request budget reached. Retry shortly.'),{status:429});
  // Never place the credential in cache keys, response metadata or error text.
  const url=new URL('https://opendart.fss.or.kr/api/'+endpoint);url.search=query.toString();url.searchParams.set('crtfc_key',env.DART_API_KEY.trim());
  let response;try{response=await fetch(url,{headers:{Accept:'application/json','User-Agent':'Mozilla/5.0 RoyResearch/1.0'},redirect:'manual',signal:AbortSignal.timeout(15000)});}catch(e){console.error('OpenDART transport',String(e.name));throw Object.assign(Error('OpenDART could not be reached. Try again shortly.'),{status:502});}
  if(!response.ok)throw Object.assign(Error('OpenDART returned HTTP '+response.status+'.'),{status:502});
  let value;try{value=await response.json();}catch{throw Object.assign(Error('OpenDART did not return financial JSON.'),{status:502});}
  if(!['000','013'].includes(value.status))throw Object.assign(Error('OpenDART response status '+String(value.status).replace(/[^0-9]/g,'')+'.'),{status:502});
  ctx.waitUntil(caches.default.put(key,new Response(JSON.stringify(value),{headers:{'Cache-Control':'public, max-age='+(value.status==='013'?900:ttl)}})));return value;
 })();inflight.set(id,task);try{return await task;}finally{inflight.delete(id);}
}
export async function loadKoreanProfile(ticker,env,ctx){
 const listing=koreanListings.find(c=>c.ticker===ticker);if(!listing)throw Object.assign(Error('This Korean listing is not yet in the verified directory.'),{status:404});
 const profile=await dartRequest('company.json',{corp_code:listing.corp_code},env,ctx,604800);
 if(profile.status!=='000'||profile.corp_code!==listing.corp_code||profile.stock_code!==ticker)throw Object.assign(Error('OpenDART issuer identity could not be verified.'),{status:502});
 if(!['Y','K','N'].includes(profile.corp_cls))throw Object.assign(Error('OpenDART does not identify this issuer as currently listed on a supported Korean market.'),{status:404});
 return {...listing,name:profile.corp_name_eng||profile.corp_name||listing.name,fiscal_month:profile.acc_mt,market:profile.corp_cls,quote_symbol:profile.corp_cls==='K'?ticker+'.KQ':profile.corp_cls==='Y'?ticker+'.KS':null,provider:'OpenDART',source_url:'https://englishdart.fss.or.kr/dsbh001/main.do?rcpNo=',corp_name:profile.corp_name};
}

export async function loadKoreanFacts(ticker,env,ctx){
 const profile=await loadKoreanProfile(ticker,env,ctx),asOf=new Date().toISOString().slice(0,10),year=Number(asOf.slice(0,4)),month=Number(asOf.slice(5,7));
 const cacheKey=new Request(`https://research-api.royrliu.com/internal/dart-report/${ticker}?v=9`),hit=await caches.default.match(cacheKey);if(hit)return {...await hit.json(),asOf};
 const results=[],failed=[];
 async function source(y,code){const response=await dartRequest('fnlttSinglAcntAll.json',{corp_code:profile.corp_code,bsns_year:String(y),reprt_code:code,fs_div:'CFS'},env,ctx);return normalizeDartStatement(response,profile,y,code,asOf);}
 let firstYear=year-1,first=await source(firstYear,'11011');if(first.status!=='available'){firstYear--;first=await source(firstYear,'11011');}if(first.status!=='available')throw Object.assign(Error('No supported consolidated annual statement is available from OpenDART.'),{status:404});results.push(first);
 const history=[firstYear-3,firstYear-6,firstYear-9,2015].filter((y,i,a)=>y>=2015&&y<firstYear&&a.indexOf(y)===i);
 const periods=history.map(y=>[y,'11011']);
 // Do not assume a just-ended quarter has already been filed.
 if(asOf>=year+'-11-16')periods.push([year,'11014']);if(asOf>=year+'-08-16')periods.push([year,'11012']);if(asOf>=year+'-05-16')periods.push([year,'11013']);
 for(let i=0;i<periods.length;i+=4){const batch=periods.slice(i,i+4),out=await Promise.allSettled(batch.map(([y,c])=>source(y,c)));for(let j=0;j<out.length;j++){const result=out[j];if(result.status==='fulfilled'&&result.value.status==='available')results.push(result.value);else failed.push({year:batch[j][0],report:batch[j][1],reason:result.status==='rejected'?result.reason.message:'No filing available'});}}
 const latest=results.flatMap(r=>r.sources).sort((a,b)=>b.period.localeCompare(a.period))[0];let currentShares={status:'unavailable'};
 try{
  const reportCode={'03':'11013','06':'11012','09':'11014','12':'11011'}[latest.period.slice(5,7)],response=await dartRequest('stockTotqySttus.json',{corp_code:profile.corp_code,bsns_year:latest.period.slice(0,4),reprt_code:reportCode},env,ctx);
  const rows=response.list||[],count=v=>typeof v==='string'&&/^\d+$/.test(v.replaceAll(',','').trim())?Number(v.replaceAll(',','').trim()):null;
  if(response.status==='000'&&rows.every(r=>r.corp_code===profile.corp_code&&(!r.bsns_year||r.bsns_year===latest.period.slice(0,4))&&(!r.reprt_code||r.reprt_code===reportCode)&&r.stlm_dt===latest.period&&/^\d{14}$/.test(r.rcept_no||''))){
   const common=rows.filter(r=>r.se==='보통주'),total=rows.find(r=>r.se==='합계'),n=common.length===1?count(common[0].distb_stock_co):null,totalCount=count(total?.distb_stock_co);
   if(n>0&&Number.isSafeInteger(n)&&totalCount>=n)currentShares={status:'available',common_outstanding:n,total_outstanding:totalCount,multiple_classes:totalCount!==n,asOf:latest.period,source:'OpenDART stock total report',source_url:'https://englishdart.fss.or.kr/dsbh001/main.do?rcpNo='+common[0].rcept_no};
  }
 }catch{currentShares={status:'unavailable',reason:'Period-end common share count could not be verified.'};}
 const value={cik:'DART'+profile.corp_code,provider:'OpenDART',current_shares:currentShares,asOf,fetchedAt:new Date().toISOString(),entityName:profile.name,facts:mergeDartStatements(results),source_coverage:{status:failed.some(f=>f.reason!=='No filing available')?'partial':'available',sources:results.flatMap(r=>r.sources),unavailable_periods:failed,conflicts:results.flatMap(r=>r.conflicts||[]),unresolved_contexts:results.reduce((n,r)=>n+(r.unresolved_contexts||0),0),excluded_contexts:results.reduce((n,r)=>n+r.excluded_contexts,0),scope:'Consolidated primary statements from selected OpenDART reports. Statements of changes in equity and dimensional account details are excluded; share counts and split history may be unavailable.'}};
 ctx.waitUntil(caches.default.put(cacheKey,new Response(JSON.stringify(value),{headers:{'Cache-Control':'public, max-age='+(value.source_coverage.status==='partial'?60:21600)}})));return value;
}

export async function loadKoreanSplits(ticker,env,ctx){
 const profile=await loadKoreanProfile(ticker,env,ctx),cik='DART'+profile.corp_code,key=new Request(`https://research-api.royrliu.com/internal/native-splits/${ticker}?v=1`),cached=await caches.default.match(key);if(cached)return cached.json();
 if(!profile.quote_symbol)return {cik,status:'unavailable',events:[],reason:'No verified native quote symbol.'};
 try{
  const end=Math.floor(Date.now()/1000),url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(profile.quote_symbol)}?interval=1mo&period1=0&period2=${end}&events=splits`,response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0',Accept:'application/json'},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error();const data=parseYahooSplits(await response.json(),profile.quote_symbol,cik,new Date().toISOString());
  ctx.waitUntil(caches.default.put(key,new Response(JSON.stringify(data),{headers:{'Cache-Control':'public, max-age=86400'}})));return data;
 }catch{return {cik,status:'unavailable',events:[],reason:'Native split history could not be verified.'};}
}
