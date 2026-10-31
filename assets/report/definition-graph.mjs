import {fundDefinition} from './fund-report.mjs?v=162d5e719d39';
import {nativeDefinition} from './native-template.mjs?v=162d5e719d39';
const balanceNote='Average balance = (current year-end + prior year-end) ÷ 2. The current balance is used when the prior balance is unavailable.';
const valuationTerms={
 'P/E':['Latest price ÷ TTM diluted EPS','Latest reported FY EPS is used when TTM is missing; basic EPS is used when diluted EPS is unavailable.'],
 'P/NAV':['Latest market price ÷ reported net asset value per share',''],
 'Discount / Premium':['(Latest market price ÷ reported net asset value per share − 1) × 100',''],
 'Annualized Distribution Yield':['Reported annualized distribution per share ÷ latest market price × 100','Annualized rate, not trailing distributions or a guarantee.'],
 'Expense Ratio':['Reported annual expenses ÷ average net assets × 100',''],
 'Net Investment Income / Net Assets':['Reported annual net investment income ÷ average net assets × 100',''],
 'P/B':['Market capitalization ÷ latest shareholders’ equity','Market capitalization = latest price × verified common shares outstanding. Shown when equity is positive.'],
 'P/S':['Market capitalization ÷ TTM revenue','Market capitalization = latest price × verified common shares outstanding. For banks, revenue can be net interest income + noninterest revenue.'],
 'EV/S':['Enterprise value ÷ TTM revenue','Enterprise value = market capitalization + total debt − cash.'],
 'EV/EBITDA':['Enterprise value ÷ (TTM operating income + TTM depreciation & amortization)','Enterprise value = market capitalization + total debt − cash.'],
 'EV/EBIT':['Enterprise value ÷ TTM operating income','Enterprise value = market capitalization + total debt − cash.'],
 'EV/Pretax':['Enterprise value ÷ TTM pretax income','Enterprise value = market capitalization + total debt − cash.'],
 'FCF Yield':['TTM free cash flow ÷ market capitalization × 100','Latest reported FY free cash flow is used when TTM is unavailable.'],
 'EV/FCF':['Enterprise value ÷ TTM free cash flow','Free cash flow = operating cash flow − capital expenditures.'],
 'P/Pretax':['Market capitalization ÷ TTM pretax income','Market capitalization = latest price × verified common shares outstanding.'],
 'P/Premiums':['Market capitalization ÷ TTM earned premiums','Market capitalization = latest price × verified common shares outstanding.'],
 'EV/Premiums':['Enterprise value ÷ TTM earned premiums','Enterprise value = market capitalization + total debt − cash.'],
};
const ratios={
 ROA:['Annual net income ÷ average total assets × 100',balanceNote],
 ROE:['Annual net income ÷ average shareholders’ equity × 100',balanceNote],
 ROIC:['Annual net income ÷ average invested capital × 100','Invested capital = shareholders’ equity + total debt + lease liabilities excluded from debt + minority interest. '+balanceNote+' A positive average invested capital is required.'],
 NIM:['Annual net interest income ÷ average earning assets × 100',balanceNote],
 ROI:['Annual investment income ÷ average investment assets × 100','Investment assets = trading securities + equity investments + fixed-maturity investments. '+balanceNote],
 'Gross Profit':['Annual gross profit ÷ annual revenue × 100','Gross profit = revenue − cost of goods sold when derived from those reported inputs.'],
 Operating:['Annual operating income ÷ annual revenue × 100',''],
 'Pre-Tax':['Annual pretax income ÷ annual revenue × 100',''],
 'Pre-Tax Income':['Annual pretax income ÷ annual revenue × 100',''],
 'Net Income':['Annual net income ÷ annual revenue × 100',''],
 FCF:['Annual free cash flow ÷ annual revenue × 100','Free cash flow = operating cash flow − capital expenditures.'],
 Underwriting:['(Earned premiums + fees − policy benefits − policy acquisition costs) ÷ (earned premiums + fees) × 100',''],
};
const capital={
 'Assets / Equity':['Latest annual total assets ÷ shareholders’ equity',''],
 'Debt / Equity':['Latest annual total debt ÷ shareholders’ equity',''],
 'Debt / Assets':['Latest annual total debt ÷ total assets',''],
 'Equity / Assets':['Latest annual shareholders’ equity ÷ total assets × 100',''],
 'Erng Assets / Eq':['Latest annual earning assets ÷ shareholders’ equity',''],
 'LLR / Loans':['Absolute loan-loss reserve ÷ latest annual gross loans × 100',''],
};
const cagrTerms={Revenue:'revenue',EPS:'diluted EPS',Assets:'total assets',Equity:'shareholders’ equity',FCF:'free cash flow','Net Int. Income':'net interest income','Gross Loans':'gross loans','Earning Assets':'earning assets',Deposits:'deposits',Premiums:'earned premiums'};
export function statisticFormula(label,group,companyType=''){
 const cagr=group.match(/(\d+)-Year CAGR/);
 if(cagr){const term=cagrTerms[label]||label.toLowerCase(),years=cagr[1];return {formula:`((Ending ${term} ÷ ${term} ${years} years earlier)^(1 ÷ ${years}) − 1) × 100`,note:`Uses the latest annual endpoint and the annual endpoint ${years} years earlier. Both endpoints must be positive.`};}
 if((group.startsWith('Valuation')||group.startsWith('Fund Valuation'))){
  const [formula,note]=valuationTerms[label]||['',''];
  return {formula:formula,note};
 }
 const [formula,note]=(group==='Capital Structure'?capital[label]:ratios[label])||['',''];
 const median=group.match(/(\d+)-Yr Median/);
 return {formula:median?`Median of: ${formula}`:formula,note:[median?`Calculated across the latest ${median[1]} annual periods with available inputs.`:'',note].filter(Boolean).join(' ')};
}


import schema from './row-schema.mjs?v=162d5e719d39';
const definitions=new Map();
function add(id,title,formula,group='Definition',aliases=[]){definitions.set(id,{id,title,formula,group,aliases:[title,...aliases]});}
const fields={
 revenue:'Reported sales of goods and services, excluding taxes collected for others.',
 cogs:'Reported direct costs of goods and services sold.',
 gross_profit:'Revenue − cost of goods sold',
 sga:'Reported selling, general and administrative expenses.',
 rd:'Reported research and development expenses.',
 other_operating:'Reported operating expenses outside the separately identified categories.',
 total_operating_expenses:'Reported total operating expenses.',
 reported_costs_expenses:'Reported costs and expenses; source statement scope retained.',
 operating_income:'Gross profit − total operating expenses',
 interest_income:'Interest earned on cash, securities or lending, when separately disclosed.',
 interest_expense:'− reported interest expense; expense reversals retain the opposite sign.',
 net_interest_income:'Reported interest income less interest expense.',
 other_nonoperating:'Pre-tax income − operating income − separately identified interest income − signed interest expense',
 pretax_income:'Reported income before income taxes.',
 income_tax:'− reported income tax expense; a tax benefit appears positive.',
 minority_interest_income:'Income attributable to noncontrolling interests, when separately disclosed.',
 other_nonrecurring:'Separately reported extraordinary or non-recurring net-income adjustments. Vendor-only classifications are not inferred.',
 net_income:'Reported profit or loss after taxes and other net-income adjustments.',
 preferred_dividends:'Reported dividends and adjustments attributable to preferred shareholders.',
 net_income_discontinued:'Reported after-tax income or loss from discontinued operations.',
 net_income_continuing:'Reported continuing-operations income, or net income − discontinued-operations income.',
 _net_income_available:'Net income − preferred dividends',
 eps_basic:'Reported basic earnings per share, normalized to the selected share basis.',
 eps_diluted:'Reported diluted earnings per share, normalized to the selected share basis. Nonannual TTM EPS uses common income ÷ time-weighted diluted shares.',
 shares_basic:'Reported weighted-average basic shares, normalized to the selected share basis.',
 shares_diluted:'Reported weighted-average diluted shares, normalized to the selected share basis.',
 cash:'Reported cash and cash equivalents.',
 short_term_investments:'Reported current marketable securities or short-term investments.',
 accounts_receivable:'Reported net current receivables; may include notes and loans when disclosed as a combined total.',
 inventory:'Reported inventory carrying amount.',
 other_current_assets:'Reported current assets outside separately identified categories.',
 total_current_assets:'Reported assets expected to be realized within the operating cycle.',
 investments:'Reported long-term investments and noncurrent marketable securities.',
 ppe_gross:'Reported property, plant and equipment before accumulated depreciation.',
 accumulated_depreciation:'− reported accumulated depreciation, depletion and amortization of property, plant and equipment.',
 ppe:'Reported property, plant and equipment after accumulated depreciation.',
 goodwill:'Reported goodwill carrying amount.',
 intangible_assets:'Reported identifiable intangible assets excluding goodwill.',
 other_assets:'Reported other noncurrent assets.',
 total_assets:'Reported total resources controlled by the company.',
 accounts_payable:'Reported amounts payable to suppliers.',
 tax_payable:'Reported current accrued income taxes payable.',
 current_accrued_liabilities:'Reported current expenses incurred but not yet paid.',
 short_term_debt:'Reported current debt, or current long-term debt + short-term borrowing + commercial paper.',
 total_debt:'Reported total debt, or a source-supported sum of debt balances. Finance leases retain the reporting basis.',
 reported_lease_liabilities_current:'Reported current lease liability; source netting retained.',
 reported_lease_liabilities_noncurrent:'Reported noncurrent lease liability; source netting retained.',
 operating_lease_liabilities_current:'Reported current operating-lease liabilities.',
 operating_lease_liabilities_noncurrent:'Reported noncurrent operating-lease liabilities.',
 long_term_debt:'Reported noncurrent debt, or total long-term debt − current portion.',
 current_deferred_revenue:'Reported customer payments for obligations not yet satisfied, due within the operating cycle.',
 noncurrent_deferred_revenue:'Reported noncurrent contract liabilities or deferred revenue.',
 current_deferred_tax_liability:'Reported current deferred income tax liabilities.',
 current_capital_leases:'Reported current finance lease obligations under US GAAP, or current lease liabilities under IFRS.',
 noncurrent_capital_leases:'Reported noncurrent finance lease obligations under US GAAP, or noncurrent lease liabilities under IFRS.',
 pension_liabilities:'Reported noncurrent pension and retirement obligations.',
 other_current_liabilities:'Reported other current liabilities.',
 other_lt_liabilities:'Reported other noncurrent liabilities.',
 total_noncurrent_liabilities:'Reported noncurrent liabilities, or total liabilities − total current liabilities.',
 total_current_liabilities:'Reported obligations due within the operating cycle.',
 total_liabilities:'Reported total obligations owed by the company.',
 retained_earnings:'Reported accumulated earnings or deficit retained in the business.',
 paid_in_capital:'Reported additional capital contributed by shareholders.',
 common_stock:'Reported common-stock capital, separated from additional paid-in capital when both are disclosed.',
 aoci:'Reported accumulated other comprehensive income or loss.',
 preferred_stock:'Reported preferred-stock carrying amount.',
 treasury_stock:'− reported cost of treasury stock held by the company.',
 minority_interest:'Reported equity attributable to noncontrolling interests.',
 shareholders_equity:'Reported shareholders’ equity. When only consolidated equity is disclosed, separately reported noncontrolling interests are subtracted; otherwise the consolidated scope is retained in provenance.',
 other_equity:'Shareholders’ equity − identified equity components',
 total_liabilities_equity:'Total liabilities + shareholders’ equity',
 cf_net_income:'Reported net income used to reconcile operating cash flow.',
 cf_dna:'Reported noncash depreciation, depletion and amortization adjustment.',
 cf_working_capital:'Cash effect of reported receivables, inventory, prepaid expenses, other operating assets, payables, accrued taxes and operating liabilities.',
 cf_deferred_tax:'Reported deferred-income-tax adjustment in operating cash flow.',
 cf_stock_comp:'Reported noncash stock-based compensation adjustment.',
 cf_other_operating:'Operating cash flow − identified operating components',
 cash_from_operations:'Reported net cash provided by or used in operating activities.',
 cf_capex:'Reported capital-asset sale proceeds − capital spending. If only spending or proceeds are disclosed, the reported cash flow is shown separately. Productive assets may include property, equipment, software and intangible assets.',
 cf_acquisitions:'Business sale proceeds − acquisition payments',
 cf_investments:'Investment sale and maturity proceeds − investment purchases',
 cf_other_investing:'Investing cash flow − identified investing components',
 cash_from_investing:'Reported net cash provided by or used in investing activities.',
 cf_net_stock:'Common-stock issuance proceeds − common-stock repurchases',
 cf_net_preferred:'Preferred-stock issuance proceeds − preferred-stock repurchases',
 cf_debt_net:'Long-term debt issuance − long-term debt repayments + net short-term borrowing',
 cf_dividends:'− reported cash dividend payments',
 cf_other_financing:'Financing cash flow − identified financing components',
 cash_from_financing:'Reported net cash provided by or used in financing activities.',
 cf_forex:'Reported effect of exchange-rate changes on cash and cash equivalents.',
 free_cash_flow:'Operating cash flow − capital expenditure payments',
 credit_loss_provision:'Reported provision for expected credit losses.',
 noninterest_revenue:'Reported bank revenue outside net interest income.',
 noninterest_expense:'Reported bank operating expenses outside interest expense.',
 gross_loans:'Reported loan balances before credit-loss allowances.',
 loan_loss_reserve:'− reported allowance for loan and lease losses',
 net_loans:'Reported loans after the allowance for credit losses.',
 deposits:'Reported customer deposit liabilities.',
 securities_investments:'Reported bank securities and investments.',
 premiums_earned:'Reported insurance premiums earned, net of reinsurance where disclosed.',
 investment_income:'Reported net investment income.',
 fees_other:'Reported insurance fees and other income.',
 policy_benefits:'Reported policyholder benefits and claims incurred.',
 policy_acquisition:'Reported policy acquisition costs or amortization.',
 unearned_premiums:'Reported premiums received for coverage not yet earned.',
 policy_liabilities:'Reported liabilities for future policy benefits.',
 loss_reserves:'Reported reserves for unpaid insurance claims and losses.',
 deferred_acquisition_costs:'Reported capitalized policy acquisition costs.',
};
const extraAliases={
 cf_capex:['net PPE flows'],cf_net_stock:['net stock issuance'],cf_debt_net:['net debt issuance'],cf_net_preferred:['net preferred issuance'],cf_dividends:['signed dividend cash flow'],cf_deferred_tax:['deferred tax adjustment'],
 pretax_income:['pretax income','TTM pretax income'],operating_income:['TTM operating income'],

 revenue:['annual revenue','TTM revenue'],net_income:['annual net income','TTM net income','net income available to common'],
 shareholders_equity:['shareholders’ equity'],
 total_assets:['total assets'],cf_dna:['depreciation & amortization','TTM depreciation & amortization'],
 cash_from_operations:['operating cash flow','annual operating cash flow'],cash_from_investing:['investing cash flow'],cash_from_financing:['financing cash flow'],
 free_cash_flow:['annual free cash flow','TTM free cash flow'],shares_diluted:['weighted-average diluted shares','time-weighted diluted shares','TTM weighted-average diluted shares'],
 eps_diluted:['diluted EPS','TTM diluted EPS'],cf_working_capital:['change in working capital'],
};
for(const [table,rows]of Object.entries(schema))for(const row of rows)if(!definitions.has(row.key)){
 const group=table.includes('income')?'Income Statement':table.includes('balance')?'Balance Sheet':'Cash Flow';
 add(row.key,row.label,fields[row.key]||`Reported ${row.label.toLowerCase()} in the company’s financial statements.`,group,extraAliases[row.key]||[]);
}
for(const [key,title]of [['total_debt','Total Debt'],['reported_lease_liabilities_current','Lease Liabilities (Reported Current)'],['reported_lease_liabilities_noncurrent','Lease Liabilities (Reported Noncurrent)'],['operating_lease_liabilities_current','Operating Lease Liabilities (Current)'],['operating_lease_liabilities_noncurrent','Operating Lease Liabilities (Noncurrent)'],['reported_costs_expenses','Costs & Expenses (Reported)'],['free_cash_flow','Free Cash Flow'],['cf_capex','Capital Expenditures (Net / Reported)'],['cf_acquisitions','Net Acquisition Flows'],['cf_investments','Net Investment Flows'],['cf_net_stock','Net Stock Issuance'],['cf_debt_net','Net Debt Issuance'],['net_income_continuing','Net Income (Continuing)'],['_net_income_available','Net Income Available to Shareholders'],['shares_basic','Shares (Basic)']])if(!definitions.has(key))add(key,title,fields[key],'Financial Statements',extraAliases[key]||[]);
add('identified_operating','Identified Operating Components','Sum of available reported components: net income + depreciation & amortization + change in working capital + deferred tax adjustment + stock-based compensation');
add('identified_investing','Identified Investing Components','Sum of available reported components: net PPE flows + net acquisition flows + net investment flows');
add('identified_financing','Identified Financing Components','Sum of available reported components: net stock issuance + net debt issuance + net preferred issuance + signed dividend cash flow');
add('identified_equity','Identified Equity Components','Sum of available reported components: common stock + paid-in capital + retained earnings + accumulated other comprehensive income + preferred stock − treasury-stock cost');
add('capital_expenditures','Capital Expenditures','Gross cash paid for PPE or the disclosed broader productive-asset scope; asset-sale proceeds excluded');
add('fcf_yield','FCF Yield','Free cash flow ÷ market capitalization × 100');
add('invested_capital','Invested Capital','Shareholders’ equity + total debt + lease liabilities excluded from debt + minority interest');
add('average_invested_capital','Average Invested Capital','(Current invested capital + prior-year invested capital) ÷ 2');
add('average_assets','Average Total Assets','(Current total assets + prior-year total assets) ÷ 2');
add('average_equity','Average Shareholders’ Equity','(Current shareholders’ equity + prior-year shareholders’ equity) ÷ 2');
add('common_shares_outstanding','Common Shares Outstanding','Reported common shares outstanding on the selected security basis, net of treasury shares. This is a dated count, not weighted-average EPS shares.','Definition',['verified common shares outstanding','period-end common shares outstanding']);
add('twse_book_value_per_share','TWSE Book Value per Share','Book value per share posted on MOPS for the financial period used by the published TWSE ratio. It is not inferred from rounded P/B.');
add('twse_eps','TWSE EPS','The trailing-four-quarter earnings-per-share basis used by TWSE for its published closing P/E.');
add('market_cap','Market Capitalization','Latest price × verified common shares outstanding');
add('enterprise_value','Enterprise Value','Market capitalization + total debt − cash');
add('latest_price','Latest Price','Most recent market price returned by the quote provider.');
add('monthly_price','Month-End Price','Last available monthly close in the financial period’s calendar month, on the matching split basis.');
add('capital_expenditures','Capital Expenditures','Reported cash payments to acquire property, plant and equipment.');
add('ebitda','EBITDA','Operating income + depreciation & amortization');
add('book_value','Book Value','Shareholders’ equity');
add('tangible_book_value','Tangible Book Value','Shareholders’ equity − goodwill − intangible assets');
add('capital_employed','Capital Employed','Total assets − total current liabilities + short-term debt');
add('tangible_capital','Tangible Capital Employed','Capital employed − goodwill − intangible assets');
add('average_capital_employed','Average Capital Employed','(Current capital employed + prior-year capital employed) ÷ 2');
add('average_tangible_capital','Average Tangible Capital Employed','(Current tangible capital employed + prior-year tangible capital employed) ÷ 2');
add('treasury_stock_cost','Treasury-stock Cost','Reported positive cost of treasury shares held by the company.');
add('earning_assets','Earning Assets','Cash + securities & investments + gross loans');
add('average_earning_assets','Average Earning Assets','(Current earning assets + prior-year earning assets) ÷ 2');
add('average_investments','Average Investment Assets','(Current investment assets + prior-year investment assets) ÷ 2');
add('investment_assets','Investment Assets','Trading securities + equity investments + fixed maturity investments');
add('dividends_per_share','Dividends Per Share','Reported cash dividends per share, re-expressed on the selected share basis.');
add('ttm','TTM','Trailing twelve months. Flow totals use a reported full year, annual + current YTD − prior YTD, or four standalone quarters. Diluted EPS is not summed.');

const ratioFormulas={
 'Return on Assets':'TTM net income ÷ average total assets × 100',
 'Return on Equity':'TTM net income ÷ average shareholders’ equity × 100',
 'Return on Invested Capital':'TTM net income ÷ average invested capital × 100',
 'Return on Capital Employed':'TTM operating income ÷ average capital employed × 100',
 'Return on Tangible Capital Employed':'TTM operating income ÷ average tangible capital employed × 100',
 'Gross Margin':'Gross profit ÷ revenue × 100','Operating Margin':'Operating income ÷ revenue × 100',
 'EBITDA Margin':'EBITDA ÷ revenue × 100','Pretax Margin':'Pre-tax income ÷ revenue × 100',
 'Net Margin':'Net income ÷ revenue × 100','Free Cash Flow Margin':'Free cash flow ÷ revenue × 100',
 'Assets to Equity':'Total assets ÷ shareholders’ equity','Equity to Assets':'Shareholders’ equity ÷ total assets',
 'Debt to Equity':'(Short-term debt + long-term debt) ÷ shareholders’ equity',
 'Debt to Assets':'(Short-term debt + long-term debt) ÷ total assets',
 'Loans to Deposits':'Gross loans ÷ deposits × 100','Loan Loss Reserve to Loans':'Absolute loan-loss reserve ÷ gross loans × 100',
 'Net Interest Margin':'TTM net interest income ÷ average earning assets × 100',
 'Earning Assets to Equity':'Earning assets ÷ shareholders’ equity',
 'Return on Securities Portfolio':'TTM net investment income ÷ average investment assets × 100',
 'Underwriting Margin':'(Earned premiums + fees and other income − policy benefits − policy acquisition costs) ÷ (earned premiums + fees and other income) × 100',
 'Payout Ratio':'Dividends per share ÷ diluted EPS × 100',
 'Price-to-Earnings':'Market capitalization ÷ TTM net income',
 'Price-to-Book':'Market capitalization ÷ book value','Price-to-Sales':'Market capitalization ÷ TTM revenue',
};
const normalized=s=>s.toLowerCase().replaceAll('’',"'").replace(/\s+/g,' ').trim();
const labelKeys=new Map();for(const [id,node]of definitions)for(const name of node.aliases)if(name&&name!=='Other')labelKeys.set(normalized(name),id);
export function definitionById(id,context={}){
 const node=definitions.get(id)||nativeDefinition(id)||fundDefinition(id);if(!node)return null;
 if(context.quarterly&&((context.companyType==='bank'&&['average_assets','average_equity'].includes(id))||['average_earning_assets','average_investments'].includes(id)))return {...node,formula:node.formula.replace('prior-year','prior-quarter')};
 if(id==='market_cap'&&context.nativeValuation)return {...node,formula:'Latest native price × period-end common shares outstanding; unavailable when other share classes are unresolved'};
 if(id==='market_cap'&&context.historical)return {...node,formula:'Month-end price × period weighted-average diluted shares'};
 return node;
}
export function resolveDefinition({label,group='',metricKey,companyType='',quarterly=false}){
 label=label.replace(/ \((?:TTM|YoY)\)$/,'').replace(/ %$/,'');
 const context={historical:group==='Valuation Metrics',companyType,quarterly,nativeValuation:group.startsWith('Valuation · ')};
 if(metricKey){const node=definitionById(metricKey,context);return node?{...node,group:group&&group!=='Financial Statements'?group:node.group,context}:null;}
 if(group.startsWith('Valuation · TWSE close ')&&['P/E','P/B'].includes(label))return {id:'twse:'+label,title:label,group,formula:label==='P/B'?'Reported TWSE closing price ÷ TWSE book value per share':'Reported TWSE closing price ÷ TWSE EPS',context};
 if(/Median|CAGR/.test(group)||(group.startsWith('Valuation')||group.startsWith('Fund Valuation'))||group==='Capital Structure'&&capital[label]){
  const info=statisticFormula(label,group,companyType);if(info.formula){if(context.nativeValuation){info.formula=info.formula.replace(/TTM/g,group.includes('FY ')?group.split('· ')[1]:'TTM');if(label==='P/E')info.formula+=' (basic EPS if diluted EPS is unavailable)';}return {id:'stat:'+group+':'+label,title:label,group,formula:info.formula,context};}
 }
 if(/Growth/.test(group)||/Growth/.test(label)){
  const term=label.replace(/ Growth(?: \(YoY\))?/,'');return {id:'growth:'+term,title:label,group,formula:`(Current ${term.toLowerCase()} − prior-year ${term.toLowerCase()}) ÷ absolute prior-year ${term.toLowerCase()} × 100`,context};
 }
 if(group==='Per-Share Items'&&!/EPS|Dividends/i.test(label))return {id:'per-share:'+label,title:label,group,formula:`${label} ÷ weighted-average diluted shares`,context};
 if(ratioFormulas[label])return {id:'ratio:'+label,title:label,group,formula:ratioFormulas[label],context};
 const id=labelKeys.get(normalized(label));const node=id&&definitionById(id,context);
 return node?{...node,group:group||node.group,context}:null;
}
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const names=[];const targets=new Map(),seenNames=new Set();
for(const [id,node]of definitions)for(const name of node.aliases){
 if(!name||name.length<4||['Other','Net Income','Revenue'].includes(name)&&id.startsWith('_'))continue;
 for(const variant of [name,name.replaceAll("'",'’'),name.replaceAll('’',"'")]){if(seenNames.has(variant.toLowerCase()))continue;seenNames.add(variant.toLowerCase());names.push(variant);if(!targets.has(normalized(variant)))targets.set(normalized(variant),id);}
}
const termPattern=new RegExp('(?<![\\p{L}\\p{N}])('+names.sort((a,b)=>b.length-a.length).map(escape).join('|')+')(?![\\p{L}\\p{N}])','giu');
export function definitionTokens(formula,currentId){
 const tokens=[];let offset=0;
 for(const match of formula.matchAll(termPattern)){
  if(match.index>offset)tokens.push({text:formula.slice(offset,match.index)});
  const id=targets.get(normalized(match[0]));tokens.push({text:match[0],...(id!==currentId?{ref:id}:{})});offset=match.index+match[0].length;
 }
 if(offset<formula.length)tokens.push({text:formula.slice(offset)});
 return tokens;
}
export const definitionCount=definitions.size;
