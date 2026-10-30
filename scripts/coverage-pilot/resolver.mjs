// Bounded pilot rules. No issuer names, ticker exceptions, numeric company
// values, fuzzy matching or AI mapping. Never overwrite a populated cell.
import {concepts} from '../../assets/report/concept-registry.mjs';
const additions={
 treasury_stock:['TreasuryStockCommonValue'],
 other_current_assets:['PrepaidExpenseAndOtherAssetsCurrent'],
 pension_liabilities:['DefinedBenefitPensionPlanLiabilitiesNoncurrent','PensionAndOtherPostretirementAndPostemploymentBenefitPlansLiabilitiesNoncurrent'],
 common_stock:['CommonStockValueOutstanding'],
 paid_in_capital:['AdditionalPaidInCapitalCommonStock'],
 minority_interest_income:['NetIncomeLossAttributableToNoncontrollingInterest'],
};
const industryRules={
 bank:{interest_expense:['InterestExpenseOperating'],loan_loss_reserve:['FinancingReceivableAllowanceForCreditLossExcludingAccruedInterest','AllowanceForLoanAndLeaseLosses'],net_loans:['FinancingReceivableExcludingAccruedInterestAfterAllowanceForCreditLoss'],other_assets:['OtherAssets'],preferred_stock:['PreferredStockIncludingAdditionalPaidInCapitalNetOfDiscount']},
 insurance:{investment_income:['NetInvestmentIncome'],total_expenses:['BenefitsLossesAndExpenses'],other_assets:['OtherAssets'],other_liabilities:['OtherLiabilities'],equity_investments:['EquitySecuritiesFvNiCurrentAndNoncurrent'],loss_reserves:['LiabilityForClaimsAndClaimsAdjustmentExpense']}
};
const negative=new Set(['interest_expense','income_tax','accumulated_depreciation','treasury_stock','loan_loss_reserve','cf_dividends','minority_interest_income']);
const cfOnly=new Set(['cf_net_income','cf_dna','cf_stock_comp','cf_deferred_tax']);
const yearDuration=p=>p.start&&(Date.parse(p.end)-Date.parse(p.start))/86400000>=330&&(Date.parse(p.end)-Date.parse(p.start))/86400000<=380;
const noDims=p=>!p.typed&&!p.dimensions.length;
const clean=s=>String(s||'').toLowerCase().replace(/[^a-z]/g,'');
const standard=p=>p.namespace==='us-gaap'&&/^https?:\/\/(?:fasb\.org|xbrl\.us)\//.test(p.namespace_uri||'')||p.namespace==='ifrs-full'&&/^https?:\/\/xbrl\.ifrs\.org\//.test(p.namespace_uri||'');
const unique=points=>[...new Map(points.map(p=>[[p.qname,p.unit,p.start,p.end,p.value,JSON.stringify(p.dimensions)].join('|'),p])).values()];
export const pilotRuleVersion='pilot-v1.1-reviewed-sign';
export function resolvePilot(baseline,inventory,calculations=[],sourceFilings=[]){
 const output=structuredClone(baseline),f=output.financials,year=f.columns.filter(c=>/^\d{4}$/.test(c)).at(-1),end=f.period_dates[f.columns.indexOf(year)],currency=output.profile.currency,type=f.company_type||'general';
 if(String(Number(inventory.cik))!==String(Number(f.cik)))throw Error('Pilot filing issuer mismatch');
 if(inventory.filing.period!==end)throw Error('Pilot filing period mismatch');
 const points=inventory.facts.filter(p=>p.end===end&&(!p.start||yearDuration(p))&&p.filed<=inventory.filing.date);
 const ledger=[],recoveries=[],corrections=[],derived_updates=[],conflicts=[],sourceForms=new Map(sourceFilings.map(s=>[s.accession,s.form]));
 function select(candidates,table,key){
  let eligible=candidates.filter(p=>standard(p)&&!p.typed&&p.unit===(concepts[key]?.[1]==='per-share'?currency+'/shares':concepts[key]?.[1]==='shares'?'shares':currency)&&(table==='balance_sheet'?!p.start:yearDuration(p)));
  eligible=eligible.filter(p=>noDims(p)||(table==='income_statement'&&key==='interest_expense'&&p.name==='InterestExpenseNonoperating'&&p.statement===table&&p.label));
  if(cfOnly.has(key))eligible=eligible.filter(p=>p.statement==='cash_flow');
  if(eligible.some(p=>p.statement===table))eligible=eligible.filter(p=>p.statement===table);
  const values=[...new Set(eligible.map(p=>p.value))];
  return {eligible:unique(eligible),selected:values.length===1?eligible[0]:null,conflict:values.length>1};
 }
 function source(p,rule,scope='Consolidated entity-wide observation'){
  return {rule,concept:p.qname,source_value:p.derived_inputs?.[0]?.source_value??p.value,...(p.derived_inputs?{derived_inputs:p.derived_inputs}:{}),unit:p.unit,start:p.start,end:p.end,filed:p.filed,accession:p.accession,source_url:p.source_url,fact_id:p.fact_id,context_ref:p.context_ref,statement:p.statement,source_label:p.label,dimensions:p.dimensions,scope};
 }
 function fill(row,table,value,evidence){
  if(!Number.isFinite(value)||row.values[year]!=null)return false;
  row.values[year]=value;row.provenance??={};row.provenance[year]={...evidence,pilot:true};recoveries.push({table,key:row.key,label:row.label,value,evidence});return true;
 }
 for(const table of ['income_statement','balance_sheet','cash_flow'])for(const row of f[table]){
  if(row.key.startsWith('_'))continue;
  const key=row.key,aliases=[...(concepts[key]?.[0]||[]),...(additions[key]||[]),...(industryRules[type]?.[key]||[])],candidates=points.filter(p=>aliases.includes(p.name)),selection=select(candidates,table,key);
  let p=selection.selected;
  if(key==='net_income'){
   const owners=select(points.filter(p=>['NetIncomeLoss','ProfitLossAttributableToOwnersOfParent'].includes(p.name)&&p.statement==='income_statement'),table,key);
   if(owners.selected)p=owners.selected;
   else if(!owners.eligible.length){const total=select(points.filter(p=>p.name==='ProfitLoss'&&p.statement==='income_statement'),table,key).selected,nci=select(points.filter(p=>p.name==='NetIncomeLossAttributableToNoncontrollingInterest'&&p.statement==='income_statement'),table,'minority_interest_income').selected;if(total&&nci)p={...total,value:total.value-nci.value,derived_inputs:[source(total,'Consolidated profit'),source(nci,'Noncontrolling profit')]};}
  }

  let rule=(additions[key]||[]).includes(p?.name)||(industryRules[type]?.[key]||[]).includes(p?.name)?'Reviewed template/tag binding':'Direct filing fact under existing mapping';
  let transform=negative.has(key)?-1:1;
  if(!p&&key==='other_operating'){
   const s=select(points.filter(p=>p.name==='OtherOperatingIncomeExpenseNet'),table,key);if(s.selected){p=s.selected;transform=-1;rule='Credit-signed other operating income/expense → expense display';}
  }
  if(!p&&key==='cash'&&type==='general'){
   const s=select(points.filter(p=>p.name==='CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'&&p.statement==='balance_sheet'&&clean(p.label)==='cashandcashequivalents'),table,key);
   if(s.selected){p=s.selected;rule='Broader cash tag used on the issuer’s primary Cash and cash equivalents line; statement-caption-qualified';}
  }
  if(p){
   const scope=noDims(p)?'Consolidated entity-wide observation':'Primary income-statement line with its disclosed business scope; not a segment-footnote substitution';
   const amount=p.value*transform/(concepts[key]?.[1]==='per-share'?1:1e6),evidence=source(p,rule,scope);
   if(!fill(row,table,amount,evidence)&&Math.abs(row.values[year]-amount)>Math.max(1e-6,Math.abs(amount)*1e-8)){
    const prior=baseline.financials[table].find(r=>r.key===key)?.provenance?.[year],form=sourceForms.get(prior?.accn),nonStatement=form&&!/^(10-K|10-Q|20-F|40-F)(\/A)?$/.test(form),wrongBankComponent=type==='bank'&&key==='interest_income'&&p.name==='InterestIncomeOperating'&&p.statement===table&&prior?.concept==='InvestmentIncomeInterest';
    if(p.statement===table&&(nonStatement||wrongBankComponent)){
     const before=row.values[year];row.values[year]=amount;row.provenance[year]={...evidence,pilot:true,previous_value:before,previous_provenance:prior,selection_reason:nonStatement?'Primary financial statement preferred to '+form+' disclosure':'Bank primary interest-income total preferred to investment-interest component'};
     corrections.push({table,key,label:row.label,before,after:amount,evidence:row.provenance[year]});
    }else conflicts.push({table,key,existing:row.values[year],filing:amount,evidence,action:'Existing value preserved; review required'});
   }
  }
  ledger.push({table,key,label:row.label,before:baseline.financials[table].find(r=>r.key===key)?.values[year]??null,after:row.values[year]??null,status:row.values[year]!=null?'available':selection.conflict?'unresolved':candidates.length?'ineligible':!aliases.length?'unmapped':'unavailable',reason:row.values[year]!=null?'Value available with provenance':selection.conflict?'Eligible source observations disagree; no value selected':candidates.length?'Matching tags exist but their period, units, dimensions or statement scope are ineligible':!aliases.length?'Template key has no configured resolver':'No eligible mapped fact found in loaded sources; this does not establish that the filing did not disclose it',evidence:row.provenance?.[year]||null,candidates:unique(candidates).slice(0,5).map(p=>source(p,'Candidate only; not used'))});
 }
 const row=(table,key)=>f[table].find(r=>r.key===key),get=(table,key)=>row(table,key)?.values[year];
 const factual=(name,table)=>select(points.filter(p=>p.name===name),table,name).selected;
 function derived(table,key,value,rule,inputs){const r=row(table,key);if(r&&fill(r,table,value,{rule,inputs,source_url:inventory.filing.url,accession:inventory.filing.accession,end})){const l=ledger.find(l=>l.table===table&&l.key===key);if(l)Object.assign(l,{after:value,status:'available',reason:'Derived from verified matching-period inputs',evidence:r.provenance[year]});}}
 // These are template identities, not assumptions that omitted inputs are zero.
 if(type==='general'&&Number.isFinite(get('income_statement','gross_profit'))&&Number.isFinite(get('income_statement','operating_income')))
  derived('income_statement','total_operating_expenses',get('income_statement','gross_profit')-get('income_statement','operating_income'),'Gross profit − operating income (expenses below gross profit)',[row('income_statement','gross_profit').provenance?.[year],row('income_statement','operating_income').provenance?.[year]]);
 if(type==='bank'&&Number.isFinite(get('balance_sheet','net_loans'))&&Number.isFinite(get('balance_sheet','loan_loss_reserve')))
  derived('balance_sheet','gross_loans',get('balance_sheet','net_loans')+Math.abs(get('balance_sheet','loan_loss_reserve')),'Net loans + disclosed loan-loss allowance',[row('balance_sheet','net_loans').provenance?.[year],row('balance_sheet','loan_loss_reserve').provenance?.[year]]);
 // Calculation-linkbase structural equivalence: identify a reported subtotal
 // only when all children are known, same-context and reconcile to the parent.
 if(type==='bank')for(const calc of calculations){
  const children=calc.children,afs=children.find(c=>['AvailableForSaleSecuritiesDebtSecurities','DebtSecuritiesAvailableForSaleExcludingAccruedInterest'].includes(c.concept.split(':')[1])),htm=children.find(c=>['HeldToMaturitySecuritiesNetOfUnamortizedPremiumDiscountAndAllowanceForCreditLoss','DebtSecuritiesHeldToMaturityExcludingAccruedInterestAfterAllowanceForCreditLoss'].includes(c.concept.split(':')[1]));
  if(children.length!==2||!afs||!htm||children.some(c=>c.weight!==1))continue;
  const a=factual(afs.concept.split(':')[1],'balance_sheet'),b=factual(htm.concept.split(':')[1],'balance_sheet'),parents=unique(points.filter(p=>p.qname===calc.parent&&p.statement==='balance_sheet'&&noDims(p)&&!p.start&&p.unit===currency));
  if(a&&b&&parents.length===1&&Math.abs(a.value+b.value-parents[0].value)<=1e6){derived('balance_sheet','securities_investments',parents[0].value/1e6,'Calculation-linkbase subtotal of available-for-sale + held-to-maturity debt securities; no issuer-specific tag rule',[source(a,'AFS input'),source(b,'HTM input'),source(parents[0],'Reported subtotal verified by calculation linkbase'),{calculation_role:calc.role}]);}
 }
 // Refresh residual buckets after recovering components. These are arithmetic
 // constructions and are explicitly not counted as recovered disclosures.
 function refreshResidual(table,key,total,keys){
  const target=row(table,key),anchor=get(table,total);if(!target||!Number.isFinite(anchor))return;
  const inputs=keys.filter(k=>Number.isFinite(get(table,k))),value=anchor-inputs.reduce((n,k)=>n+get(table,k),0),before=target.values[year];
  if(!Number.isFinite(value)||value===before)return;
  target.values[year]=value;target.provenance[year]={pilot:true,rule:'Reported '+total+' minus identified displayed components; residual, not an independently reported disclosure',inputs:[total,...inputs],source_url:inventory.filing.url};
  derived_updates.push({table,key,before,after:value});const l=ledger.find(l=>l.table===table&&l.key===key);if(l)Object.assign(l,{after:value,status:'available',reason:'Residual refreshed after recovering components',evidence:target.provenance[year]});
 }
 refreshResidual('balance_sheet','other_equity','shareholders_equity',['common_stock','paid_in_capital','retained_earnings','aoci','preferred_stock','treasury_stock']);
 refreshResidual('cash_flow','cf_other_operating','cash_from_operations',['cf_net_income','cf_dna','cf_working_capital','cf_deferred_tax','cf_stock_comp']);
 // Do not publish a stale continuing-income estimate after correcting net income.
 if(corrections.some(c=>c.key==='net_income')){
  const r=row('income_statement','net_income_continuing');if(r?.provenance?.[year]?.calculation){const before=r.values[year];delete r.values[year];const l=ledger.find(l=>l.key==='net_income_continuing');if(l)Object.assign(l,{after:null,status:'unresolved',reason:'Net income changed; continuing/discontinued allocation requires recalculation'});derived_updates.push({table:'income_statement',key:'net_income_continuing',before,after:null});}
 }
 for(const c of conflicts){const l=ledger.find(l=>l.table===c.table&&l.key===c.key);if(l)Object.assign(l,{status:'unresolved',reason:'Existing and primary-filing values disagree; baseline preserved for review',conflict:c});}
 output.financials.pilot_scope='Latest annual statement cells only; historical and derived statistics have not been recomputed by this pilot.';
 const existingDerivations=new Set(['gross_profit','short_term_debt','long_term_debt','total_noncurrent_liabilities','total_liabilities_equity','cf_capex','cf_acquisitions','cf_investments','cf_net_stock','cf_net_preferred','cf_debt_net','cf_working_capital','free_cash_flow','net_income_continuing','other_equity']);
 for(const l of ledger)if(l.status==='unmapped'&&existingDerivations.has(l.key)){l.status='unavailable';l.reason='A derivation is configured, but its required inputs are not available or have not been mapped from this filing';}
 const checks=[];const v=(t,k)=>get(t,k);
 const assets=factual('Assets','balance_sheet'),liabs=factual('Liabilities','balance_sheet'),equity=factual('StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest','balance_sheet')||factual('StockholdersEquity','balance_sheet');
 if(assets&&liabs&&equity)checks.push({check:'Independently reported assets = liabilities + reported equity',difference:(assets.value-liabs.value-equity.value)/1e6,status:Math.abs(assets.value-liabs.value-equity.value)<=3e6?'pass':'review'});
 if(type==='general'&&['gross_profit','operating_income','sga','rd','other_operating'].every(k=>Number.isFinite(v('income_statement',k)))){const difference=v('income_statement','gross_profit')-v('income_statement','operating_income')-v('income_statement','sga')-v('income_statement','rd')-v('income_statement','other_operating');checks.push({check:'Template operating-expense components agree with reported gross-profit-to-operating-income difference',difference,status:Math.abs(difference)<=3?'pass':'review',meaning:'A review may indicate an omitted template category or overlapping source components; not necessarily a bad individual fact'});}
 const audit={schema_version:1,rule_version:pilotRuleVersion,ticker:inventory.ticker,cik:inventory.cik,year,end,template:type,scope:'Latest annual values in existing visible statement templates. Populated-cell counts are not completeness estimates.',visible_cells:ledger.length,before_populated:ledger.filter(l=>l.before!==null).length,after_populated:ledger.filter(l=>l.after!==null).length,recoveries,corrections,derived_updates,conflicts,checks,ledger,inventory:{facts:inventory.facts.length,selected_statements:inventory.selected_statements,parse_ms:inventory.parse_ms,exclusions:inventory.exclusions},unsupported_template_keys:ledger.filter(l=>l.status==='unmapped').map(l=>l.key)};
 return {payload:output,audit};
}
