import {extractClassFacts} from './class-facts.mjs';
export async function loadClassFacts({cik,ticker,accession,submissions,env,ctx,upstream}){
 const cacheKey=new Request(`https://research-api.royrliu.com/internal/class-facts/${cik}/${ticker}/${accession}?v=3`),cache=await caches.default.match(cacheKey);if(cache)return cache.json();
 let recent=submissions.filings?.recent||{},index=(recent.accessionNumber||[]).indexOf(accession);
 if(index<0){
  const yy=Number(accession.split('-')[1]),year=yy>=94?1900+yy:2000+yy;
  const archives=(submissions.filings?.files||[]).filter(f=>f.filingFrom<=year+'-12-31'&&f.filingTo>=year+'-01-01').slice(0,2);
  for(const file of archives){if(!/^CIK\d{10}-submissions-\d+\.json$/.test(file.name))continue;const data=await upstream('submissions/'+file.name,86400),found=(data.accessionNumber||[]).indexOf(accession);if(found>=0){recent=data;index=found;break;}}
 }
 if(index<0||!/^(10-K|10-Q|20-F|40-F)(\/A)?$/.test(recent.form[index]))throw Error('Accession is not a supported company statement filing.');
 const document=recent.primaryDocument[index];if(!/^[-A-Za-z0-9_.]+\.html?$/.test(document))throw Error('Invalid SEC document name.');
 const root=`https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replaceAll('-','')}/`,filing={accession,form:recent.form[index],date:recent.filingDate[index],period:recent.reportDate?.[index],url:root+document};
 const classKey=new Request(`https://research-api.royrliu.com/internal/listed-class/${cik}/${ticker}?v=1`),stored=await caches.default.match(classKey),verifiedClass=stored?await stored.json():null;
 async function source(url,json=false){
  const key=new Request(url),hit=await caches.default.match(key);if(hit)return json?hit.json():hit.text();
  if(env.UPSTREAM_LIMIT&&!(await env.UPSTREAM_LIMIT.limit({key:'sec'})).success)throw Error('SEC source request limit reached. Retry shortly.');
  const response=await fetch(url,{headers:{'User-Agent':env.SEC_USER_AGENT,Accept:json?'application/json':'application/xml,text/html'},redirect:'manual',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error(`SEC filing source unavailable (${response.status}).`);
  const text=await response.text();if(text.length>12000000)throw Error('Filing source exceeds the extraction size limit.');
  ctx.waitUntil(caches.default.put(key,new Response(text,{headers:{'Cache-Control':'public, max-age=604800'}})));return json?JSON.parse(text):text;
 }
 let dataURL=filing.url;
 try{
  const listing=await source(root+'index.json',true),names=(listing.directory?.item||[]).map(i=>i.name),base=document.replace(/\.html?$/,'');
  const instances=names.filter(n=>/\.xml$/i.test(n)&&!/(?:_(?:cal|def|lab|pre|ref)|FilingSummary|^R\d+)\.xml$/i.test(n));const name=names.find(n=>n===document.replace('.','_')+'.xml')||names.find(n=>n===base+'.xml')||(instances.length===1?instances[0]:null);if(name&&/^[-A-Za-z0-9_.]+\.xml$/.test(name))dataURL=root+name;
 }catch{}
 const text=await source(dataURL),result=extractClassFacts(text,{cik,ticker,filing:{...filing,data_url:dataURL},verifiedClass});
 if(result.share_class)await caches.default.put(classKey,new Response(JSON.stringify(result.share_class),{headers:{'Cache-Control':'public, max-age=604800'}}));
 await caches.default.put(cacheKey,new Response(JSON.stringify(result),{headers:{'Cache-Control':'public, max-age=604800'}}));return result;
}
