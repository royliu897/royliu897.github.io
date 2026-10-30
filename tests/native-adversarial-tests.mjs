import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeDartStatement} from '../sec-worker/dart-financials.mjs';
import {normalizeTaiwanStatement} from '../sec-worker/taiwan-financials.mjs';
import {toReportPayload} from '../assets/report/sec-adapter.mjs';

// Independent consistency checks on actual official-source snapshots. These
// identities cannot establish external accuracy or disclosure completeness.
const fixture=name=>readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8');
const asOf='2026-10-29',results=[];
function close(a,b,label){assert.ok(Number.isFinite(a)&&Number.isFinite(b),label+' requires reported inputs');assert.ok(Math.abs(a-b)<=Math.max(1,Math.abs(b)*1e-12),label+': '+a+' != '+b);}
function value(facts,name,unit,end,start){return facts[name]?.units?.[unit]?.find(p=>p.end===end&&(start===undefined||p.start===start)&&!p.unresolved&&!p.excluded_from_mapping)?.val;}
function verifyNative(result,provider,ticker,unit){
 const before=JSON.stringify(result),report=toReportPayload({cik:ticker,asOf,provider,facts:result.facts},{ticker});
 const years=[...new Set((result.facts.Assets?.units?.[unit]||[]).filter(p=>!p.start&&!p.unresolved).map(p=>p.end))];
 for(const end of years){const assets=value(result.facts,'Assets',unit,end),liab=value(result.facts,'Liabilities',unit,end),equity=value(result.facts,'Equity',unit,end);if([assets,liab,equity].every(Number.isFinite))close(assets,liab+equity,provider+' balance '+end);
  const parent=value(result.facts,'EquityAttributableToOwnersOfParent',unit,end),nci=value(result.facts,'NoncontrollingInterests',unit,end);if([parent,nci,equity].every(Number.isFinite))close(equity,parent+nci,provider+' equity ownership '+end);
 }
 const totals=result.facts.ProfitLoss?.units?.[unit]||[];
 for(const p of totals.filter(p=>!p.unresolved&&!p.excluded_from_mapping)){
  const owners=value(result.facts,'ProfitLossAttributableToOwnersOfParent',unit,p.end,p.start),nci=value(result.facts,'ProfitLossAttributableToNoncontrollingInterests',unit,p.end,p.start);
  if([owners,nci].every(Number.isFinite))close(p.val,owners+nci,provider+' profit ownership '+p.start+'/'+p.end);
 }
 assert.equal(report.profile.currency,unit);assert.equal(JSON.stringify(result),before,'Adapter must not mutate native source observations');
 results.push({provider,ticker,instant_periods:years.length,reported_profit_observations:totals.filter(p=>!p.unresolved).length,scope:'Actual fixture accounting consistency; not an independent completeness estimate'});
 return report;
}

for(const [file,corp,ticker,year,code] of [
 ['dart-hynix-2025.json','00164779','000660',2025,'11011'],
 ['dart-hynix-2026-h1.json','00164779','000660',2026,'11012'],
 ['dart-samsung-2026-h1.json','00126380','005930',2026,'11012']]){
 const raw=JSON.parse(fixture(file)),profile={corp_code:corp,fiscal_month:'12'},original=JSON.stringify(raw),result=normalizeDartStatement(raw,profile,year,code,asOf);
 verifyNative(result,'OpenDART',ticker,'KRW');assert.equal(JSON.stringify(raw),original);
 const first=raw.list.find(r=>r.sj_div==='BS'&&r.account_id==='ifrs-full_Assets'&&(!r.account_detail||r.account_detail==='-'));assert.ok(first);
 const injected=structuredClone(raw);injected.list.push({...first,account_detail:'Injected segment scope',thstrm_amount:'999999999999999'});
 assert.deepEqual(normalizeDartStatement(injected,profile,year,code,asOf).facts.Assets,result.facts.Assets,'Segment values must not replace consolidated assets');
 const duplicate=structuredClone(raw);duplicate.list.push({...first,thstrm_amount:'999999999999999'});
 const conflicted=normalizeDartStatement(duplicate,profile,year,code,asOf);assert.ok(conflicted.unresolved_contexts>0);assert.ok(conflicted.facts.Assets.units.KRW.filter(p=>p.end===`${year}-${code==='11011'?'12-31':'06-30'}`).every(p=>p.unresolved&&p.excluded_from_mapping),'Conflicting consolidated values must be withheld');
 const wrong=structuredClone(raw);wrong.list[0].corp_code='00000000';assert.throws(()=>normalizeDartStatement(wrong,profile,year,code,asOf),/mismatch/);
 assert.equal(Object.keys(normalizeDartStatement(raw,profile,year,code,year+'-01-01').facts).length,0,'No future receipt may enter an earlier knowledge cutoff');
}

for(const [file,year] of [['mops-tsmc-2015.xml',2015],['mops-tsmc-2025.xhtml',2025]]){
 const raw=fixture(file),result=normalizeTaiwanStatement(raw,{ticker:'2330'},year,4,asOf),report=verifyNative(result,'Taiwan MOPS','2330','TWD');
 assert.throws(()=>normalizeTaiwanStatement(raw,{ticker:'2317'},year,4,asOf),/identity|metadata/);
 assert.throws(()=>normalizeTaiwanStatement(raw,{ticker:'2330'},year-1,4,asOf),/metadata/);
 for(const fact of Object.values(result.facts))for(const points of Object.values(fact.units))for(const p of points){assert.equal(p.publication_date_unknown,true);assert.equal(p.known_at,asOf);assert.equal(p.filed,asOf);}
 const historical=toReportPayload({cik:'TWSE2330',asOf,provider:'Taiwan MOPS',facts:result.facts},{ticker:'2330'},null,'annual','TWSE:2330',{mode:'point_in_time',knowledge_as_of:year+'-12-31'});
 assert.equal(historical.financials.income_statement.find(r=>r.key==='revenue')?.values[String(year)],undefined,'Unknown publication dates cannot support a historical knowledge claim');
 if(year===2025){
  const match=raw.match(/<ix:nonFraction\b[^>]*name="ifrs-full:Revenue"[^>]*>[\s\S]*?<\/ix:nonFraction>/i);assert.ok(match,'Fixture requires a reported revenue observation');
  const mutated=raw.replace(match[0],match[0]+match[0].replace(/>[^<]*<\//,'>999999999</'));
  const bad=normalizeTaiwanStatement(mutated,{ticker:'2330'},year,4,asOf);assert.ok(bad.conflicts.length>0,'Conflicting duplicate inline observations must be identified');
  assert.ok(Object.values(bad.facts.Revenue.units).flat().some(p=>p.unresolved&&p.excluded_from_mapping));
  assert.ok(Object.keys(report.financials.cash_flow.find(r=>r.key==='cash_from_operations').values).length>0);
 }
}
console.log(JSON.stringify({status:'pass',cases:results,limitation:'Five source snapshots, two Korean issuers and one Taiwan issuer. Identities and adversarial mutations validate handling, not universal accuracy.'},null,2));
