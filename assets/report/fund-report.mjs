// Fund financial statements are distinct from corporate operating statements.
// Values below come only from a verified, prebuilt shareholder-report cache.
export const fundRows={
 income_statement:[['fund_total_investment_income','Total Investment Income'],['fund_expenses_net','Expenses After Fee Waivers'],['fund_net_investment_income','Net Investment Income'],['fund_net_realized_gain','Net Realized Gain / Loss'],['fund_net_unrealized_gain','Change in Unrealized Appreciation / Depreciation'],['fund_total_gain','Net Realized and Unrealized Gain / Loss'],['fund_net_operations','Increase / Decrease in Net Assets from Operations'],['fund_nii_per_share','Net Investment Income per Share','per-share'],['fund_gain_per_share','Realized and Unrealized Gain per Share','per-share'],['fund_operations_per_share','Investment Operations per Share','per-share'],['fund_distributions_per_share','Distributions per Share','per-share'],['fund_market_price_per_share','Market Price at Period End','per-share']],
 balance_sheet:[['fund_unaffiliated_investments','Investments — Unaffiliated'],['fund_affiliated_investments','Investments — Affiliated'],['fund_cash','Cash'],['fund_foreign_currency','Foreign Currency at Value'],['fund_total_assets','Total Assets'],['fund_total_liabilities','Total Liabilities'],['fund_net_assets','Net Assets'],['fund_paid_in_capital','Paid-in Capital'],['fund_accumulated_earnings','Accumulated Earnings / Loss'],['fund_shares_outstanding','Shares Outstanding','shares'],['fund_nav_per_share','Net Asset Value per Share','per-share']],
 cash_flow:[['fund_cash_from_operations','Cash from Operating Activities'],['fund_investment_sales','Investment Sales and Principal Payments'],['fund_investment_purchases','Investment Purchases'],['fund_option_premiums_received','Option Premiums Received'],['fund_option_premiums_paid','Option Premiums Paid on Closing'],['fund_cash_distributions','Cash Distributions to Shareholders'],['fund_cash_from_financing','Cash from Financing Activities'],['fund_forex_cash_effect','Foreign Exchange Cash Effect'],['fund_cash_change','Change in Cash and Foreign Currency'],['fund_ending_cash','Ending Cash and Foreign Currency']]
};
export function toFundReport(source,record,quote=null,asOf=new Date().toISOString().slice(0,10)){
 if(source.schema_version!==1||String(Number(source.cik))!==String(Number(record.cik))||source.ticker!==record.ticker)throw Error('Fund cache identity mismatch.');
 const loadedSources=(source.sources||[]).filter(s=>s.date<=asOf);
 const observations=source.observations.filter(p=>p.ticker===record.ticker&&String(Number(p.cik))===String(Number(record.cik))&&p.filed<=asOf&&p.end<=asOf&&Number.isFinite(p.value));
 const dates=[...new Set(observations.filter(p=>p.annual).map(p=>p.end))].sort(),years=dates.map(d=>d.slice(0,4));
 const latest=observations.map(p=>p.end).sort().at(-1),columns=['TTM',...years],period_dates=[latest,...dates];
 function select(key,end,annual){
  let candidates=observations.filter(p=>p.key===key&&p.end===end&&(annual===undefined||p.annual===annual));
  if(candidates.some(p=>p.precision==='reported-dollar'))candidates=candidates.filter(p=>p.precision==='reported-dollar');
  const filed=candidates.map(p=>p.filed).sort().at(-1);candidates=candidates.filter(p=>p.filed===filed);
  return new Set(candidates.map(p=>p.value)).size===1?candidates[0]:null;
 }
 const financials={name:record.name||source.name,ticker:record.exchange+':'+record.ticker,cik:source.cik,company_type:'fund',available_periods:{annual:!!years.length,quarterly:false},columns,period_dates,splits:[],roic_series:[],source_coverage:{status:'partial',scope:'Fund-native N-CSR/N-CSRS statement rows and financial highlights. Latest balance-sheet figures use the latest shareholder report; TTM fund income is not manufactured.',sources:loadedSources},validation:{scope:'Fund reported accounting identities and NAV/share-count consistency; not every disclosure.',checks:[],status:'checks_pass'}};
 for(const [table,definitions]of Object.entries(fundRows))financials[table]=definitions.map(([key,label,type='money'])=>{
  const values={},provenance={},availability={};
  for(let i=0;i<columns.length;i++){
   const period=columns[i],p=period==='TTM'?(table==='balance_sheet'?select(key,latest):null):select(key,period_dates[i],true);
   if(p){values[period]=p.value/(type==='per-share'||type==='percentage'?1:1e6);provenance[period]={source_url:p.source_url,accn:p.accession,filed:p.filed,end:p.end,source_label:p.label,source_table:p.table_index,source_row:p.row_index,source_sha256:p.source_sha256,share_class:record.ticker,precision:p.precision};}
   else availability[period]={status:'unavailable',code:period==='TTM'?'ttm_inputs_missing':'not_in_loaded_feed',end:period_dates[i]};
  }
  return {key,label,section:'',is_subtotal:['fund_net_investment_income','fund_net_operations','fund_net_assets','fund_total_assets','fund_total_liabilities','fund_cash_from_operations','fund_cash_from_financing'].includes(key),is_per_share:type==='per-share',is_percentage:type==='percentage',is_shares:type==='shares',value_type:type,values,provenance,availability,source_context:{concepts:[],currency:'USD',source_url:source.sources?.at(-1)?.url}};
 });
 financials.fund_ratios=[['fund_expense_ratio','Expense Ratio'],['fund_nii_ratio','Net Investment Income / Net Assets'],['fund_turnover_ratio','Portfolio Turnover']].map(([key,label])=>({key,label,section:'Fund Financial Highlights',is_percentage:true,values:Object.fromEntries(dates.flatMap(end=>{const p=select(key,end,true);return p?[[end.slice(0,4),p.value]]:[];}))}));
 for(const end of [...new Set(observations.map(p=>p.end))]){
  const a=select('fund_total_assets',end),l=select('fund_total_liabilities',end),n=select('fund_net_assets',end),shares=select('fund_shares_outstanding',end),nav=select('fund_nav_per_share',end);
  if(a&&l&&n){const difference=a.value-l.value-n.value;financials.validation.checks.push({year:end,check:'Fund total assets − liabilities = net assets',status:Math.abs(difference)<=1?'pass':'review',difference});}
  if(n&&shares?.value>0&&nav){const difference=n.value/shares.value-nav.value;financials.validation.checks.push({year:end,check:'Fund net assets / outstanding shares agrees with rounded NAV',status:Math.abs(difference)<=.011?'pass':'review',difference});}
 }
 financials.validation.status=financials.validation.checks.some(c=>c.status==='review')?'review':'checks_pass';
 const currentNav=select('fund_nav_per_share',latest),currentNet=select('fund_net_assets',latest),currentShares=select('fund_shares_outstanding',latest),lastYear=dates.at(-1),expense=select('fund_expense_ratio',lastYear,true),niiRatio=select('fund_nii_ratio',lastYear,true),annualNii=select('fund_net_investment_income',lastYear,true);
 const summary=(source.summaries||[]).filter(s=>s.as_of<=asOf&&s.filed&&s.filed<=asOf).sort((a,b)=>a.as_of.localeCompare(b.as_of)).at(-1)||{},price=quote?.ticker===record.ticker&&quote.currency==='USD'&&/^\d{4}-\d{2}-\d{2}T/.test(quote.asOf||'')&&Number.isFinite(Date.parse(quote.asOf))&&quote.asOf.slice(0,10)<=asOf&&Number.isFinite(quote.price)&&quote.price>0?quote.price:null;
 financials.review_sources={provider:'SEC shareholder reports',quote_as_of:price===null?null:quote.asOf};
 financials.fund={nav_per_share:currentNav?.value??null,nav_as_of:currentNav?.end,net_assets:currentNet?currentNet.value/1e6:null,shares_outstanding:currentShares?.value??null,monthly_distribution_per_share:summary.monthly_distribution_per_share??null,annualized_distribution_per_share:summary.annualized_distribution_per_share??null,distribution_per_share:summary.annualized_distribution_per_share??null,distribution_period:summary.as_of,expense_ratio:expense?.value??null,net_investment_income_ratio:niiRatio?.value??null,net_investment_income:annualNii?annualNii.value/1e6:null,annual_period:lastYear,source_url:currentNav?.source_url||summary.source_url};
 return {financials,profile:{currency:'USD',name:source.name,industry:'Closed-End Investment Fund',notes_key:String(source.cik),annual_filing:loadedSources.filter(s=>s.form==='N-CSR').at(-1)?.url,source_summary:'SEC shareholder reports · fund statements',source_notice:'Fund figures are from SEC N-CSR/N-CSRS shareholder reports. NAV is dated '+latest+'. Corporate P/E, operating margins and ROIC are not assigned to fund investment operations.'},price:price===null?null:{...quote},historical_prices:{},dividends:[]};
}
let manifestPromise,manifestRetryAt=0;const files=new Map(),fileRetryAt=new Map();
export async function loadFundReport(record,profile={},quote=null,fetcher=fetch){
 try{
  if(Date.now()<manifestRetryAt)return null;
  manifestPromise??=fetcher(String(new URL('./data/funds/manifest.json',import.meta.url)),{signal:AbortSignal.timeout(5000)}).then(r=>{if(!r.ok)throw Error('Fund manifest unavailable');return r.json();}).catch(()=>{manifestPromise=undefined;manifestRetryAt=Date.now()+60000;return null;});
  const manifest=await manifestPromise,entry=manifest?.funds?.[String(Number(record.cik))];
  if(!entry||entry.ticker!==record.ticker||!/^CIK\d+-[a-f0-9]{16}\.json$/.test(entry.file||''))return null;
  if(Date.now()<(fileRetryAt.get(entry.file)||0))return null;
  if(!files.has(entry.file)){if(files.size>=4)files.delete(files.keys().next().value);files.set(entry.file,fetcher(String(new URL('./data/funds/'+entry.file,import.meta.url)),{signal:AbortSignal.timeout(10000)}).then(async r=>{if(!r.ok)throw Error('Fund cache unavailable');return r.json();}).catch(error=>{files.delete(entry.file);fileRetryAt.set(entry.file,Date.now()+60000);throw error;}));}
  return toFundReport(await files.get(entry.file),{...record,...profile,ticker:record.ticker,cik:record.cik},quote);
 }catch{return null;}
}

export function fundDefinition(id){
 const titles={fund_expense_ratio:'Expense Ratio',fund_nii_ratio:'Net Investment Income / Net Assets',fund_turnover_ratio:'Portfolio Turnover'};
 const row=Object.values(fundRows).flat().find(r=>r[0]===id),title=row?.[1]||titles[id];if(!title)return null;
 const formulas={fund_nav_per_share:'Reported net assets ÷ reported shares outstanding',fund_expense_ratio:'Reported annual expenses after fee waivers ÷ average net assets × 100',fund_nii_ratio:'Reported annual net investment income ÷ average net assets × 100',fund_turnover_ratio:'Reported portfolio turnover ratio'};
 return {id,title,group:'Fund Financial Statements',formula:formulas[id]||'Reported '+title.toLowerCase()+' in the shareholder report.'};
}
