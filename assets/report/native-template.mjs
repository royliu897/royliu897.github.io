// Source-specific IFRS rows. Canonical equivalence is explicit; country labels
// never turn a combined total, net finance cost or reserve into a US component.
const row=(key,label,section='',isSubtotal=false)=>({key,label,section,isSubtotal});
const binding=(key,names,type='duration',namespace='ifrs-full')=>({key,names,type,namespace});
const common=[
 binding('other_current_liabilities',['OtherCurrentLiabilities'],'instant'),
 binding('current_deferred_revenue',['CurrentContractLiabilities'],'instant'),
 binding('noncurrent_deferred_revenue',['NoncurrentContractLiabilities'],'instant'),
 binding('current_capital_leases',['CurrentLeaseLiabilities'],'instant'),
 binding('noncurrent_capital_leases',['NoncurrentLeaseLiabilities'],'instant'),
 binding('cf_stock_comp',['AdjustmentsForSharebasedPayments']),
 binding('native_selling_expense',['SellingExpense']),
 binding('native_administrative_expense',['AdministrativeExpense']),
 binding('native_credit_impairment',['ImpairmentLossImpairmentGainAndReversalOfImpairmentLossDeterminedInAccordanceWithIFRS9']),
 binding('native_finance_income',['FinanceIncome']),
 binding('native_finance_costs',['FinanceCosts']),
 binding('native_other_income',['OtherRevenue']),
 binding('native_other_gains_losses',['OtherGainsLosses']),
 binding('native_equity_method_profit',['ShareOfProfitLossOfAssociatesAndJointVenturesAccountedForUsingEquityMethod']),
 binding('native_profit_continuing',['ProfitLossFromContinuingOperations']),
 binding('native_consolidated_profit',['ProfitLoss']),
 binding('native_current_financial_assets_fvpl',['CurrentFinancialAssetsAtFairValueThroughProfitOrLoss'],'instant'),
 binding('native_current_financial_assets_fvoci',['CurrentFinancialAssetsAtFairValueThroughOtherComprehensiveIncome'],'instant'),
 binding('native_current_financial_assets_amortised',['CurrentFinancialAssetsAtAmortisedCost'],'instant'),
 binding('native_noncurrent_financial_assets_fvpl',['NoncurrentFinancialAssetsAtFairValueThroughProfitOrLoss'],'instant'),
 binding('native_noncurrent_financial_assets_fvoci',['NoncurrentFinancialAssetsAtFairValueThroughOtherComprehensiveIncome'],'instant'),
 binding('native_noncurrent_financial_assets_amortised',['NoncurrentFinancialAssetsAtAmortisedCost'],'instant'),
 binding('native_short_term_deposits',['ShorttermDepositsNotClassifiedAsCashEquivalents'],'instant'),
 binding('native_other_current_receivables',['OtherCurrentReceivables'],'instant'),
 binding('native_current_tax_assets',['CurrentTaxAssets'],'instant'),
 binding('native_current_prepayments',['CurrentPrepayments'],'instant'),
 binding('native_equity_method_investments',['InvestmentAccountedForUsingEquityMethod'],'instant'),
 binding('native_right_of_use_assets',['RightofuseAssets'],'instant'),
 binding('native_investment_property',['InvestmentProperty'],'instant'),
 binding('native_intangibles_goodwill',['IntangibleAssetsAndGoodwill'],'instant'),
 binding('native_deferred_tax_assets',['DeferredTaxAssets'],'instant'),
 binding('native_noncurrent_assets',['NoncurrentAssets'],'instant'),
 binding('native_other_current_payables',['OtherCurrentPayables'],'instant'),
 binding('native_related_party_payables',['TradeAndOtherCurrentPayablesToRelatedParties'],'instant'),
 binding('native_deferred_tax_liabilities',['DeferredTaxLiabilities'],'instant'),
 binding('native_issued_capital',['IssuedCapital'],'instant'),
 binding('native_capital_reserve',['CapitalReserve'],'instant'),
 binding('native_other_equity',['OtherEquityInterest'],'instant'),
 binding('native_equity_total',['Equity'],'instant'),
 binding('native_cf_total_adjustments',['AdjustmentsForReconcileProfitLoss']),
 binding('native_cash_generated_operations',['CashFlowsFromUsedInOperations']),
 binding('native_cf_interest_received',['InterestReceivedClassifiedAsOperatingActivities']),
 binding('native_cf_interest_paid',['InterestPaidClassifiedAsOperatingActivities']),
 binding('native_cf_dividends_received',['DividendsReceivedClassifiedAsOperatingActivities']),
 binding('native_cf_tax_paid',['IncomeTaxesPaidRefundClassifiedAsOperatingActivities']),
 binding('native_cf_intangibles_purchases',['PurchaseOfIntangibleAssetsClassifiedAsInvestingActivities']),
 binding('native_cf_intangibles_sales',['ProceedsFromSalesOfIntangibleAssetsClassifiedAsInvestingActivities']),
 binding('native_cf_interest_paid_financing',['InterestPaidClassifiedAsFinancingActivities']),
 binding('native_finance_lease_noncurrent',['NoncurrentFinanceLeaseLiabilities'],'instant'),
 binding('native_cf_other_investing',['OtherInflowsOutflowsOfCashClassifiedAsInvestingActivities']),
 binding('native_cf_other_financing',['OtherInflowsOutflowsOfCashClassifiedAsFinancingActivities']),
 binding('native_cf_cash_change',['IncreaseDecreaseInCashAndCashEquivalents']),
];
const taiwan=[
 binding('current_capital_leases',['TW_tifrs_bsci_ci_CurrentLeaseLiabilities'],'instant','tifrs-bsci-ci'),
 binding('noncurrent_capital_leases',['TW_tifrs_bsci_ci_NoncurrentLeaseLiabilities'],'instant','tifrs-bsci-ci'),
 binding('native_related_party_receivables',['TW_tifrs_bsci_ci_AccountsReceivableDuefromRelatedPartiesNet'],'instant','tifrs-bsci-ci'),
 binding('native_nonoperating_total',['TW_tifrs_bsci_ci_NonoperatingIncomeAndExpenses'],'duration','tifrs-bsci-ci'),
 binding('native_cf_profit_before_tax',['TW_tifrs_SCF_ProfitLossBeforeTax'],'duration','tifrs-SCF'),
 binding('native_cf_total_adjustments',['TW_tifrs_SCF_AdjustmentsToReconcileProfitLoss'],'duration','tifrs-SCF'),
];
const korea=[
 binding('native_capital_surplus',['Dart_CapitalSurplus'],'instant','dart'),
 binding('native_other_equity_elements',['Dart_ElementsOfOtherStockholdersEquity'],'instant','dart'),
 binding('native_cf_assets_liabilities_changes',['Dart_AdjustmentsForAssetsLiabilitiesOfOperatingActivities'],'duration','dart'),
];
export function nativeTemplateFor(data,record={}){
 const provider=data?.provider||record.provider||'',exchange=record.exchange||'';
 if(provider==='Taiwan MOPS'||exchange==='TWSE')return {id:'ifrs-taiwan-v1',country:'TW',label:'Taiwan IFRS'};
 if(provider==='OpenDART'||exchange==='KRX')return {id:'ifrs-korea-v1',country:'KR',label:'Korean IFRS'};
 const values=Object.values(data?.facts||{});
 if(values.some(f=>f.namespace==='ifrs-full')&&!values.some(f=>f.namespace==='us-gaap'))return {id:'ifrs-v1',country:null,label:'IFRS'};
 return null;
}
function bindings(data,record){const template=nativeTemplateFor(data,record);return template?[...common,...(template.country==='TW'?taiwan:template.country==='KR'?korea:[])]:[];}
export function nativeConcepts(base,data,record={}){
 if(!nativeTemplateFor(data,record))return base;
 const result=Object.fromEntries(Object.entries(base).map(([k,[names,type]])=>[k,[[...names],...(type?[type]:[])]]));
 for(const b of bindings(data,record)){
  const current=result[b.key];if(current&&((current[1]||'duration')!==b.type))throw Error('Native mapping type conflict: '+b.key);
  result[b.key]=[[...new Set([...(current?.[0]||[]),...b.names])],...(b.type==='duration'?[]:[b.type])];
 }
 return result;
}
export function nativeFactEligible(name,fact,data,record={}){
 const rules=bindings(data,record).filter(b=>b.names.includes(name));
 return !rules.length||rules.some(b=>fact?.namespace===b.namespace);
}
export function prepareNativeFacts(data,record={}){
 if(!nativeTemplateFor(data,record))return data;
 let facts=data.facts;
 for(const b of bindings(data,record))for(const name of b.names){
  const fact=data.facts?.[name];
  if(!fact||fact.namespace!==b.namespace||b.namespace==='ifrs-full'||fact.mapping_approved)continue;
  if(facts===data.facts)facts={...facts};facts[name]={...fact,mapping_approved:true,mapping_origin:'versioned-native-template-v1'};
 }
 return facts===data.facts?data:{...data,facts};
}
export function approvedNativeConcept(namespace,storageName){
 return [...taiwan,...korea].some(b=>b.namespace===namespace&&b.names.includes(storageName));
}
const income=[
 row('revenue','Revenue','',true),row('cogs','Cost of Sales'),row('gross_profit','Gross Profit','',true),
 row('native_selling_expense','Selling Expenses','Operating Expenses'),row('native_administrative_expense','Administrative Expenses','Operating Expenses'),row('sga','Selling & Administrative Expenses (Combined)','Operating Expenses',true),row('rd','Research & Development','Operating Expenses'),row('native_credit_impairment','Credit Impairment Losses / Reversals','Operating Expenses'),row('other_operating','Other Operating Expenses','Operating Expenses'),row('total_operating_expenses','Total Operating Expenses','Operating Expenses'),row('operating_income','Operating Profit','',true),
 row('interest_income','Interest Income','Non-operating'),row('native_finance_income','Finance Income','Non-operating'),row('native_other_income','Other Income','Non-operating'),row('native_other_gains_losses','Other Gains / Losses','Non-operating'),row('native_finance_costs','Finance Costs','Non-operating'),row('native_equity_method_profit','Share of Profit / Loss of Associates & Joint Ventures','Non-operating'),row('native_nonoperating_total','Total Non-operating Income / Expenses','Non-operating',true),
 row('pretax_income','Profit Before Tax','',true),row('income_tax','Income Tax'),row('native_profit_continuing','Profit from Continuing Operations'),row('net_income_discontinued','Profit from Discontinued Operations'),row('native_consolidated_profit','Consolidated Profit','',true),row('minority_interest_income','Non-controlling Share of Profit'),row('net_income','Profit Attributable to Owners','',true),row('eps_basic','EPS (Basic)'),row('eps_diluted','EPS (Diluted)'),row('shares_basic','Shares (Basic)'),row('shares_diluted','Shares (Diluted)'),
];
const balance=[
 row('cash','Cash & Equivalents','Current Assets'),row('native_current_financial_assets_fvpl','Financial Assets at FVPL (Current)','Current Assets'),row('native_current_financial_assets_fvoci','Financial Assets at FVOCI (Current)','Current Assets'),row('native_current_financial_assets_amortised','Financial Assets at Amortised Cost (Current)','Current Assets'),row('native_short_term_deposits','Short-term Deposits','Current Assets'),row('accounts_receivable','Trade Receivables','Current Assets'),row('native_related_party_receivables','Related-party Trade Receivables','Current Assets'),row('native_other_current_receivables','Other Receivables','Current Assets'),row('native_current_tax_assets','Current Tax Assets','Current Assets'),row('native_current_prepayments','Prepayments','Current Assets'),row('inventory','Inventories','Current Assets'),row('other_current_assets','Other Current Assets','Current Assets'),row('total_current_assets','Total Current Assets','',true),
 row('native_noncurrent_financial_assets_fvpl','Financial Assets at FVPL (Noncurrent)','Noncurrent Assets'),row('native_noncurrent_financial_assets_fvoci','Financial Assets at FVOCI (Noncurrent)','Noncurrent Assets'),row('native_noncurrent_financial_assets_amortised','Financial Assets at Amortised Cost (Noncurrent)','Noncurrent Assets'),row('native_equity_method_investments','Equity-method Investments','Noncurrent Assets'),row('ppe','Property, Plant & Equipment','Noncurrent Assets'),row('native_right_of_use_assets','Right-of-use Assets','Noncurrent Assets'),row('native_investment_property','Investment Property','Noncurrent Assets'),row('native_intangibles_goodwill','Intangibles & Goodwill (Combined)','Noncurrent Assets'),row('goodwill','Goodwill (Separately Reported)','Noncurrent Assets'),row('intangible_assets','Intangibles Excluding Goodwill','Noncurrent Assets'),row('native_deferred_tax_assets','Deferred Tax Assets','Noncurrent Assets'),row('other_assets','Other Noncurrent Assets','Noncurrent Assets'),row('native_noncurrent_assets','Total Noncurrent Assets','',true),row('total_assets','Total Assets','',true),
 row('short_term_debt','Current Borrowings','Current Liabilities'),row('current_deferred_revenue','Contract Liabilities (Current)','Current Liabilities'),row('accounts_payable','Trade Payables','Current Liabilities'),row('native_related_party_payables','Related-party Trade Payables','Current Liabilities'),row('native_other_current_payables','Other Payables','Current Liabilities'),row('tax_payable','Current Tax Liabilities','Current Liabilities'),row('current_capital_leases','Lease Liabilities (Current)','Current Liabilities'),row('other_current_liabilities','Other Current Liabilities','Current Liabilities'),row('total_current_liabilities','Total Current Liabilities','',true),
 row('long_term_debt','Noncurrent Borrowings & Bonds','Noncurrent Liabilities'),row('noncurrent_deferred_revenue','Contract Liabilities (Noncurrent)','Noncurrent Liabilities'),row('native_deferred_tax_liabilities','Deferred Tax Liabilities','Noncurrent Liabilities'),row('noncurrent_capital_leases','Lease Liabilities (Noncurrent)','Noncurrent Liabilities'),row('native_finance_lease_noncurrent','Finance Lease Liabilities (Noncurrent)','Noncurrent Liabilities'),row('pension_liabilities','Defined-benefit Liabilities (Noncurrent)','Noncurrent Liabilities'),row('other_lt_liabilities','Other Noncurrent Liabilities','Noncurrent Liabilities'),row('total_noncurrent_liabilities','Total Noncurrent Liabilities','',true),row('total_liabilities','Total Liabilities','',true),
 row('total_debt','Total Borrowings & Bonds','',true),
 row('native_issued_capital','Issued Share Capital','Equity'),row('native_capital_reserve','Capital Reserves','Equity'),row('native_capital_surplus','Capital Surplus','Equity'),row('retained_earnings','Retained Earnings','Equity'),row('native_other_equity','Other Equity Interests','Equity'),row('native_other_equity_elements','Other Equity Components','Equity'),row('treasury_stock','Treasury Shares','Equity'),row('shareholders_equity','Equity Attributable to Owners','',true),row('minority_interest','Non-controlling Interests','Equity'),row('native_equity_total','Total Equity','',true),row('total_liabilities_equity','Total Liabilities & Equity','',true),
];
const cashflow=[
 row('native_cf_profit_before_tax','Profit Before Tax','Operating Cash Flow'),row('native_cf_total_adjustments','Adjustments to Reconcile Profit (Total)','Operating Cash Flow',true),row('cf_dna','Depreciation & Amortisation','Operating Cash Flow'),row('cf_stock_comp','Share-based Payment Adjustments','Operating Cash Flow'),row('cf_working_capital','Changes in Operating Assets & Liabilities','Operating Cash Flow'),row('native_cf_assets_liabilities_changes','Changes in Operating Assets & Liabilities','Operating Cash Flow'),row('native_cash_generated_operations','Cash Generated from Operations','Operating Cash Flow',true),row('native_cf_interest_received','Interest Received (Operating)','Operating Cash Flow'),row('native_cf_interest_paid','Interest Paid (Operating)','Operating Cash Flow'),row('native_cf_dividends_received','Dividends Received (Operating)','Operating Cash Flow'),row('native_cf_tax_paid','Income Taxes Paid / Refunded','Operating Cash Flow'),row('cash_from_operations','Net Cash from Operating Activities','',true),
 row('capital_expenditures','Capital Expenditures','Investing Cash Flow'),row('cf_capex','Property, Plant & Equipment (Net)','Investing Cash Flow'),row('native_cf_intangibles_purchases','Intangible Assets Purchased','Investing Cash Flow'),row('native_cf_intangibles_sales','Intangible Asset Sale Proceeds','Investing Cash Flow'),row('cf_acquisitions','Business Acquisitions / Disposals (Net)','Investing Cash Flow'),row('cf_investments','Investments (Net)','Investing Cash Flow'),row('native_cf_other_investing','Other Investing Cash Flows (Reported)','Investing Cash Flow'),row('cash_from_investing','Net Cash from Investing Activities','',true),
 row('cf_net_stock','Share Issuance / Repurchases (Net)','Financing Cash Flow'),row('cf_debt_net','Borrowings / Repayments (Net)','Financing Cash Flow'),row('cf_dividends','Dividends Paid','Financing Cash Flow'),row('native_cf_interest_paid_financing','Interest Paid (Financing)','Financing Cash Flow'),row('native_cf_other_financing','Other Financing Cash Flows (Reported)','Financing Cash Flow'),row('cash_from_financing','Net Cash from Financing Activities','',true),row('cf_forex','Exchange-rate Effect on Cash'),row('native_cf_cash_change','Net Change in Cash & Equivalents'),row('free_cash_flow','Free Cash Flow','',true),
];
export function nativeRows(baseRows,table,data,record={}){
 const template=nativeTemplateFor(data,record);if(!template)return baseRows;
 // Industry templates remain separate until a financial-sector native layout
 // is reviewed. Never apply an industrial company's rows to a bank/insurer.
 if(/commercial banks|savings institutions|national.*banks|state.*banks|insurance/i.test(record.industry||'')&&!/agents|brokers/i.test(record.industry||''))return baseRows;
 const rows=table==='income_statement'?income:table==='balance_sheet'?balance:table==='cash_flow'?cashflow:null;
 if(!rows)return baseRows;
 return rows.filter(r=>template.country==='TW'?!['native_capital_surplus','native_other_equity_elements','native_cf_assets_liabilities_changes'].includes(r.key):template.country==='KR'?!['native_capital_reserve','native_other_equity','native_cf_profit_before_tax','cf_working_capital','native_nonoperating_total','native_related_party_receivables'].includes(r.key):!['native_capital_surplus','native_other_equity_elements','native_cf_assets_liabilities_changes','native_cf_profit_before_tax','native_nonoperating_total','native_related_party_receivables'].includes(r.key)).map(r=>({...r,...(/^eps_/.test(r.key)?{is_per_share:true}:{}),...(/^shares_/.test(r.key)?{is_shares:true}:{})}));
}
export function nativeDisplaySigns(data,record={}){
 const template=nativeTemplateFor(data,record);if(!template)return {};
 const outflow=template.country==='TW'?1:-1;
 return {native_finance_costs:-1,native_cf_interest_paid:outflow,native_cf_tax_paid:outflow,native_cf_intangibles_purchases:outflow,native_cf_interest_paid_financing:outflow};
}
export const nativeTemplateVersion='2026-10-29.1';

export function nativeDefinition(key){
 key=String(key||'').replace(/^native:/,'');if(!key.startsWith('native_'))return null;
 const tables=[['Income Statement',income],['Balance Sheet',balance],['Cash Flow',cashflow]],entry=tables.flatMap(([group,rows])=>rows.map(r=>({group,...r}))).find(r=>r.key===key);if(!entry)return null;
 const specific={native_finance_costs:'Reported finance costs, including net finance costs when disclosed that way; displayed as a deduction.',native_intangibles_goodwill:'Reported combined intangible assets and goodwill.',native_cf_assets_liabilities_changes:'Reported cash effect of changes in operating assets and liabilities.',native_equity_total:'Reported total equity, including non-controlling interests.',native_consolidated_profit:'Reported consolidated profit, including profit attributable to non-controlling interests.'};
 return {id:'native:'+key,title:entry.label,group:entry.group,formula:specific[key]||'Reported '+entry.label.charAt(0).toLowerCase()+entry.label.slice(1)+'.',source_tags:[...new Set([...common,...taiwan,...korea].filter(b=>b.key===key).flatMap(b=>b.names))]};
}
