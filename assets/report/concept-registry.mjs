// Shared canonical concept mappings for CompanyFacts and direct filings.
export const concepts={
 revenue:[['RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','Revenue','SalesRevenueNet','RevenueFromContractWithCustomerIncludingAssessedTax']],
 cogs:[['CostOfRevenue','CostOfGoodsAndServicesSold','CostOfSales']],gross_profit:[['GrossProfit']],
 sga:[['SellingGeneralAndAdministrativeExpense']],rd:[['ResearchAndDevelopmentExpense']],other_operating:[['OtherOperatingCostsAndExpenses']],total_operating_expenses:[['OperatingExpenses']],
 operating_income:[['OperatingIncomeLoss','ProfitLossFromOperatingActivities']],
 interest_income:[['InvestmentIncomeInterest','InterestIncomeNonoperating','InterestIncomeOperating','InterestAndDividendIncomeOperating']],interest_expense:[['InterestExpenseNonoperating','InterestExpense','InterestAndDebtExpense']],other_nonoperating:[['OtherNonoperatingIncomeExpense','NonoperatingIncomeExpense']],
 pretax_income:[['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest','IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments','ProfitLossBeforeTax']],
 _pretax_domestic:[['IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic']],_pretax_foreign:[['IncomeLossFromContinuingOperationsBeforeIncomeTaxesForeign']],
 income_tax:[['IncomeTaxExpenseBenefit','IncomeTaxExpenseContinuingOperations']],
 _equity_including_nci:[['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest','Equity'],'instant'],
 _eps_income_basic:[['ClassAllocatedNetIncomeBasic','ClassAllocatedNetIncome']],_eps_income_diluted:[['ClassAllocatedNetIncomeDiluted']],
 net_income:[['NetIncomeLoss','ProfitLossAttributableToOwnersOfParent','ProfitLoss']],_nic_raw:[['IncomeLossFromContinuingOperations','IncomeLossFromContinuingOperationsIncludingPortionAttributableToNoncontrollingInterest']],
 net_income_discontinued:[['IncomeLossFromDiscontinuedOperationsNetOfTax']],preferred_dividends:[['PreferredStockDividendsAndOtherAdjustments']],
 eps_diluted:[['EarningsPerShareDiluted','DilutedEarningsLossPerShare'],'per-share'],eps_basic:[['EarningsPerShareBasic','BasicEarningsLossPerShare'],'per-share'],
 shares_diluted:[['WeightedAverageNumberOfDilutedSharesOutstanding','AdjustedWeightedAverageShares'],'shares'],shares_basic:[['WeightedAverageNumberOfSharesOutstandingBasic','WeightedAverageShares'],'shares'],
 cash:[['CashAndCashEquivalentsAtCarryingValue','CashAndCashEquivalents'],'instant'],short_term_investments:[['ShortTermInvestments','MarketableSecuritiesCurrent'],'instant'],
 accounts_receivable:[['AccountsReceivableNetCurrent','TradeAndOtherCurrentReceivables'],'instant'],inventory:[['InventoryNet','Inventories'],'instant'],other_current_assets:[['OtherAssetsCurrent'],'instant'],total_current_assets:[['AssetsCurrent','CurrentAssets'],'instant'],
 investments:[['LongTermInvestments','MarketableSecuritiesNoncurrent'],'instant'],ppe_gross:[['PropertyPlantAndEquipmentGross'],'instant'],accumulated_depreciation:[['AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment'],'instant'],ppe:[['PropertyPlantAndEquipmentNet','PropertyPlantAndEquipment'],'instant'],goodwill:[['Goodwill'],'instant'],intangible_assets:[['FiniteLivedIntangibleAssetsNet','IntangibleAssetsNetExcludingGoodwill'],'instant'],other_assets:[['OtherAssetsNoncurrent'],'instant'],total_assets:[['Assets'],'instant'],
 accounts_payable:[['AccountsPayableCurrent'],'instant'],tax_payable:[['AccruedIncomeTaxesCurrent','IncomeTaxesPayableCurrent','TaxesPayableCurrent','AccruedIncomeTaxesPayable'],'instant'],current_accrued_liabilities:[['AccruedLiabilitiesCurrent'],'instant'],
 short_term_debt:[['DebtCurrent','CurrentBorrowingsAndCurrentPortionOfNoncurrentBorrowings'],'instant'],_short_borrowings:[['ShortTermBorrowings'],'instant'],_commercial_paper:[['CommercialPaper'],'instant'],_debt_current:[['LongTermDebtCurrent'],'instant'],
 long_term_debt:[['LongTermDebtNoncurrent','NoncurrentBorrowings','LongtermBorrowings'],'instant'],_long_debt_total:[['LongTermDebt'],'instant'],
 current_deferred_revenue:[['DeferredRevenueCurrent','ContractWithCustomerLiabilityCurrent'],'instant'],noncurrent_deferred_revenue:[['DeferredRevenueNoncurrent','ContractWithCustomerLiabilityNoncurrent'],'instant'],
 current_deferred_tax_liability:[['DeferredIncomeTaxLiabilitiesNetCurrent'],'instant'],current_capital_leases:[['CapitalLeaseObligationsCurrent','FinanceLeaseLiabilityCurrent','CurrentLeaseLiabilities'],'instant'],noncurrent_capital_leases:[['CapitalLeaseObligationsNoncurrent','FinanceLeaseLiabilityNoncurrent','NoncurrentLeaseLiabilities'],'instant'],
 pension_liabilities:[['DefinedBenefitPlanLiabilitiesNoncurrent'],'instant'],other_lt_liabilities:[['OtherLiabilitiesNoncurrent'],'instant'],other_current_liabilities:[['OtherLiabilitiesCurrent'],'instant'],total_noncurrent_liabilities:[['LiabilitiesNoncurrent','NoncurrentLiabilities'],'instant'],total_current_liabilities:[['LiabilitiesCurrent','CurrentLiabilities'],'instant'],total_liabilities:[['Liabilities'],'instant'],total_liabilities_equity:[['LiabilitiesAndStockholdersEquity','EquityAndLiabilities'],'instant'],
 retained_earnings:[['RetainedEarningsAccumulatedDeficit','RetainedEarnings'],'instant'],paid_in_capital:[['AdditionalPaidInCapital'],'instant'],common_stock:[['CommonStockValue','CommonStocksIncludingAdditionalPaidInCapital'],'instant'],aoci:[['AccumulatedOtherComprehensiveIncomeLossNetOfTax'],'instant'],preferred_stock:[['PreferredStockValue'],'instant'],treasury_stock:[['TreasuryStockValue'],'instant'],minority_interest:[['MinorityInterest','NoncontrollingInterestInConsolidatedEntity','NoncontrollingInterests'],'instant'],shareholders_equity:[['StockholdersEquity','EquityAttributableToOwnersOfParent'],'instant'],
 cf_net_income:[['NetIncomeLoss','ProfitLoss']],cf_dna:[['DepreciationDepletionAndAmortization','DepreciationDepletionAndAmortizationPropertyPlantAndEquipment','DepreciationAmortisationAndImpairmentExpense']],cf_deferred_tax:[['DeferredIncomeTaxExpenseBenefit','DeferredIncomeTaxesAndTaxCredits']],cf_stock_comp:[['ShareBasedCompensation']],
 cash_from_operations:[['NetCashProvidedByUsedInOperatingActivities','CashFlowsFromUsedInOperatingActivities']],
 _cf_ppe_purchases:[['PaymentsToAcquirePropertyPlantAndEquipment','PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities']],_cf_ppe_sales:[['ProceedsFromSaleOfPropertyPlantAndEquipment']],
 _cf_acq_purchases:[['PaymentsToAcquireBusinessesNetOfCashAcquired']],_cf_acq_sales:[['ProceedsFromDivestitureOfBusinessesNetOfCashDivested']],
 _cf_inv_purchases:[['PaymentsToAcquireInvestments','PaymentsToAcquireAvailableForSaleSecuritiesDebt']],_cf_inv_sales:[['ProceedsFromSaleAndMaturityOfAvailableForSaleSecurities','ProceedsFromSaleOfInvestments','ProceedsFromSaleOfAvailableForSaleSecuritiesDebt']],
 cash_from_investing:[['NetCashProvidedByUsedInInvestingActivities','CashFlowsFromUsedInInvestingActivities']],
 _cf_stock_repurchase:[['PaymentsForRepurchaseOfCommonStock']],_cf_stock_issuance:[['ProceedsFromIssuanceOfCommonStock','ProceedsFromStockOptionsExercised']],
 _cff_debt_issued:[['ProceedsFromIssuanceOfLongTermDebt']],_cff_debt_repaid:[['RepaymentsOfLongTermDebt']],cf_dividends:[['PaymentsOfDividends','PaymentsOfDividendsCommonStock','DividendsPaidClassifiedAsFinancingActivities']],
 cash_from_financing:[['NetCashProvidedByUsedInFinancingActivities','CashFlowsFromUsedInFinancingActivities']],cf_forex:[['EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents','EffectOfExchangeRateOnCashAndCashEquivalents']],
 _dividends_per_share:[['CommonStockDividendsPerShareDeclared','DividendsRecognisedAsDistributionsToOwnersPerShare'],'per-share'],
 net_interest_income:[['InterestIncomeExpenseNet','NetInterestIncome','InterestIncomeExpenseNonoperatingNet']],credit_loss_provision:[['ProvisionForLoanLeaseAndOtherLosses','ProvisionForLoanAndLeaseLosses','ProvisionForCreditLosses']],noninterest_revenue:[['NoninterestIncome']],noninterest_expense:[['NoninterestExpense']],
 gross_loans:[['LoansAndLeasesReceivableGrossCarryingAmount','LoansAndLeasesReceivableNetOfDeferredIncome'],'instant'],loan_loss_reserve:[['AllowanceForLoanAndLeaseLossesRealEstateLoans','AllowanceForLoanAndLeaseLosses'],'instant'],net_loans:[['LoansAndLeasesReceivableNetReportedAmount','LoansAndLeasesReceivableNetOfDeferredIncomeAllowanceAndDiscounts'],'instant'],deposits:[['Deposits'],'instant'],securities_investments:[['MarketableSecurities'],'instant'],
 premiums_earned:[['PremiumsEarnedNet','PremiumsEarned']],investment_income:[['InvestmentIncomeNet']],fees_other:[['FeesAndCommissions']],policy_benefits:[['PolicyholderBenefitsAndClaimsIncurredNet','PolicyholderBenefitsAndClaimsIncurred']],policy_acquisition:[['DeferredPolicyAcquisitionCostAmortizationExpense']],
 unearned_premiums:[['UnearnedPremiums'],'instant'],future_policy_benefits:[['FuturePolicyBenefits'],'instant'],loss_reserves:[['LiabilityForUnpaidClaimsAndClaimsAdjustmentExpense'],'instant'],deferred_acq_cost:[['DeferredPolicyAcquisitionCosts'],'instant'],
};
for(const [key,names]of Object.entries({"sga": ["Dart_TotalSellingGeneralAdministrativeExpenses"], "aoci": ["Dart_OtherComprehensiveIncomeLossAccumulatedAmount"], "accounts_receivable": ["CurrentTradeReceivables"], "short_term_investments": ["CurrentInvestments"], "other_current_assets": ["OtherCurrentAssets"], "other_assets": ["OtherNoncurrentAssets"], "accounts_payable": ["TradeAndOtherCurrentPayablesToTradeSuppliers"], "tax_payable": ["CurrentTaxLiabilities"], "current_accrued_liabilities": ["AccrualsClassifiedAsCurrent"], "other_lt_liabilities": ["OtherNoncurrentLiabilities"], "pension_liabilities": ["NoncurrentRecognisedLiabilitiesDefinedBenefitPlan"], "paid_in_capital": ["SharePremium"], "_cf_ppe_sales": ["ProceedsFromSalesOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"], "cf_forex": ["EffectOfExchangeRateChangesOnCashAndCashEquivalents"], "_short_borrowings": ["Dart_CurrentLoansReceived"], "_debt_current": ["CurrentPortionOfLongtermBorrowings"], "_cff_debt_issued": ["Dart_ProceedsFromLongTermBorrowings"]}))for(const name of names)if(!concepts[key][0].includes(name))concepts[key][0].push(name);
for(const [key,names]of Object.entries({"cogs": ["TW_tifrs_bsci_ci_OperatingCosts"], "accounts_receivable": ["TW_tifrs_bsci_ci_AccountsReceivableNet"], "cash_from_investing": ["TW_tifrs_SCF_NetCashFlowsFromUsedInInvestingActivities"], "cash_from_financing": ["TW_tifrs_SCF_CashFlowsFromUsedInFinancingActivities"], "_debt_current": ["TW_tifrs_bsci_ci_LongtermLiabilitiesCurrentPortion"], "paid_in_capital": ["AdditionalPaidinCapital"], "common_stock": ["TW_tifrs_bsci_ci_OrdinaryShare"], "treasury_stock": ["TreasuryShares"], "total_operating_expenses": ["OperatingExpense"], "interest_income": ["RevenueFromInterest"], "_cf_stock_repurchase": ["TW_tifrs_SCF_PaymentsToAcquireTreasuryShares"]}))for(const name of names)if(!concepts[key][0].includes(name))concepts[key][0].push(name);
// Cash-flow deltas use the XBRL debit/credit convention. Asset increases
// consume cash; liability increases provide cash. Do not negate all deltas.
Object.assign(concepts,{
 _wc_receivables:[['IncreaseDecreaseInReceivables','IncreaseDecreaseInAccountsReceivable']],
 _wc_other_receivables:[['IncreaseDecreaseInOtherReceivables']],
 _wc_inventory:[['IncreaseDecreaseInInventories']],
 _wc_prepaid:[['IncreaseDecreaseInPrepaidDeferredExpenseAndOtherAssets','IncreaseDecreaseInPrepaidExpenses']],
 _wc_other_assets:[['IncreaseDecreaseInOtherOperatingAssets']],
 _wc_payables:[['IncreaseDecreaseInAccountsPayable']],
 _wc_tax:[['IncreaseDecreaseInAccruedIncomeTaxesPayable']],
 _wc_accrued:[['IncreaseDecreaseInOtherAccruedLiabilities']],
 _wc_other_liabilities:[['IncreaseDecreaseInOtherOperatingLiabilities']],
 _wc_total:[['IncreaseDecreaseInOperatingCapital']],
 _wc_other_net:[['IncreaseDecreaseInOtherOperatingCapitalNet']],
 _cf_inv_maturities:[['ProceedsFromMaturitiesPrepaymentsAndCallsOfAvailableForSaleSecurities']],
 _cf_short_debt_net:[['ProceedsFromRepaymentsOfShortTermDebt','ProceedsFromRepaymentsOfCommercialPaper']],
 _cf_net_preferred_issued:[['ProceedsFromIssuanceOfPreferredStockAndPreferenceStock']],
 _cf_net_preferred_repaid:[['PaymentsForRepurchaseOfPreferredStockAndPreferenceStock']],
 other_nonrecurring:[['ExtraordinaryItemNetOfTax','OtherNonrecurringIncomeExpenseNet']],
});

// The accounting taxonomies define source concepts; this local, versioned
// registry defines the subset and transformations understood by the report.
// Existing aliases are baseline mappings, not an exhaustive taxonomy catalog.
export const registryInfo=Object.freeze({
 version:'2026-10-29.2',
 policy:'Explicit mappings only. Taxonomy membership does not imply equivalence to a report row. AI proposals are not active rules.',
 sources:[
  {label:'FASB taxonomies and implementation guides',url:'https://fasb.org/projects/fasb-taxonomies/resources/taxonomy-implementation-guides'},
  {label:'IFRS Accounting Taxonomy',url:'https://www.ifrs.org/issued-standards/ifrs-taxonomy/'},
  {label:'OpenDART statement API',url:'https://engopendart.fss.or.kr/guide/detail.do?apiGrpCd=DE003&apiId=AE00036'},
  {label:'SEC CompanyFacts scope',url:'https://www.sec.gov/search-filings/edgar-application-programming-interfaces'}
 ]
});
export function mappingRegistry(){
 return Object.entries(concepts).map(([target,[tags,type='duration']])=>({target,type,tags:[...tags],status:'active',origin:'explicit report mapping'}));
}

Object.assign(concepts,{"_ifrs_depreciation": [["AdjustmentsForDepreciationExpense"]], "_ifrs_amortization": [["AdjustmentsForAmortisationExpense"]], "_ifrs_selling": [["SellingExpense"]], "_ifrs_administration": [["AdministrativeExpense"]], "_ifrs_noncurrent_loans": [["NoncurrentPortionOfNoncurrentLoansReceived"], "instant"], "_ifrs_noncurrent_bonds": [["NoncurrentPortionOfNoncurrentBondsIssued"], "instant"], "_tw_wc_signed": [["TW_tifrs_SCF_ChangesInOperatingAssetsAndLiabilities"]], "_tw_bonds_issued": [["TW_tifrs_SCF_ProceedsFromIssuingBonds"]], "_tw_bonds_repaid": [["TW_tifrs_SCF_RepaymentsOfBonds"]], "_tw_loans_issued": [["TW_tifrs_SCF_ProceedsFromLongTermDebt"]], "_tw_loans_repaid": [["TW_tifrs_SCF_RepaymentsOfLongTermDebt"]]});

Object.assign(concepts,{"_ifrs_total_debt_proceeds": [["ProceedsFromBorrowingsClassifiedAsFinancingActivities"]], "_ifrs_total_debt_repayments": [["RepaymentsOfBorrowingsClassifiedAsFinancingActivities"]]});

for(const [key,names]of Object.entries({"revenue": ["TW_tifrs_bsci_ci_OperatingRevenue"], "gross_profit": ["TW_tifrs_bsci_ci_GrossProfitLossFromOperations"], "_cf_ppe_purchases": ["TW_tifrs_SCF_AcquisitionOfPropertyPlantAndEquipment"], "_cf_ppe_sales": ["TW_tifrs_SCF_ProceedsFromDisposalOfPropertyPlantAndEquipment"], "cf_dividends": ["TW_tifrs_SCF_CashDividendsPaid"]}))concepts[key][0].push(...names);

concepts._ifrs_noncurrent_loans[0].push('TW_tifrs_bsci_ci_LongtermBankLoans');concepts._ifrs_noncurrent_bonds[0].push('TW_tifrs_bsci_ci_BondsPayable');
