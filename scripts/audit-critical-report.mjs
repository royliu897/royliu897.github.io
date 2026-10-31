// Offline audit of saved report payloads. No provider requests or UI bundle cost.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {reportValuation} from '../assets/report/native-valuation.mjs';
const [directory,output]=process.argv.slice(2);
if(!directory)throw Error('Usage: node scripts/audit-critical-report.mjs PAYLOAD_DIRECTORY [OUTPUT_JSON]');
const keys=['revenue','gross_profit','operating_income','interest_expense','net_income','eps_diluted','eps_basic','cash','total_debt','total_current_assets','total_current_liabilities','inventory','accounts_receivable','shareholders_equity','goodwill','current_capital_leases','noncurrent_capital_leases','operating_lease_liabilities_current','operating_lease_liabilities_noncurrent','reported_lease_liabilities_current','reported_lease_liabilities_noncurrent','cash_from_operations','capital_expenditures','cf_dividends'];
const results=[];
for(const file of (await readdir(directory)).filter(f=>f.endsWith('.json')).sort()){
 const p=JSON.parse(await readFile(path.join(directory,file),'utf8')),f=p.financials;
 if(!f||!p.profile)throw Error(file+' is not a report payload');
 const period=(f.columns||[]).filter(c=>c!=='TTM').at(-1),rows=['income_statement','balance_sheet','cash_flow'].flatMap(t=>f[t]||[]),row=k=>rows.find(r=>r.key===k);
 const fields=Object.fromEntries(keys.map(key=>{const r=row(key),value=r?.values?.[period];return [key,{value:Number.isFinite(value)?value:null,...(r?.provenance?.[period]?{source:r.provenance[period]}:{}),...(r?.availability?.[period]?{availability:r.availability[period]}:{})}];}));
 const valuation=reportValuation(p.price?.price,f),revenue=fields.revenue.value,operating=fields.operating_income.value;
 results.push({symbol:f.ticker||p.profile.symbol,cik:f.cik,currency:p.profile.currency,period,template:f.statement_template||f.company_type||'general',fields,roic:f.roic_series||[],operating_margin:Number.isFinite(revenue)&&revenue!==0&&Number.isFinite(operating)?operating/revenue*100:null,valuation});
}
if(!results.length)throw Error('No payloads found');
const result={scope:'Critical financial-core coverage, source receipts and calculation inputs. A blank is a review candidate, not proof that the issuer disclosed the item. Bank/insurance and source-specific scopes remain distinct. No independent audit or completeness percentage.',results};
if(output)await writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({securities:results.length,unfilled_core_cells:results.reduce((n,r)=>n+Object.values(r.fields).filter(v=>v.value===null).length,0)}));
