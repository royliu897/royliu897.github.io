// Endpoint eligibility is shared by on-demand explanations and offline audits.
// It never interpolates, changes the lookback, or assigns zero to missing data.
const rows={Revenue:['income_statement','revenue'],EPS:['income_statement','eps_diluted'],FCF:['cash_flow','free_cash_flow'],Assets:['balance_sheet','total_assets'],Equity:['balance_sheet','shareholders_equity'],Premiums:['income_statement','premiums_earned'],'Net Int. Income':['income_statement','net_interest_income'],'Gross Loans':['balance_sheet','gross_loans'],'Earning Assets':['balance_sheet','_earning_assets'],Deposits:['balance_sheet','deposits']};
export function cagrAssessment(financials,label,group){
 const match=/^(\d+)-Year CAGR$/.exec(group),binding=rows[label];if(!match||!binding||!financials)return null;
 const years=Number(match[1]),columns=(financials.columns||[]).filter(c=>/^\d{4}$/.test(c)).sort(),endPeriod=columns.at(-1),startPeriod=endPeriod?String(Number(endPeriod)-years):null;
 const row=financials[binding[0]]?.find(r=>r.key===binding[1]),start=row?.values?.[startPeriod],end=row?.values?.[endPeriod],base={label,years,start_period:startPeriod,end_period:endPeriod,start,end,metric_key:binding[1],unit:row?.is_per_share||label==='EPS'?'per share':'million'};
 if(!years||!endPeriod)return {...base,status:'unavailable',reason:'Annual history is unavailable.'};
 const absent=[[startPeriod,start],[endPeriod,end]].filter(([,v])=>!Number.isFinite(v));
 if(absent.length){const unresolved=absent.some(([period])=>row?.availability?.[period]?.status==='unresolved');return {...base,status:unresolved?'unresolved':'unavailable',reason:(unresolved?'Unresolved':'Missing')+' '+label+' for '+absent.map(([period])=>period).join(' and ')+'.'};}
 if(start<=0||end<=0)return {...base,status:'ineligible',reason:'CAGR requires positive starting and ending values.'};
 const rate=Math.expm1((Math.log(end)-Math.log(start))/years);
 if(!Number.isFinite(rate))return {...base,status:'unresolved',reason:'The endpoint calculation is not finite.'};
 return {...base,status:'available',rate,reason:''};
}
export function cagrEndpointText(info){
 const number=v=>Number.isFinite(v)?new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v).replace('-','−'):'—';
 return info?.start_period?info.start_period+': '+number(info.start)+' → '+info.end_period+': '+number(info.end)+' '+info.unit:'';
}
export function cagrBlankDefinition(info){
 return {id:'cagr:'+info.label+':'+info.years,title:info.label,group:info.years+'-Year CAGR · '+({ineligible:'Not meaningful',unavailable:'Unavailable',unresolved:'Unresolved',available:'Review'}[info.status]),formula:info.status==='available'?'Positive endpoints are available; this missing calculation needs review.':info.reason,detail:cagrEndpointText(info)};
}
export function auditCagrGroups(financials,groups){
 const cells=[],issues=[];
 for(const group of groups)for(const item of group.items||[]){const info=cagrAssessment(financials,item.label,group.title);if(!info)continue;
  const blank=item.value==='—'||item.value===undefined||item.value===null,number=typeof item.value==='string'&&item.value.endsWith('%')?Number(item.value.slice(0,-1)):NaN;
  let issue;if(info.status==='available'&&blank)issue='eligible_but_blank';else if(info.status!=='available'&&!blank)issue='ineligible_but_displayed';else if(info.status==='available'&&(!Number.isFinite(number)||Math.abs(number-info.rate*100)>.050001))issue='incorrect_result';
  const cell={...info,displayed:item.value,...(issue?{issue}:{})};cells.push(cell);if(issue)issues.push(cell);
 }
 return {cells,issues};
}
