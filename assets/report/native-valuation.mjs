import {validReportDate} from './report-dates.mjs?v=162d5e719d39';
// Shared valuation for all statement sources. Monetary rows are in millions;
// EPS/price are per selected share, current_shares is an actual share count.
const finite=Number.isFinite;
const dateOK=validReportDate;
export function reportValuation(price,f){
 if(!finite(price)||price<=0||!f)return null;
 const rows=new Map(['income_statement','balance_sheet','cash_flow'].flatMap(t=>(f[t]||[]).map(r=>[t+'|'+r.key,r]))),years=(f.columns||[]).filter(c=>/^\d{4}$/.test(c)).sort(),year=years.at(-1),bases={},reasons={};
 const flowBasis=(table,key,period)=>period==='TTM'&&year&&when(table,key,period)&&when(table,key,period)<=latestFYEnd?'FY '+year:period==='TTM'?'TTM':'FY '+period;
 const get=(table,key,p)=>rows.get(table+'|'+key)?.values?.[p];
 const latestFYEnd=year?(f.period_dates?.[f.columns?.indexOf(year)]||year+'-12-31'):[...(f.period_dates||[])].filter(Boolean).sort().at(-1)||'';
 const eligible=(table,key,p)=>p!=='TTM'||!rows.get(table+'|'+key)?.provenance?.TTM?.end||rows.get(table+'|'+key).provenance.TTM.end>=latestFYEnd;
 const when=(table,key,p)=>rows.get(table+'|'+key)?.provenance?.[p]?.end||f.period_dates?.[f.columns?.indexOf(p)]||null;
 function pick(table,keys,{instant=false}={}){
  for(const period of (instant?['TTM',...(f.columns||[]).filter(p=>p!=='TTM').sort((a,b)=>String(when(table,keys[0],b)||b).localeCompare(String(when(table,keys[0],a)||a)))]:['TTM',year]).filter(Boolean)){
   const values=keys.map(key=>get(table,key,period));if(!values.every(finite)||!keys.every(key=>eligible(table,key,period)))continue;
   const dates=keys.map(key=>when(table,key,period)).filter(Boolean);
   // Never combine different balance dates into an enterprise-value subtotal.
   if(instant&&(new Set(dates).size>1||dates.some(date=>date<latestFYEnd)))continue;
   return {period,values,date:dates[0],basis:instant?'Balance '+(dates[0]||period):flowBasis(table,keys[0],period)};
  }
  return null;
 }
 const result={marketCap:null,ev:null,pe:null,pb:null,ps:null,evToSales:null,evToEbitda:null,evToEbit:null,evToPretax:null,evToFcf:null,fcfYield:null,pPretax:null,pPremiums:null,evToPremiums:null,bases,reasons};
 function ratio(key,numerator,selection,denominator=selection?.values?.[0]){
  if(!finite(numerator)){reasons[key]='A verified current company value is unavailable.';return;}
  if(!selection||!finite(denominator)){reasons[key]='Required TTM and latest reported fiscal-year inputs are unavailable.';return;}
  bases[key]=selection.basis;
  if(denominator<=0){reasons[key]='The selected denominator is zero or negative; an older positive period is not substituted.';return;}
  result[key]=numerator/denominator;
 }
 // Prefer diluted EPS within each period, then basic. Missing TTM permits FY;
 // an available loss or zero is not a reason to select an older profitable FY.
 let eps;
 for(const period of ['TTM',year].filter(Boolean)){
  for(const key of ['eps_diluted','eps_basic'])if(finite(get('income_statement',key,period))&&eligible('income_statement',key,period)){eps={period,values:[get('income_statement',key,period)],basis:flowBasis('income_statement',key,period)+(key==='eps_basic'?' · basic EPS':'')};break;}
  if(eps)break;
 }
 if(['preferred','debt'].includes(f.security_kind)){eps=null;reasons.pe='Issuer common-share EPS does not value the selected preferred or debt security.';}
 ratio('pe',price,eps);
 const shares=f.current_shares,knowledge=f.knowledge_as_of||new Date().toISOString().slice(0,10),postEvent=(f.splits||[]).some(e=>(e.date||e.effective_date)>shares?.asOf&&(e.date||e.effective_date)<=knowledge);
 if(shares?.status==='available'&&finite(shares.common_outstanding)&&shares.common_outstanding>0&&dateOK(shares.asOf)&&shares.asOf<=knowledge&&!shares.multiple_classes&&!postEvent){result.marketCap=price*shares.common_outstanding/1e6;bases.marketCap='Outstanding shares '+shares.asOf;}
 else reasons.marketCap='A positive, dated outstanding-share count on the selected security basis is unavailable, or another share class/corporate action prevents company valuation.';
 const balance=f.debt_policy_version?pick('balance_sheet',['total_debt','cash'],{instant:true}):pick('balance_sheet',['short_term_debt','long_term_debt','cash'],{instant:true});
 if(finite(result.marketCap)&&balance){const debt=f.debt_policy_version?balance.values[0]:balance.values[0]+balance.values[1],cash=balance.values.at(-1);result.ev=result.marketCap+debt-cash;bases.ev=balance.basis;}
 else reasons.ev=finite(result.marketCap)?'Matching cash and debt balances are unavailable; missing amounts are not assumed to be zero.':reasons.marketCap;
 ratio('pb',result.marketCap,pick('balance_sheet',['shareholders_equity'],{instant:true}));
 const revenue=pick('income_statement',['revenue'])||(()=>{const p=pick('income_statement',['net_interest_income','noninterest_revenue']);return p?{...p,values:[p.values[0]+p.values[1]]}:null;})();
 ratio('ps',result.marketCap,revenue);
 ratio('pPretax',result.marketCap,pick('income_statement',['pretax_income']));
 ratio('pPremiums',result.marketCap,pick('income_statement',['premiums_earned']));
 ratio('evToSales',result.ev,revenue);
 ratio('evToEbit',result.ev,pick('income_statement',['operating_income']));
 ratio('evToPretax',result.ev,pick('income_statement',['pretax_income']));
 ratio('evToFcf',result.ev,pick('cash_flow',['free_cash_flow']));
 const fcf=pick('cash_flow',['free_cash_flow']);
 if(fcf&&finite(result.marketCap)&&result.marketCap>0){result.fcfYield=fcf.values[0]/result.marketCap*100;bases.fcfYield=fcf.basis;}else reasons.fcfYield='Free cash flow or verified market capitalization is unavailable.';
 ratio('evToPremiums',result.ev,pick('income_statement',['premiums_earned']));
 let ebitda;
 for(const period of ['TTM',year].filter(Boolean)){
  const op=get('income_statement','operating_income',period),da=get('cash_flow','cf_dna',period);
  const opSource=rows.get('income_statement|operating_income')?.provenance?.[period],daSource=rows.get('cash_flow|cf_dna')?.provenance?.[period],coherent=(!opSource?.end||!daSource?.end||opSource.end===daSource.end)&&(!opSource?.start||!daSource?.start||opSource.start===daSource.start);
  if(finite(op)&&finite(da)&&coherent&&eligible('income_statement','operating_income',period)&&eligible('cash_flow','cf_dna',period)){ebitda={values:[op+da],period,basis:flowBasis('income_statement','operating_income',period)};break;}
 }
 ratio('evToEbitda',result.ev,ebitda);
 const official=f.official_valuation,book=pick('balance_sheet',['shareholders_equity'],{instant:true});
 const officialAge=official?(Date.parse(knowledge)-Date.parse(official.asOf))/86400000:Infinity;
 if(official?.provider==='TWSE'&&official.currency==='TWD'&&validReportDate(knowledge)&&validReportDate(official.known_at)&&validReportDate(official.asOf)&&official.asOf<=official.known_at&&official.known_at<=knowledge&&officialAge>=0&&officialAge<=7){
  for(const key of ['pe','pb'])if(result[key]===null&&Number.isFinite(official[key])&&official[key]>0&&!(key==='pe'&&eps&&eps.values[0]<=0)&&!(key==='pb'&&book&&book.values[0]<=0)){
   result[key]=official[key];bases[key]='TWSE close '+official.asOf;delete reasons[key];
  }
 }
 result.basis=eps?.basis||'TTM / latest FY';
 if(f.company_type==='fund'){
  const fund=f.fund||{},nav=fund.nav_per_share;
  result.priceToNav=finite(nav)&&nav>0?price/nav:null;result.discountPremium=finite(nav)&&nav>0?(price/nav-1)*100:null;
  result.distributionYield=finite(fund.distribution_per_share)&&fund.distribution_per_share>=0?fund.distribution_per_share/price*100:null;
  result.fundAnnualBasis=fund.annual_period?'FY '+fund.annual_period.slice(0,4):'';result.expenseRatio=fund.expense_ratio??null;result.netInvestmentIncomeRatio=fund.net_investment_income_ratio??null;
  result.basis=nav?'NAV '+fund.nav_as_of:'Reported fund figures';
 }
 return result;
}
export const nativeValuation=reportValuation;

export const valuationKeys=Object.freeze({'P/E':'pe','P/B':'pb','P/S':'ps','EV/S':'evToSales','EV/EBITDA':'evToEbitda','EV/EBIT':'evToEbit','EV/Pretax':'evToPretax','EV/FCF':'evToFcf','FCF Yield':'fcfYield','P/Pretax':'pPretax','P/Premiums':'pPremiums','EV/Premiums':'evToPremiums'});
export function valuationCard(v={},type,format=value=>Number.isFinite(value)?String(value):'—'){
 if(type==='fund'){
  const percent=x=>Number.isFinite(x)?format(x)+'%':'—';
  return {title:'Fund Valuation'+(v?.basis?' · '+v.basis:''),items:[{label:'P/NAV',value:Number.isFinite(v.priceToNav)?v.priceToNav.toFixed(2):'—'},{label:'Discount / Premium',value:percent(v.discountPremium)},{label:'Annualized Distribution Yield',value:percent(v.distributionYield)},{label:'Expense Ratio',value:percent(v.expenseRatio)+(v.fundAnnualBasis?' · '+v.fundAnnualBasis:'')},{label:'Net Investment Income / Net Assets',value:percent(v.netInvestmentIncomeRatio)+(v.fundAnnualBasis?' · '+v.fundAnnualBasis:'')}]};
 }
 const labels=type==='bank'?['P/E','P/B','P/S','P/Pretax']:type==='insurance'?['P/E','P/B','P/S','P/Premiums','EV/Premiums','EV/S','EV/EBITDA','EV/Pretax']:['P/E','P/B','P/S','EV/S','EV/EBITDA','EV/EBIT','EV/Pretax','EV/FCF','FCF Yield'];
 return {title:'Valuation',items:labels.map(label=>{const key=valuationKeys[label],basis=v?.bases?.[key];return {label,value:format(v?.[key])+(key==='fcfYield'&&Number.isFinite(v?.[key])?'%':'')+(Number.isFinite(v?.[key])&&basis?.startsWith('FY ')?' · '+basis.replace(' · basic EPS',''):Number.isFinite(v?.[key])&&basis?.startsWith('TWSE close ')?' · TWSE':'')};})};
}

// Statistics windows use calendar years; gaps never become adjacent fiscal years.
export function annualCalendar(f){
 const years=(f.columns||[]).filter(c=>/^\d{4}$/.test(c)).sort();if(years.length<2)return f;
 const first=Number(years[0]),last=Number(years.at(-1));if(last-first+1===years.length)return f;
 const dates=new Map((f.columns||[]).map((c,i)=>[c,f.period_dates?.[i]])),columns=Array.from({length:last-first+1},(_,i)=>String(first+i));if(f.columns.includes('TTM'))columns.push('TTM');
 return {...f,columns,period_dates:columns.map(c=>dates.get(c)||c+'-12-31')};
}
