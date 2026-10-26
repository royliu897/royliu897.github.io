import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {companies,symbols} from '../assets/research/data.mjs?v=2';
import {annualFacts} from '../assets/research/research-data.mjs?v=5';
import {filingLabel} from '../assets/research/periods.mjs?v=2';
const calls=[];
globalThis.fetch=async url=>{
 calls.push(String(url));
 if(String(url).startsWith('https://research-api.royrliu.com/'))return Response.json({ticker:'MCD',filings:[]});
 return Response.json(JSON.parse(await readFile(url,'utf8')));
};
const {filingList,financialFacts,refreshSEC}=await import('../assets/research/sec-client.mjs?v=2');
assert.equal(calls.length,0,'No eager data loading');
for(const ticker of ['2317','000660']){
 assert.ok(symbols.includes(ticker));
 const list=await filingList(ticker,'2024','2026');
 assert.ok(list.filings.length>=5);
 assert.ok(calls.every(u=>!u.includes('-facts.json')),'Listing sources does not load financials');
 const [a,b]=await Promise.all([financialFacts(ticker),financialFacts(ticker)]);
 assert.equal(a,b,'Concurrent requests share one result');
 assert.equal(calls.filter(u=>u.endsWith(ticker+'-facts.json')).length,1);
 assert.equal(a.currency,companies[ticker].currency);
 const ids=new Set(list.filings.map(f=>f.accession));
 for(const f of list.filings){assert.ok(filingLabel(f));assert.equal(new URL(f.url).protocol,'https:');}
 for(const f of Object.values(a.facts))for(const [unit,rows] of Object.entries(f.units)){
  assert.ok(unit.startsWith(a.currency));
  for(const p of rows){assert.ok(ids.has(p.accn));assert.ok(Number.isFinite(p.val));assert.ok(p.url);assert.ok(p.filed>=p.end);}
 }
 const yearly=annualFacts(a.facts.Revenues,a.currency,a.asOf);
 assert.deepEqual(yearly.map(p=>p.date),['2022-12-31','2023-12-31','2024-12-31','2025-12-31']);
 assert.ok(yearly.every(p=>p.url),'Evidence links survive normalization');
 const earlier=annualFacts(a.facts.Revenues,a.currency,'2024-12-31');
 assert.ok(earlier.every(p=>p.date<='2023-12-31'),'Publication cutoff respected');
 assert.equal(yearly.at(-1).value,ticker==='2317'?8103105000000:97146700000000);
 const current=await filingList(ticker,'2026','2026');assert.ok(current.filings.every(f=>f.date.startsWith('2026')));
 calls.length=0;refreshSEC();
}
await filingList('MCD');assert.match(calls[0],/^https:\/\/research-api\.royrliu\.com\/company\/CIK63908\/filings/);
await assert.rejects(()=>financialFacts('UNKNOWN'),/Unknown company/);
console.log('Company providers: lazy requests, deduplication, annual/quarter separation, publication dates, currencies and source links pass.');
