// Explicit total/component relationships, applied within a single filing and
// reporting context. This is accounting scope, not arbitrary alias ordering.
export function preferConceptTotals(points,key){
 const hierarchies={accounts_receivable:['ReceivablesNetCurrent',['AccountsReceivableNetCurrent','AccountsReceivableNet','AccountsNotesAndLoansReceivableNetCurrent']],cf_dna:['DepreciationDepletionAndAmortization',['DepreciationAndAmortization','DepreciationDepletionAndAmortizationPropertyPlantAndEquipment']],_cf_short_debt_net:['ProceedsFromRepaymentsOfShortTermDebt',['ProceedsFromRepaymentsOfCommercialPaper']],intangible_assets:['IntangibleAssetsNetExcludingGoodwill',['FiniteLivedIntangibleAssetsNet']],_cf_stock_issuance:['ProceedsFromIssuanceOfCommonStock',['ProceedsFromStockOptionsExercised']],_cf_inv_sales:['ProceedsFromSaleAndMaturityOfAvailableForSaleSecurities',['ProceedsFromSaleOfAvailableForSaleSecuritiesDebt']],cf_dividends:['PaymentsOfDividends',['PaymentsOfDividendsCommonStock']]};
 const rule=hierarchies[key];return rule&&points.some(p=>(p.concept||p.name)===rule[0])?points.filter(p=>!rule[1].includes(p.concept||p.name)):points;
}
const financialForm=form=>/^(10-K|10-Q|20-F|40-F)(\/A)?$/.test(form||'')||/^(DART|MOPS)-(ANNUAL|INTERIM)$/.test(form||'');
const knownOtherForm=form=>!!form&&!financialForm(form)&&!['S-1','S-1/A','F-1','F-1/A','424B4'].includes(form);
const parentIncome=new Set(['NetIncomeLoss','ProfitLossAttributableToOwnersOfParent']);
const bankInterest=new Set(['InterestIncomeOperating','InterestAndDividendIncomeOperating']);
export function companyTemplate(record){const industry=record.industry||'';return /commercial banks|savings institutions|national.*banks|state.*banks/i.test(industry)?'bank':/insurance/i.test(industry)&&!/agents|brokers/i.test(industry)?'insurance':'';}
// Preserve every raw observation outside this selector. A date does not turn
// a proxy disclosure into a primary financial-statement observation.
export function selectStatementSources(points,key,template,excluded=[]){
 const groups=new Map();for(const p of points){const id=(p.start||'')+'|'+p.end;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(p);}
 const selected=[];
 for(const list of groups.values()){
  let eligible=list;
  if(list.some(p=>financialForm(p.form))){eligible=list.filter(p=>!knownOtherForm(p.form));for(const p of list)if(!eligible.includes(p))excluded.push({key,start:p.start,end:p.end,filed:p.filed,accession:p.accn,form:p.form,concept:p.concept,value:p.val,reason:'Primary financial-statement observations are available for this period; a nonstatement disclosure does not supersede them solely by date.'});}
  if(key==='net_income'&&eligible.some(p=>parentIncome.has(p.concept))){const removed=eligible.filter(p=>!parentIncome.has(p.concept));eligible=eligible.filter(p=>parentIncome.has(p.concept));for(const p of removed)excluded.push({key,start:p.start,end:p.end,concept:p.concept,value:p.val,filed:p.filed,accession:p.accn,reason:'Parent-attributable net income is available; consolidated profit is a different accounting scope.'});}
  if(key==='cf_net_income'&&eligible.some(p=>p.concept==='ProfitLoss'))eligible=eligible.filter(p=>p.concept==='ProfitLoss');
  if(template==='bank'&&key==='interest_income'){for(const p of eligible.filter(p=>!bankInterest.has(p.concept)))excluded.push({key,start:p.start,end:p.end,concept:p.concept,value:p.val,filed:p.filed,accession:p.accn,reason:'A component of bank interest income cannot replace the reported operating interest-income total.'});eligible=eligible.filter(p=>bankInterest.has(p.concept));}
  // Total intangibles take precedence over a finite-lived component. Other
  // unexplained alias disagreements in one accession are not resolved by order.
  const filings=new Map();for(const p of eligible){const id=[p.filed,p.accn].join('|');if(!filings.has(id))filings.set(id,[]);filings.get(id).push(p);}
  const resolved=[];let latestConflict='';
  for(const group of filings.values()){
   let candidates=group;if(['eps_basic','eps_diluted','shares_basic','shares_diluted','_eps_income_basic','_eps_income_diluted'].includes(key)&&candidates.some(p=>p.share_class))candidates=candidates.filter(p=>p.share_class);const primary=candidates.filter(p=>p.source_priority==='primary-statement');if(primary.length)candidates=primary;candidates=preferConceptTotals(candidates,key);
   // Registry aliases have existing explicit precedence. Primary-table facts
   // establish scope ahead of footnote components from the same filing.
   const conflict=candidates.some(p=>p.unresolved||p.excluded_from_mapping)||new Set(candidates.map(p=>p.val)).size>1;
   if(conflict){latestConflict=[latestConflict,...candidates.map(p=>p.filed||'')].sort().at(-1);for(const p of candidates)excluded.push({key,start:p.start,end:p.end,filed:p.filed,accession:p.accn,concept:p.concept,value:p.val,reason:'Conflicting same-filing source candidates; value withheld rather than chosen by alias or source order.'});}
   else resolved.push(...candidates);
  }
  // Do not conceal a newly unresolved filing by falling back to an older one.
  selected.push(...resolved.filter(p=>!latestConflict||(p.filed||'')>latestConflict));
 }
 const unique=new Map();for(const p of selected){const id=[p.start||'',p.end,p.filed,p.accn].join('|');if(!unique.has(id))unique.set(id,p);}
 return [...unique.values()];
}
export function templateConcepts(base,template){
 const result=Object.fromEntries(Object.entries(base).map(([key,[names,type]])=>[key,[[...names],...(type?[type]:[])]]));
 const add=(key,names,type)=>{if(!result[key])result[key]=[[],...(type?[type]:[])];result[key][0].push(...names.filter(n=>!result[key][0].includes(n)));};
 const common={accounts_receivable:['ReceivablesNetCurrent','AccountsNotesAndLoansReceivableNetCurrent'],cf_dna:['DepreciationAndAmortization'],_cf_productive_purchases:['PaymentsToAcquireProductiveAssets'],_cf_productive_sales:['ProceedsFromSaleOfProductiveAssets'],pretax_income:['IncomeLossIncludingPortionAttributableToNoncontrollingInterest'],other_current_assets:['PrepaidExpenseAndOtherAssetsCurrent'],pension_liabilities:['PensionAndOtherPostretirementDefinedBenefitPlansLiabilitiesNoncurrent','DefinedBenefitPensionPlanLiabilitiesNoncurrent','PensionAndOtherPostretirementAndPostemploymentBenefitPlansLiabilitiesNoncurrent'],treasury_stock:['TreasuryStockCommonValue'],paid_in_capital:['AdditionalPaidInCapitalCommonStock'],common_stock:['CommonStockValueOutstanding'],other_operating:['OtherOperatingIncomeExpenseNet'],minority_interest_income:['NetIncomeLossAttributableToNoncontrollingInterest','ProfitLossAttributableToNoncontrollingInterests']};
 for(const [key,names]of Object.entries(common))add(key,names,['accounts_receivable','other_current_assets','pension_liabilities','treasury_stock','paid_in_capital','common_stock'].includes(key)?'instant':undefined);
 if(template==='bank')for(const [key,names,type]of [['interest_expense',['InterestExpenseOperating']],['loan_loss_reserve',['FinancingReceivableAllowanceForCreditLossExcludingAccruedInterest','AllowanceForLoanAndLeaseLosses'],'instant'],['net_loans',['FinancingReceivableExcludingAccruedInterestAfterAllowanceForCreditLoss'],'instant'],['other_assets',['OtherAssets'],'instant'],['preferred_stock',['PreferredStockIncludingAdditionalPaidInCapitalNetOfDiscount'],'instant']])add(key,names,type);
 if(template==='insurance')for(const [key,names,type]of [['investment_income',['NetInvestmentIncome']],['total_expenses',['BenefitsLossesAndExpenses']],['other_assets',['OtherAssets'],'instant'],['other_liabilities',['OtherLiabilities'],'instant'],['equity_investments',['EquitySecuritiesFvNiCurrentAndNoncurrent'],'instant'],['loss_reserves',['LiabilityForClaimsAndClaimsAdjustmentExpense'],'instant']])add(key,names,type);
 return result;
}
