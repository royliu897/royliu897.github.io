import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);let requests=[];
globalThis.fetch=async url=>{requests.push(url);return {ok:true,json:async()=>JSON.parse(await readFile(new URL(url,root),'utf8'))};};
const {accessionFromURL,matchFact,cachedFiling}=await import('../assets/research/filing-evidence.mjs');
assert.equal(requests.length,0,'Import must not load documents');
const url='https://www.sec.gov/Archives/edgar/data/63908/000006390826000035/mcd-20251231.htm';
assert.equal(accessionFromURL(url),'0000063908-26-000035');
assert.equal(accessionFromURL(url.replace('www.sec.gov','evil.example')),null);
assert.equal(await cachedFiling('https://example.com/test'),null);
assert.equal(requests.length,0);
const index=await cachedFiling(url);assert.equal(requests.length,2);
await cachedFiling(url);assert.equal(requests.length,2,'Repeat opens reuse metadata');
const api=JSON.parse(await readFile(new URL('assets/research/library/MCD-facts.json',root),'utf8'));
let checked=0;
for(const concept of ['Revenues','NetIncomeLoss','EarningsPerShareDiluted']){
 const unit=concept==='EarningsPerShareDiluted'?'USD/shares':'USD';
 for(const year of [2023,2024,2025]){
  const p=api[concept].units[unit].find(p=>p.accn===index.accession&&p.start===`${year}-01-01`&&p.end===`${year}-12-31`);
  assert.ok(p);const query={concept,start:p.start,date:p.end,unit,value:p.val};const fact=matchFact(index,query);assert.ok(fact);
  const excerpt=await readFile(new URL(index.base+fact.excerpt,root),'utf8');assert.ok(excerpt.includes(`id="${fact.anchor}"`));
  assert.equal(matchFact(index,{...query,value:p.val+1}),null);assert.equal(matchFact(index,{...query,unit:'shares'}),null);checked++;
 }
}
const sample=index.facts[0];assert.equal(matchFact({...index,facts:[sample,{...sample,start:'2025-04-01'}]},{concept:sample.concept,date:sample.end,unit:sample.unit,value:sample.value}),null);
console.log(`${checked} API observations match source tags, periods, units, values and excerpt anchors; lazy cache and ambiguity checks pass.`);
