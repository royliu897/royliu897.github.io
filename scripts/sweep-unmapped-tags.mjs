import {mkdir,writeFile} from 'node:fs/promises';
import {concepts} from '../assets/report/concept-registry.mjs';
const API='https://research-api.royrliu.com',known=new Set(Object.values(concepts).flatMap(([tags])=>tags));
const targets=['V','AAPL','MSFT','NVDA','MCD','JPM','BRK-B','UNH','XOM','TSM','BOBS','CAT'];
const output=process.argv[2]||'/mnt/c/Users/royli/Documents/Codex/2026-10-28/ok-x20/outputs/unmapped-tag-sweep.json';
const fixtureRoot=new URL('../tests/fixtures/',import.meta.url);
await mkdir(fixtureRoot,{recursive:true});
const req=async path=>{const r=await fetch(API+path);if(!r.ok)throw Error('HTTP '+r.status+' '+path);return r.json();};
const directory=await req('/directory'),issuers=[],groups=new Map();
const annual=p=>p.start&&(Date.parse(p.end)-Date.parse(p.start))/86400000>=330&&(Date.parse(p.end)-Date.parse(p.start))/86400000<=380;
for(const ticker of targets){
 const company=directory.companies.find(c=>c.ticker.replaceAll('.','-')===ticker);
 if(!company){issuers.push({ticker,error:'Not found in SEC directory'});continue;}
 try{
  const data=await req(`/company/CIK${company.cik}/facts`);
  const anchors=['Revenues','RevenueFromContractWithCustomerExcludingAssessedTax','RevenueFromContractWithCustomerIncludingAssessedTax','SalesRevenueNet','Revenue','NetIncomeLoss','NetIncomeLossAvailableToCommonStockholdersBasic','IncomeLossFromContinuingOperations','ProfitLoss','ProfitLossAttributableToOwnersOfParent','EarningsPerShareDiluted'];
  const latest=anchors.flatMap(t=>Object.values(data.facts?.[t]?.units||{}).flat()).filter(p=>annual(p)&&p.filed<=data.asOf&&p.end<=data.asOf).map(p=>p.end).sort().at(-1);
  if(!latest){issuers.push({...company,error:'No annual anchor in CompanyFacts'});continue;}
  const included=[],mapped=[],all=[];
  for(const [tag,fact]of Object.entries(data.facts||{})){
   for(const [unit,observations]of Object.entries(fact.units||{})){
    if(!/^[A-Z]{3}(?:\/shares)?$|^shares$/.test(unit))continue;
    const points=observations.filter(p=>p.end===latest&&Number.isFinite(p.val)&&p.filed<=data.asOf&&(!p.start||annual(p))).sort((a,b)=>b.filed.localeCompare(a.filed));
    const observation=points[0];if(!observation)continue;
    const record={tag,namespace:fact.namespace,label:fact.label,description:fact.description,unit,observation:{...observation},filing_url:observation.accn?`https://www.sec.gov/Archives/edgar/data/${Number(company.cik)}/${observation.accn.replaceAll('-','')}/`:undefined};
    all.push(record);
    if(known.has(tag)){mapped.push(record);continue;}
    included.push(record);
    const key=(fact.namespace||'unknown')+':'+tag;
    if(!groups.has(key))groups.set(key,{tag,namespace:fact.namespace,label:fact.label,description:fact.description,issuers:[]});
    groups.get(key).issuers.push({ticker,unit,value:observation.val,end:observation.end,accn:observation.accn,url:record.filing_url});
   }
  }
  const fixture={cik:company.cik,ticker,asOf:data.asOf,latest_annual_end:latest,facts:Object.fromEntries(all.filter(r=>['CostsAndExpenses','GeneralAndAdministrativeExpense','PaymentsToAcquireProductiveAssets','AmortizationOfIntangibleAssets','Depreciation','DepreciationAndAmortization','IncomeTaxesPaidNet','DeferredIncomeTaxAssetsNet','InterestIncomeExpenseAfterProvisionForLoanLoss','InterestAndDividendIncomeOperating','PaymentsToAcquirePropertyPlantAndEquipmentAndIntangibleAssets'].includes(r.tag)).map(r=>[r.tag,data.facts[r.tag]]))};
  await writeFile(new URL(`unmapped-sweep-${ticker.toLowerCase()}.json`,fixtureRoot),JSON.stringify(fixture,null,2)+'\n');
  issuers.push({...company,latest_annual_end:latest,total_numeric_concepts:all.length,mapped_concepts:mapped.length,unmapped_concepts:included.length,unmapped:included});
  console.log(ticker,latest,`${included.length}/${all.length} candidate concepts outside registry`);
 }catch(error){issuers.push({...company,error:error.message});console.log(ticker,error.message);}
 await new Promise(resolve=>setTimeout(resolve,1600));
}
const recurring=[...groups.values()].map(g=>({...g,issuer_count:new Set(g.issuers.map(i=>i.ticker)).size})).sort((a,b)=>b.issuer_count-a.issuer_count||a.tag.localeCompare(b.tag));
const result={generated_at:new Date().toISOString(),scope:'Standard numeric monetary/share/per-share concepts at latest annual end, CompanyFacts only. Unmapped is not equivalent to missing primary-statement rows. Custom/dimensional/untagged disclosures excluded from feed.',targets,issuers,recurring};
await writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log('Saved',output,'unique candidates',groups.size);
