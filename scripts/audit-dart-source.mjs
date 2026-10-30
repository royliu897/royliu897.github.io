import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {normalizeDartStatement} from '../sec-worker/dart-financials.mjs';
import {concepts} from '../assets/report/concept-registry.mjs';
const root='/home/royl/projects/sftsaf/evidence/foreign';await mkdir(root,{recursive:true});
if(!process.argv.includes('--offline'))for(const [name,path]of [['samsung-2026-h1','/international/KRX/005930/statement?year=2026&report=11012'],...['BS1','IS1','DCIS1','CF3','SCE1'].map(s=>['dart-taxonomy-'+s,'/international/dart-taxonomy?statement='+s])]){
 const r=await fetch('https://research-api.royrliu.com'+path);if(!r.ok)throw Error('Public audit HTTP '+r.status+' '+name);const data=await r.json();await writeFile(root+'/'+name+'.json',JSON.stringify(data));console.log(name,'fields',Object.keys(data),'rows',data.list?.length);
}
const sam=JSON.parse(await readFile(root+'/samsung-2026-h1.json','utf8'));
const seen=new Map();for(const r of sam.list||[]){if(!['BS','IS','CIS','CF'].includes(r.sj_div)||r.account_detail&&r.account_detail!=='-')continue;const key=[r.sj_div,r.account_id].join(':');if(!seen.has(key))seen.set(key,[]);seen.get(key).push(r);}
for(const [key,rows]of seen)if(rows.length>1)console.log('DUPLICATE',key,JSON.stringify(rows.map(r=>({label:r.account_nm,amount:r.thstrm_amount,YTD:r.thstrm_add_amount,prior:r.frmtrm_amount,priorq:r.frmtrm_q_amount,priorYTD:r.frmtrm_add_amount,ord:r.ord}))));
const known=new Set(Object.values(concepts).flatMap(([names])=>names));
const normalized=normalizeDartStatement(sam,{corp_code:'00126380',fiscal_month:'12'},2026,'11012','2026-10-29');
const report={facts:Object.keys(normalized.facts).length,resolved_conflicts:normalized.resolved_conflicts,unresolved_contexts:normalized.unresolved_contexts,conflicts:normalized.conflicts,source:normalized.sources,unmapped:Object.entries(normalized.facts).filter(([name])=>!known.has(name)).map(([name,fact])=>({name,label:fact.label,original_label:fact.original_label,source_account_id:fact.source_account_id}))};
await writeFile('/mnt/c/Users/royli/Documents/Codex/2026-10-28/ok-x20/outputs/dart-samsung-normalization-audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,unmapped:report.unmapped.length},null,2));
