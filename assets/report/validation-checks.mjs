const annual=p=>p.start&&(Date.parse(p.end)-Date.parse(p.start))/86400000>=330&&(Date.parse(p.end)-Date.parse(p.start))/86400000<=380;
const latest=(data,names,unit,end,duration)=>names.flatMap(name=>(data.facts?.[name]?.units?.[unit]||[]).map(p=>({...p,concept:name}))).filter(p=>!p.unresolved&&!p.excluded_from_mapping&&p.end===end&&p.filed<=data.asOf&&Number.isFinite(p.val)&&(duration?annual(p):!p.start)).sort((a,b)=>b.filed.localeCompare(a.filed))[0];
function coherentBalance(data,currency,end){
 const groups=new Map(),names=[['Assets'],['Liabilities'],['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest','Equity']];
 for(let i=0;i<names.length;i++)for(const name of names[i])for(const p of data.facts?.[name]?.units?.[currency]||[]){
  if(p.start||p.end!==end||p.filed>data.asOf||p.unresolved||p.excluded_from_mapping||!Number.isFinite(p.val)||!p.accn)continue;
  const id=p.accn+'|'+p.filed;if(!groups.has(id))groups.set(id,[[],[],[]]);groups.get(id)[i].push({...p,concept:name});
 }
 const candidates=[];
 for(const parts of groups.values())if(parts.every(ps=>ps.length&&new Set(ps.map(p=>p.val)).size===1))candidates.push(parts.map(ps=>ps.find(p=>p.source_priority==='primary-statement')||ps[0]));
 return candidates.sort((a,b)=>b[0].filed.localeCompare(a[0].filed))[0];
}
export function validateSourceReport(data,payload){
 const f=payload.financials,currency=payload.profile.currency,checks=[],coverage=[];
 const value=(table,key,year)=>f[table].find(r=>r.key===key)?.values[year];
 const years=f.columns.filter(c=>/^\d{4}$/.test(c));
 for(const year of years){
  const index=f.columns.indexOf(year),end=f.period_dates[index];if(!end)continue;
  const missing=[['income_statement','revenue'],['income_statement','net_income'],['income_statement','eps_diluted'],['balance_sheet','total_assets'],['balance_sheet','shareholders_equity'],['cash_flow','cash_from_operations']].filter(([table,key])=>value(table,key,year)===undefined).map(([,key])=>key);coverage.push({year,missing_core_fields:missing});
  const [assets,liabilities,equity]=coherentBalance(data,currency,end)||[];
  if(!assets)coverage.at(-1).balance_identity='not_assessed_no_coherent_reported_inputs';
  if(assets&&liabilities&&equity){coverage.at(-1).balance_identity='assessed';const difference=assets.val-liabilities.val-equity.val,tolerance=Math.max(3e6,Math.abs(assets.val)*1e-5);checks.push({check:'Same-filing reported assets = reported liabilities + reported total equity',year,status:Math.abs(difference)<=tolerance?'pass':'review',difference,currency,source_accessions:[...new Set([assets.accn,liabilities.accn,equity.accn])]});}
  const totalLiabilities=value('balance_sheet','total_liabilities',year),currentLiabilities=value('balance_sheet','total_current_liabilities',year),noncurrentLiabilities=value('balance_sheet','total_noncurrent_liabilities',year);
  if([totalLiabilities,currentLiabilities,noncurrentLiabilities].every(Number.isFinite)){
   const difference=totalLiabilities-currentLiabilities-noncurrentLiabilities;
   // A displayed subtotal inconsistency is useful evidence of an accounting
   // scope problem, not a reason to overwrite an unidentified source amount.
   if(Math.abs(difference)>Math.max(3,Math.abs(totalLiabilities)*1e-5))checks.push({check:'Displayed current + noncurrent liabilities = displayed total liabilities (scope consistency)',year,status:'review',difference:difference*1e6,currency,kind:'display_consistency',note:'Different source scopes or vintages may be involved; this check does not identify which individual input is wrong.'});
  }
  for(const [key,incomeNames]of [['eps_basic',['ClassAllocatedNetIncomeBasic','ClassAllocatedNetIncome']],['eps_diluted',['ClassAllocatedNetIncomeDiluted']]]){
   const eps=value('income_statement',key,year),shares=value('income_statement',key==='eps_basic'?'shares_basic':'shares_diluted',year),income=latest(data,incomeNames,currency,end,true);
   if(eps!==undefined&&shares>0&&income){const implied=income.val/(shares*1e6),difference=eps-implied;checks.push({check:'Listed-class '+key+' agrees with allocated income / matching weighted shares',year,status:Math.abs(difference)<=.011?'pass':'review',reported:eps,implied,difference,source_accessions:[income.accn]});}
  }
 }
 return {scope:'Mapped annual core-field coverage and independently reported accounting identities; not full filing completeness',status:!years.length?'unavailable':checks.some(c=>c.status==='review')?'review':coverage.some(c=>c.missing_core_fields.length)?'partial':'checks_pass',checks,coverage,notes:['Balance identities use matching filing accessions and dates; cross-filing values are not mixed to manufacture a check.','Cash-flow Other residuals are arithmetic constructions, so their reconciliation is not independent evidence of accuracy.','Coverage of CompanyFacts is not coverage of every custom, dimensional or untagged filing disclosure.']};
}
