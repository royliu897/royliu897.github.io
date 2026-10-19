export const companies={MCD:63908,AAPL:320193,CAT:18230,KO:21344,NKE:320187};
const inflight=new Map();
export function rows(data,cik){return (data.form||[]).flatMap((form,i)=>{if(!/^(10-K|10-Q|8-K|DEF 14A)(\/A)?$/.test(form))return [];const accession=data.accessionNumber[i],file=data.primaryDocument[i];if(!/^\d{10}-\d{2}-\d{6}$/.test(accession)||!file||file.includes('..'))return [];return [{form,accession,date:data.filingDate[i],period:data.reportDate?.[i]||'',url:`https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replaceAll('-','')}/${file}`}];});}
function error(message,status=502){return Object.assign(new Error(message),{status});}
async function upstream(path,env,ctx,ttl){
 const url='https://data.sec.gov/'+path,key=new Request(url),cached=await caches.default.match(key);if(cached)return cached.json();
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
 const u=new URL(request.url),match=u.pathname.match(/^\/company\/([A-Z]{1,5})\/(filings|facts)$/);if(!match||!companies[match[1]])return reply({error:'Unknown company or endpoint.'},404);
 if([...u.searchParams.keys()].some(k=>!['from','to'].includes(k)))return reply({error:'Unsupported parameter.'},400);
 if(env.CLIENT_LIMIT&&!(await env.CLIENT_LIMIT.limit({key:request.headers.get('CF-Connecting-IP')||'local'})).success)return reply({error:'Too many requests. Retry in a minute.'},429);
 try{const ticker=match[1],cik=companies[ticker],padded=String(cik).padStart(10,'0'),fetchedAt=new Date().toISOString(),asOf=fetchedAt.slice(0,10);
 if(match[2]==='facts'){const data=await upstream(`api/xbrl/companyfacts/CIK${padded}.json`,env,ctx,3600);return reply({cik:String(cik),asOf,fetchedAt,facts:data.facts?.['us-gaap']||{}});}
 const from=u.searchParams.get('from')||'2009',to=u.searchParams.get('to')||asOf.slice(0,4);if(!/^\d{4}$/.test(from)||!/^\d{4}$/.test(to)||+from<1994||+to>+asOf.slice(0,4)+1||from>to)return reply({error:'Invalid year range.'},400);
 const data=await upstream(`submissions/CIK${padded}.json`,env,ctx,300);let filings=rows(data.filings.recent,cik);
 const archives=(data.filings.files||[]).filter(f=>f.filingTo>=from+'-01-01'&&f.filingFrom<=to+'-12-31');if(archives.length>12)throw error('Narrow the filing year range.',400);
 for(const archive of archives){if(!/^CIK\d{10}-submissions-\d+\.json$/.test(archive.name))continue;filings.push(...rows(await upstream('submissions/'+archive.name,env,ctx,86400),cik));}
 filings=filings.filter(f=>f.date>=from+'-01-01'&&f.date<=to+'-12-31').filter((f,i,a)=>a.findIndex(x=>x.accession===f.accession)===i).sort((a,b)=>b.date.localeCompare(a.date));return reply({cik:String(cik),ticker,asOf,fetchedAt,filings});
 }catch(e){console.error(e.message);return reply({error:e.status?e.message:'SEC request failed. Try again shortly.'},e.status||502);}
}};
