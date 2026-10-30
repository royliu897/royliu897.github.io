import {mkdir,writeFile} from 'node:fs/promises';
import {normalizeDartStatement} from '../sec-worker/dart-financials.mjs';
import {toReportPayload} from '../assets/report/sec-adapter.mjs';
const root=process.argv[2];if(!root)throw Error('Pass an external audit cache directory');await mkdir(root,{recursive:true});
const asOf=new Date().toISOString().slice(0,10),cases=[['KRX','005380'],['KRX','051910'],['TWSE','2317'],['TWSE','2454']],results=[];
const base='https://research-api.royrliu.com';
async function source(path){const response=await fetch(base+path,{headers:{Origin:'http://127.0.0.1:8766'},signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error('HTTP '+response.status+' '+path);return response.json();}
const val=(facts,name,unit,end,start)=>facts[name]?.units?.[unit]?.filter(p=>p.end===end&&(start===undefined||p.start===start)&&!p.unresolved&&!p.excluded_from_mapping).sort((a,b)=>(b.filed||'').localeCompare(a.filed||''))[0]?.val;
for(const [exchange,ticker] of cases){
 const started=performance.now(),id=exchange+'-'+ticker;
 try{
  const profile=await source(`/international/${exchange}/${ticker}/profile`),raw=await source(`/international/${exchange}/${ticker}/statement?year=2025&${exchange==='KRX'?'report=11011':'quarter=4'}`);
  await writeFile(root+'/'+id+'-profile.json',JSON.stringify(profile));await writeFile(root+'/'+id+'-statement.json',JSON.stringify(raw));
  const normalized=exchange==='KRX'?normalizeDartStatement(raw,profile,2025,'11011',asOf):raw,currency=exchange==='KRX'?'KRW':'TWD',provider=exchange==='KRX'?'OpenDART':'Taiwan MOPS';
  if(normalized.status!=='available')throw Error('No available normalized statement');
  const facts=normalized.facts,checks=[],ends=[...new Set((facts.Assets?.units?.[currency]||[]).filter(p=>!p.unresolved).map(p=>p.end))];
  const identity=(name,inputs,expected)=>{if(!inputs.every(Number.isFinite)){checks.push({name,status:'not_assessed',reason:'Required reported inputs unavailable'});return;}const difference=inputs[0]-expected(inputs);checks.push({name,status:Math.abs(difference)<=Math.max(1,Math.abs(inputs[0])*1e-12)?'pass':'review',difference_native: difference});};
  for(const end of ends){identity('Assets=liabilities+equity '+end,['Assets','Liabilities','Equity'].map(n=>val(facts,n,currency,end)),a=>a[1]+a[2]);identity('Total equity=owners+NCI '+end,['Equity','EquityAttributableToOwnersOfParent','NoncontrollingInterests'].map(n=>val(facts,n,currency,end)),a=>a[1]+a[2]);}
  for(const p of facts.ProfitLoss?.units?.[currency]||[])if(!p.unresolved&&!p.excluded_from_mapping)identity('Total profit=owners+NCI '+p.start+'/'+p.end,[p.val,val(facts,'ProfitLossAttributableToOwnersOfParent',currency,p.end,p.start),val(facts,'ProfitLossAttributableToNoncontrollingInterests',currency,p.end,p.start)],a=>a[1]+a[2]);
  const payload=toReportPayload({cik:exchange==='KRX'?'DART'+profile.corp_code:'TWSE'+ticker,asOf,provider,facts},profile,null,'annual',exchange+':'+ticker),columns=payload.financials.columns.filter(c=>c!=='TTM');
  const populated=Object.fromEntries(['income_statement','balance_sheet','cash_flow'].map(t=>[t,payload.financials[t].reduce((n,r)=>n+columns.filter(c=>Number.isFinite(r.values[c])).length,0)]));
  await writeFile(root+'/'+id+'-normalized.json',JSON.stringify(normalized));
  results.push({exchange,ticker,name:profile.name,status:checks.some(c=>c.status==='review')?'review':'pass',duration_ms:Math.round(performance.now()-started),currency,annual_columns:columns,populated_template_cells:populated,source_accounts:Object.keys(facts).length,normalizer_conflicts:normalized.conflicts?.length||0,checks,sources:normalized.sources});
 }catch(error){results.push({exchange,ticker,status:'unavailable',duration_ms:Math.round(performance.now()-started),reason:error.message});}
}
const report={asOf,scope:'Four additional issuers from public proxy of official DART/MOPS sources. Accounting identities and adapter consistency, not an independent audit of complete filings or a universal coverage estimate.',results};
await writeFile(root+'/native-adversarial-live-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
