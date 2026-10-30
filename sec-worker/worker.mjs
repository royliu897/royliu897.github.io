import {loadTaiwanProfile,loadTaiwanFacts,loadTaiwanSplits,loadTaiwanStatement,taiwanListings} from './taiwan-provider.mjs';
import {loadUsdFx} from './fx-provider.mjs';
import {loadKoreanProfile,loadKoreanFacts,loadKoreanSplits,koreanListings,dartRequest} from './dart-provider.mjs';
import {loadClassFacts} from './class-facts-loader.mjs';
import {parseYahooSplits} from './split-feed.mjs';
import {extractBusinessDescription} from './business-description.mjs';
export const companies={MCD:63908,AAPL:320193,CAT:18230,KO:21344,NKE:320187};
const inflight=new Map();
export function rows(data,cik){return (data.form||[]).flatMap((form,i)=>{if(!/^(10-K|10-Q|8-K|20-F|40-F|6-K|DEF 14A|F-1|S-1|424B4)(\/A)?$/.test(form))return [];const accession=data.accessionNumber[i],file=data.primaryDocument[i];if(!/^\d{10}-\d{2}-\d{6}$/.test(accession)||!file||file.includes('..'))return [];return [{form,accession,date:data.filingDate[i],period:data.reportDate?.[i]||'',url:`https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replaceAll('-','')}/${file}`}];});}
const sameCIK=(value,expected)=>/^0*[1-9][0-9]{0,9}$/.test(String(value))&&Number(value)===Number(expected);
function error(message,status=502){return Object.assign(new Error(message),{status});}
async function upstream(path,env,ctx,ttl){
 const url=path==='files/company_tickers_exchange.json'?'https://www.sec.gov/'+path:'https://data.sec.gov/'+path,key=new Request(url),cached=await caches.default.match(key);if(cached)return cached.json();
 if(inflight.has(url))return inflight.get(url);
 const promise=(async()=>{if(env.UPSTREAM_LIMIT&&!(await env.UPSTREAM_LIMIT.limit({key:'sec'})).success)throw error('SEC request limit reached. Retry in a minute.',429);
 const response=await fetch(url,{headers:{'User-Agent':env.SEC_USER_AGENT,Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw error(`SEC unavailable (${response.status}). Try again shortly.`,response.status===429?429:502);
 const text=await response.text();if(text.length>25000000)throw error('SEC response exceeds size limit.');let data;try{data=JSON.parse(text);}catch{throw error('SEC returned an unexpected response.');}
 ctx.waitUntil(caches.default.put(key,new Response(text,{headers:{'Content-Type':'application/json','Cache-Control':`public, max-age=${ttl}`}})));return data;})();
 inflight.set(url,promise);try{return await promise;}finally{inflight.delete(url);}
}
export default {async fetch(request,env,ctx){
 const origin=request.headers.get('Origin'),allowed=origin===env.SITE_ORIGIN||origin==='http://127.0.0.1:8766'||origin==='http://localhost:8766';
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};if(allowed)headers['Access-Control-Allow-Origin']=origin;
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&!allowed)return reply({error:'Origin not allowed.'},403);
 if(request.method!=='GET')return reply({error:'GET required.'},405);
 const u=new URL(request.url),fx=u.pathname.match(/^\/fx\/([A-Z]{3})$/),dartTaxonomy=u.pathname==='/international/dart-taxonomy',taiwan=u.pathname.match(/^\/international\/TWSE\/(\d{4,6})\/(profile|facts|splits|statement)$/),nativeSearch=u.pathname==='/international/search',native=u.pathname.match(/^\/international\/KRX\/(\d{6})\/(profile|facts|splits|statement|shares)$/),quote=u.pathname.match(/^\/quote\/([A-Z0-9][A-Z0-9.^-]{0,23})$/),directory=u.pathname==='/directory',match=u.pathname.match(/^\/company\/([A-Z]{1,5}|CIK[0-9]{1,10})\/(filings|facts|description|splits|class-facts)$/);if(!taiwan&&!fx&&!dartTaxonomy&&!nativeSearch&&!native&&!quote&&!directory&&(!match||(!companies[match[1]]&&!/^CIK[0-9]{1,10}$/.test(match[1]))))return reply({error:'Unknown company or endpoint.'},404);
 if([...u.searchParams.keys()].some(k=>!['from','to',...(nativeSearch?['q']:[]),...(taiwan?.[2]==='statement'?['year','quarter']:[]),...(dartTaxonomy?['statement']:[]),...(['statement','shares'].includes(native?.[2])?['year','report']:[]),...(quote?['refresh']:[]),...(match?.[2]==='class-facts'?['ticker','accession']:[])].includes(k)))return reply({error:'Unsupported parameter.'},400);
 if(env.CLIENT_LIMIT&&!(await env.CLIENT_LIMIT.limit({key:request.headers.get('CF-Connecting-IP')||'local'})).success)return reply({error:'Too many requests. Retry in a minute.'},429);
 try{if(taiwan){if(taiwan[2]==='statement'){const year=Number(u.searchParams.get('year')),quarter=Number(u.searchParams.get('quarter'));if(!Number.isInteger(year)||year<2013||year>new Date().getUTCFullYear()||![1,2,3,4].includes(quarter))return reply({error:'Invalid Taiwan statement period.'},400);return reply(await loadTaiwanStatement(await loadTaiwanProfile(taiwan[1]),year,quarter,env,ctx));}if(u.search)return reply({error:'Unsupported Taiwan parameter.'},400);return reply(await (taiwan[2]==='facts'?loadTaiwanFacts:taiwan[2]==='splits'?loadTaiwanSplits:loadTaiwanProfile)(taiwan[1],env,ctx));}if(fx){if(u.search)return reply({error:'FX does not accept parameters.'},400);return reply(await loadUsdFx(fx[1],ctx));}if(dartTaxonomy){const statement=u.searchParams.get('statement');if(!/^(BS[1-4]|IS[1-4]|CIS[1-4]|DCIS[1-8]|CF[1-4]|SCE[12])$/.test(statement||''))return reply({error:'Invalid taxonomy statement.'},400);return reply(await dartRequest('xbrlTaxonomy.json',{sj_div:statement},env,ctx,604800));}if(nativeSearch){const query=(u.searchParams.get('q')||'').trim().toLowerCase();if(query.length<2||query.length>100)return reply({results:[]});return reply({results:[...koreanListings,...taiwanListings].filter(c=>`${c.ticker} ${c.name} ${c.local_name||''} ${c.short_name||''}`.toLowerCase().includes(query)).slice(0,20).map(c=>({...c,cik:c.exchange==='TWSE'?'TWSE'+c.ticker:'DART'+c.corp_code}))});}if(native){if(['statement','shares'].includes(native[2])){const year=u.searchParams.get('year'),report=u.searchParams.get('report');if(!/^20\d{2}$/.test(year||'')||Number(year)<2015||Number(year)>new Date().getUTCFullYear()||!['11011','11012','11013','11014'].includes(report))return reply({error:'Invalid statement period.'},400);const profile=await loadKoreanProfile(native[1],env,ctx);return reply(await dartRequest(native[2]==='shares'?'stockTotqySttus.json':'fnlttSinglAcntAll.json',{corp_code:profile.corp_code,bsns_year:year,reprt_code:report,...(native[2]==='shares'?{}:{fs_div:'CFS'})},env,ctx));}if(u.search)return reply({error:'Unsupported native-report parameter.'},400);return reply(await (native[2]==='facts'?loadKoreanFacts:native[2]==='splits'?loadKoreanSplits:loadKoreanProfile)(native[1],env,ctx));}if(quote){if(u.searchParams.has('refresh')&&u.searchParams.get('refresh')!=='1')return reply({error:'Invalid refresh.'},400);const ticker=quote[1],url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(ticker)+'?interval=1d&range=5d',key=new Request(url),cached=u.searchParams.has('refresh')?null:await caches.default.match(key);if(cached)return reply(await cached.json());const res=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0',Accept:'application/json'},signal:AbortSignal.timeout(12000)});if(!res.ok)throw error('Quote unavailable. Enter price manually.');const json=await res.json(),m=json.chart?.result?.[0]?.meta;if(!m||m.symbol!==ticker||!Number.isFinite(m.regularMarketPrice)||m.regularMarketPrice<=0||!m.regularMarketTime||!m.currency)throw error('Quote unavailable. Enter price manually.');const data={ticker,price:m.regularMarketPrice,currency:m.currency,asOf:new Date(m.regularMarketTime*1000).toISOString(),fetchedAt:new Date().toISOString(),source:'Yahoo Finance'};ctx.waitUntil(caches.default.put(key,new Response(JSON.stringify(data),{headers:{'Cache-Control':'public, max-age=300'}})));return reply(data);}if(directory){const data=await upstream('files/company_tickers_exchange.json',env,ctx,86400);return reply({companies:(data.data||[]).map(row=>Object.fromEntries(data.fields.map((field,i)=>[field,row[i]]))).filter(c=>c.cik&&c.ticker&&c.name).map(c=>({cik:String(c.cik),ticker:c.ticker,name:c.name,exchange:c.exchange||''}))});}const ticker=match[1],cik=companies[ticker]||Number(ticker.slice(3)),padded=String(cik).padStart(10,'0'),fetchedAt=new Date().toISOString(),asOf=fetchedAt.slice(0,10);
 if(match[2]==='facts'){const data=await upstream(`api/xbrl/companyfacts/CIK${padded}.json`,env,ctx,3600);if(!sameCIK(data.cik,cik))throw error('SEC company identity mismatch.');return reply({cik:String(cik),asOf,fetchedAt,entityName:data.entityName,facts:Object.assign({},...['dei','ifrs-full','us-gaap'].map(ns=>Object.fromEntries(Object.entries(data.facts?.[ns]||{}).map(([key,fact])=>[key,{...fact,namespace:ns}]))))});}
 if(match[2]==='class-facts'){
  const symbol=u.searchParams.get('ticker'),accession=u.searchParams.get('accession');
  if(!symbol||!/^[-A-Z0-9.^]{1,24}$/.test(symbol)||!/^\d{10}-\d{2}-\d{6}$/.test(accession||''))return reply({error:'A valid ticker and accession are required.'},400);
  const submissions=await upstream(`submissions/CIK${padded}.json`,env,ctx,300);if(!sameCIK(submissions.cik,cik))throw error('SEC company identity mismatch.');
  if(!(submissions.tickers||[]).includes(symbol))return reply({error:'Ticker does not match this SEC company.'},400);
  return reply(await loadClassFacts({cik,ticker:symbol,accession,submissions,env,ctx,upstream:(path,ttl)=>upstream(path,env,ctx,ttl)}));
 }
 if(match[2]==='splits'){
  if(u.search)return reply({error:'Splits does not accept parameters.'},400);
  const key=new Request(`https://research-api.royrliu.com/company/CIK${cik}/splits?v=3`),cached=await caches.default.match(key);if(cached)return reply(await cached.json());
  const submissions=await upstream(`submissions/CIK${padded}.json`,env,ctx,300);if(!sameCIK(submissions.cik,cik))throw error('SEC company identity mismatch.');
  // Multiple share classes cannot safely be guessed from a company-level CIK.
  const tickers=submissions.tickers||[];
  if(tickers.length!==1)return reply({cik:String(cik),status:'unavailable',events:[],reason:'Split feed needs a uniquely identified share class.'});
  const symbol=tickers[0].replaceAll('.','-');if(!/^[A-Z0-9][A-Z0-9^-]{0,23}$/.test(symbol))throw error('Unsupported split-feed symbol.');
  const end=Math.floor(Date.now()/1000),url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&period1=0&period2=${end}&events=splits`;
  try{
   const response=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0',Accept:'application/json'},signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw Error(`Upstream status ${response.status}`);
   const data=parseYahooSplits(await response.json(),symbol,cik,fetchedAt);
   ctx.waitUntil(caches.default.put(key,new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=86400'}})));return reply(data);
  }catch{return reply({cik:String(cik),ticker:symbol,status:'unavailable',events:[],reason:'Yahoo split history could not be verified. SEC event facts remain available.'});}
 }
 if(match[2]==='description'){
  if(u.search) return reply({error:'Description does not accept parameters.'},400);
  const key=new Request(`https://research-api.royrliu.com/company/CIK${cik}/description?extractor=3`),cached=await caches.default.match(key);if(cached)return reply(await cached.json());
  const submissions=await upstream(`submissions/CIK${padded}.json`,env,ctx,300);if(!sameCIK(submissions.cik,cik))throw error('SEC company identity mismatch.');
  const filing=rows(submissions.filings?.recent||{},cik).filter(f=>f.form==='10-K').sort((a,b)=>b.date.localeCompare(a.date))[0];
  let result={cik:String(cik),description:'',source:null};
  if(filing){
   const url=new URL(filing.url),prefix=`/Archives/edgar/data/${Number(cik)}/${filing.accession.replaceAll('-','')}/`,file=url.pathname.slice(prefix.length);
   if(url.hostname!=='www.sec.gov'||!url.pathname.startsWith(prefix)||!/^[-A-Za-z0-9_.]+\.html?$/.test(file))throw error('Invalid SEC primary document.');
   if(env.UPSTREAM_LIMIT&&!(await env.UPSTREAM_LIMIT.limit({key:'sec'})).success)throw error('SEC request limit reached. Retry in a minute.',429);
   const response=await fetch(url.href,{headers:{'User-Agent':env.SEC_USER_AGENT,Accept:'text/html'},redirect:'manual',signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw error(`SEC description unavailable (${response.status}).`,response.status===429?429:502);
   const excerpt=await extractBusinessDescription(response);
   if(excerpt)result={cik:String(cik),description:excerpt.text,source:{cik:String(cik),url:url.href,accession:filing.accession,form:filing.form,filed:filing.date,period:filing.period,section:excerpt.section,method:excerpt.method}};
  }
  ctx.waitUntil(caches.default.put(key,new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=86400'}})));return reply(result);
 }
 const from=u.searchParams.get('from')||'2009',to=u.searchParams.get('to')||asOf.slice(0,4);if(!/^\d{4}$/.test(from)||!/^\d{4}$/.test(to)||+from<1994||+to>+asOf.slice(0,4)+1||from>to)return reply({error:'Invalid year range.'},400);
 const data=await upstream(`submissions/CIK${padded}.json`,env,ctx,300);if(!sameCIK(data.cik,cik))throw error('SEC company identity mismatch.');let filings=rows(data.filings.recent,cik);
 const archives=(data.filings.files||[]).filter(f=>f.filingTo>=from+'-01-01'&&f.filingFrom<=to+'-12-31');if(archives.length>12)throw error('Narrow the filing year range.',400);
 for(const archive of archives){if(!/^CIK\d{10}-submissions-\d+\.json$/.test(archive.name))continue;filings.push(...rows(await upstream('submissions/'+archive.name,env,ctx,86400),cik));}
 filings=filings.filter(f=>f.date>=from+'-01-01'&&f.date<=to+'-12-31').filter((f,i,a)=>a.findIndex(x=>x.accession===f.accession)===i).sort((a,b)=>b.date.localeCompare(a.date));return reply({cik:String(cik),ticker,asOf,fetchedAt,name:data.name,tickers:data.tickers||[],exchanges:data.exchanges||[],industry:data.sicDescription||'',website:data.investorWebsite||data.website||'',filings});
 }catch(e){console.error(e.message);return reply({error:e.status?e.message:taiwan?'Taiwan MOPS source could not be validated. Try another period or retry shortly.':native?'OpenDART data could not be validated. Try again shortly.':'SEC request failed. Try again shortly.'},e.status||502);}
}};
