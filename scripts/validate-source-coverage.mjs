import {writeFile,mkdir} from 'node:fs/promises';
import {supplementClassFacts} from '../assets/report/filing-supplement.mjs';
import {toReportPayload} from '../assets/report/sec-adapter.mjs';
const [cik='1403161',ticker='V',output]=process.argv.slice(2),base='https://research-api.royrliu.com',started=performance.now(),requests=[];
async function request(path){const start=performance.now(),res=await fetch(base+path);requests.push({path,status:res.status,milliseconds:Math.round(performance.now()-start)});if(!res.ok)throw Error(path+' HTTP '+res.status);return res.json();}
const [facts,profile,splits]=await Promise.all([request(`/company/CIK${cik}/facts`),request(`/company/CIK${cik}/filings?from=${new Date().getFullYear()-1}`),request(`/company/CIK${cik}/splits`)]);
const enriched=await supplementClassFacts(facts,{cik,ticker},profile,request),payload=toReportPayload(enriched,{...profile,ticker},null,'annual',ticker,{split_feed:splits}),f=payload.financials;
const values=Object.fromEntries(['eps_basic','eps_diluted','shares_basic','shares_diluted','net_income','shareholders_equity'].map(key=>{const r=[...f.income_statement,...f.balance_sheet].find(r=>r.key===key);return [key,r?.values];}));
const report={generated_at:new Date().toISOString(),cik,ticker,elapsed_ms:Math.round(performance.now()-started),requests,filing_supplement:enriched.filing_supplement,share_class:enriched.share_class,share_basis:f.share_basis,source_coverage:f.source_coverage,validation:f.validation,values};
if(output)await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({cik,ticker,elapsed_ms:report.elapsed_ms,requests:requests.length,supplement:report.filing_supplement,status:f.validation?.status,checks:f.validation?.checks.length,review:f.validation?.checks.filter(c=>c.status==='review'),values},null,2));
