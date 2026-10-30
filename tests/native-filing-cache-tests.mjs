import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {selectNativeFilingCache,loadNativeFilingCache} from '../assets/report/native-filing-cache.mjs';
import {toReportPayload} from '../assets/report/sec-adapter.mjs';
const root=new URL('../assets/report/data/native-filings/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8')),knowledge=manifest.known_at;
const files=new Map(Object.values(manifest.companies).map(entry=>[entry.file,readFileSync(new URL(entry.file,root),'utf8')]));
const payload=symbol=>JSON.parse(files.get(manifest.companies[symbol].file));
let checked=0;
for(const [symbol,entry]of Object.entries(manifest.companies)){
 const raw=payload(symbol),before=JSON.stringify(raw),selected=selectNativeFilingCache(manifest,symbol,raw,knowledge);assert.ok(selected,symbol+' cached snapshot is eligible');
 assert.equal(createHash('sha256').update(files.get(entry.file)).digest('hex'),entry.sha256);assert.equal(selected.native_symbol,symbol);assert.equal(selected.cik,entry.cik);assert.equal(selected.provider,entry.provider);assert.deepEqual(selected.history_periods,[],'Cached fallback never starts additional live MOPS history requests');assert.equal(selected.source_coverage.status,'partial');assert.equal(selected.source_coverage.cached_snapshot,true);assert.match(selected.source_coverage.scope,/cached/i);assert.ok(!('financials' in selected),'Cache contains source facts rather than derived report values');
 let report=toReportPayload(selected,selected.native_profile,null,'annual',symbol);if(!report.financials.available_periods.annual)report=toReportPayload(selected,selected.native_profile,null,'quarterly',symbol);assert.ok(report.financials.available_periods.annual||report.financials.available_periods.quarterly,'Cached source renders available columns for '+symbol);assert.ok(report.financials.income_statement.some(r=>Object.keys(r.values).length),'Cached source reaches report rows for '+symbol);assert.equal(JSON.stringify(raw),before,'Selection and normalization preserve raw cache data');
 if(symbol.startsWith('TWSE:')){
  const dates=[];for(const fact of Object.values(selected.facts))for(const points of Object.values(fact.units))for(const p of points){assert.equal(p.publication_date_unknown,true);assert.equal(p.known_at,knowledge);assert.equal(p.filed,knowledge);dates.push(p.end);}
  assert.ok(dates.length>0);const previous=new Date(Date.parse(knowledge)-86400000).toISOString().slice(0,10),historical=toReportPayload(selected,selected.native_profile,null,'annual',symbol,{mode:'point_in_time',knowledge_as_of:previous});assert.equal(Object.keys(historical.financials.income_statement.find(r=>r.key==='revenue').values).length,0,'Unknown MOPS publication times cannot leak through cached historical backtests');
 }
 if(selected.current_shares){assert.equal(selected.current_shares.status,'available');assert.ok(selected.current_shares.common_outstanding>0);assert.equal(typeof selected.current_shares.multiple_classes,'boolean');}
 checked++;
}
assert.equal(checked,7);
const symbol='TWSE:2330',data=payload(symbol),firstFact=Object.keys(data.facts)[0],unit=Object.keys(data.facts[firstFact].units)[0];
for(const mutation of [d=>d.cik='TWSE2454',d=>d.native_symbol='TWSE:2454',d=>d.provider='OpenDART',d=>d.native_profile.ticker='2454',d=>d.cache_version=2,d=>d.cache_known_at='2026-02-30',d=>d.asOf='2099-01-01',d=>d.facts[firstFact].units[unit][0].filed='2099-01-01',d=>d.facts[firstFact].units[unit][0].end='2026-02-30']){
 const bad=structuredClone(data);mutation(bad);assert.equal(selectNativeFilingCache(manifest,symbol,bad,knowledge),null,'Mismatched identity/date/version rejected');
}
assert.equal(selectNativeFilingCache(manifest,'NYSE:TSM',data,knowledge),null,'ADR/native identity is explicit outside the filing cache');assert.equal(selectNativeFilingCache(manifest,'TWSE:9999',data,knowledge),null);
let calls=[];
const fetcher=async url=>{calls.push(String(url));return String(url).endsWith('/manifest.json')?Response.json(manifest):new Response(files.get(String(url).split('/').at(-1))||'',{status:files.has(String(url).split('/').at(-1))?200:404});};
assert.equal((await loadNativeFilingCache('TWSE:2330',fetcher)).cik,'TWSE2330');assert.equal((await loadNativeFilingCache('TWSE:2454',fetcher)).cik,'TWSE2454');await loadNativeFilingCache('TWSE:2330',fetcher);assert.equal(calls.filter(u=>u.endsWith('/manifest.json')).length,1);assert.equal(calls.length,3,'Shared manifest and per-issuer pending cache avoid repeated requests');assert.ok(calls.every(url=>url.includes('/assets/report/data/native-filings/')),'Only same-origin static objects are fetched');
const corruption=await import('../assets/report/native-filing-cache.mjs?integrity-attack');
assert.equal(await corruption.loadNativeFilingCache(symbol,async url=>String(url).endsWith('/manifest.json')?Response.json(manifest):new Response(files.get(manifest.companies[symbol].file)+' ')),null,'Altered snapshot bytes fail SHA256 integrity');
const swapped=await import('../assets/report/native-filing-cache.mjs?identity-attack');
assert.equal(await swapped.loadNativeFilingCache(symbol,async url=>String(url).endsWith('/manifest.json')?Response.json({...manifest,companies:{[symbol]:{...manifest.companies[symbol],file:manifest.companies['TWSE:2454'].file}}}):new Response(files.get(manifest.companies['TWSE:2454'].file))),null,'Another ticker filename cannot be substituted');
const retry=await import('../assets/report/native-filing-cache.mjs?retry-attack'),originalNow=Date.now;let now=100000,n=0;
try{Date.now=()=>now;const request=async url=>{n++;if(String(url).endsWith('/manifest.json'))return Response.json(manifest);if(n===2)return new Response('',{status:502});return new Response(files.get(String(url).split('/').at(-1)));};assert.equal(await retry.loadNativeFilingCache(symbol,request),null);assert.equal(n,2);assert.equal(await retry.loadNativeFilingCache(symbol,request),null);assert.equal(n,2);now+=60001;assert.equal((await retry.loadNativeFilingCache(symbol,request)).cik,'TWSE2330');assert.equal(n,3);}finally{Date.now=originalNow;}
console.log('Native filing cache tests pass: seven real source snapshots render, identity/hash/calendar guards, raw immutability, MOPS historical-publication quarantine, bounded same-origin caching and transient-retry backoff.');
