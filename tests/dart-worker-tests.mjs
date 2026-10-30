import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker from '../sec-worker/worker.mjs';
const annual=JSON.parse(await readFile(new URL('./fixtures/dart-hynix-2025.json',import.meta.url),'utf8'));
const interim=JSON.parse(await readFile(new URL('./fixtures/dart-hynix-2026-h1.json',import.meta.url),'utf8'));
const secret='TEST_DART_CREDENTIAL_DO_NOT_RETURN',calls=[],cachedKeys=[],cachedBodies=[];
globalThis.caches={default:{match:async()=>null,put:async(key,response)=>{cachedKeys.push(key.url);cachedBodies.push(await response.text());}}};
globalThis.fetch=async input=>{
 const url=new URL(input);calls.push(url);
 if(url.hostname==='opendart.fss.or.kr'){
  assert.equal(url.searchParams.get('crtfc_key'),secret);
  if(url.pathname.endsWith('company.json'))return Response.json({status:'000',corp_code:'00164779',stock_code:'000660',corp_name_eng:'SK hynix Inc.',acc_mt:'12',corp_cls:'Y'});
  if(url.pathname.endsWith('stockTotqySttus.json'))return Response.json({status:'000',list:[{corp_code:'00164779',rcept_no:'20260814003509',stlm_dt:'2026-06-30',se:'보통주',distb_stock_co:'711,075,500'},{corp_code:'00164779',rcept_no:'20260814003509',stlm_dt:'2026-06-30',se:'합계',distb_stock_co:'711,075,500'}]});
  assert.equal(url.searchParams.get('fs_div'),'CFS');
  const year=url.searchParams.get('bsns_year'),code=url.searchParams.get('reprt_code');
  return Response.json(year==='2025'&&code==='11011'?annual:year==='2026'&&code==='11012'?interim:{status:'013',message:'No data'});
 }
 if(url.hostname==='query1.finance.yahoo.com')return Response.json({chart:{result:[{meta:{symbol:'000660.KS',currency:'KRW'},events:{splits:{}},timestamp:[],indicators:{quote:[{close:[]}]}}]}});
 throw Error('Unexpected source host');
};
const env={SITE_ORIGIN:'https://royrliu.com',DART_API_KEY:secret},ctx={waitUntil:async p=>p};
const request=path=>worker.fetch(new Request('https://research-api.royrliu.com'+path),env,ctx);
let response=await request('/international/search?q=000660');assert.equal(response.status,200);assert.equal((await response.json()).results[0].corp_code,'00164779');assert.equal(calls.length,0,'Native search uses cached regulator metadata, not upstream API calls');
response=await request('/international/KRX/000660/profile');assert.equal(response.status,200);const profile=await response.json();assert.equal(profile.quote_symbol,'000660.KS');assert.ok(!JSON.stringify(profile).includes(secret));
response=await request('/international/KRX/000660/facts');assert.equal(response.status,200);const facts=await response.json();assert.equal(facts.cik,'DART00164779');assert.equal(facts.current_shares.common_outstanding,711075500);assert.equal(facts.current_shares.multiple_classes,false);assert.equal(facts.facts.Revenue.units.KRW[0].val,97146675000000);assert.ok(!JSON.stringify(facts).includes(secret));
response=await request('/international/KRX/000660/splits');assert.equal(response.status,200);assert.equal((await response.json()).status,'available');
assert.ok(cachedKeys.every(k=>!k.includes(secret)&&!k.includes('crtfc_key')),'Cache keys never contain the API credential');
assert.ok(cachedBodies.every(b=>!b.includes(secret)),'Stored public data never contains the API credential');
assert.equal((await request('/international/KRX/000660/profile?url=https://example.com')).status,400);
assert.equal((await request('/international/KRX/999999/profile')).status,404);
response=await worker.fetch(new Request('https://research-api.royrliu.com/international/KRX/000660/profile'),{SITE_ORIGIN:env.SITE_ORIGIN},ctx);assert.equal(response.status,503);
console.log('Native Worker routes pass: regulator directory, issuer checks, CFS-only requests, verified quote symbol, split identity, bounded parameters and no credentials in public responses/caches.');
