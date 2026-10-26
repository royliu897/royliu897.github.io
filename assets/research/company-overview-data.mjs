export const fields=[
 ['revenue','Revenue',['RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','Revenue','SalesRevenueNet','RevenueFromContractWithCustomerIncludingAssessedTax']],
 ['profit','Net income',['NetIncomeLoss','ProfitLossAttributableToOwnersOfParent','ProfitLoss']],
 ['eps','Diluted EPS',['EarningsPerShareDiluted','DilutedEarningsLossPerShare'],'eps'],
 ['gross','Gross profit',['GrossProfit']],
 ['operating','Operating profit',['OperatingIncomeLoss','ProfitLossFromOperatingActivities']],
 ['cfo','Operating cash flow',['NetCashProvidedByUsedInOperatingActivities','CashFlowsFromUsedInOperatingActivities']],
 ['capex','Capital spending',['PaymentsToAcquirePropertyPlantAndEquipment','PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities']],
 ['dividends','Dividends per share',['CommonStockDividendsPerShareDeclared','DividendsRecognisedAsDistributionsToOwnersPerShare'],'eps'],
 ['cash','Cash',['CashAndCashEquivalentsAtCarryingValue','CashAndCashEquivalents'],'instant'],
 ['equity','Shareholders’ equity',['StockholdersEquity','EquityAttributableToOwnersOfParent'],'instant'],
 ['outstanding','Shares outstanding',['CommonStockSharesOutstanding','EntityCommonStockSharesOutstanding','NumberOfSharesOutstanding'],'instantShares'],
 ['shares','Diluted shares (avg.)',['WeightedAverageNumberOfDilutedSharesOutstanding','AdjustedWeightedAverageShares'],'shares']
];
export function reportingCurrencies(data){
 const facts=data.facts||{},fact=fields[0][2].map(k=>facts[k]).find(Boolean)||facts.Assets;
 return Object.entries(fact?.units||{}).filter(([u])=>/^[A-Z]{3}$/.test(u)).sort((a,b)=>b[1].filter(p=>!data.asOf||p.filed<=data.asOf).length-a[1].filter(p=>!data.asOf||p.filed<=data.asOf).length).map(([u])=>u);
}
export function buildOverview(data,frequency='year',requestedCurrency){
 const facts=data.facts||{},currencies=reportingCurrencies(data),currency=currencies.includes(requestedCurrency)?requestedCurrency:currencies[0],series={};if(!currency)return {currency:null,currencies,series,periods:[]};
 const selectedFields=fields.map(field=>field[0]==='eps'&&!field[2].some(name=>facts[name]?.units?.[currency+'/shares'])?['eps','Basic EPS',['EarningsPerShareBasic','BasicEarningsLossPerShare'],'eps']:field);
 const annual=/^(10-K|20-F|40-F)(\/A)?$/;
 for(const [id,label,names,type] of selectedFields){const byEnd=new Map(),unit=type==='eps'?currency+'/shares':['shares','instantShares'].includes(type)?'shares':currency;
 for(const name of names){for(const p of facts[name]?.units?.[unit]||[]){if(!Number.isFinite(p.val)||!/^\d{4}-\d{2}-\d{2}$/.test(p.end)||p.filed>data.asOf||p.end>data.asOf)continue;
 const days=p.start?(Date.parse(p.end)-Date.parse(p.start))/86400000:null;
 if(!['instant','instantShares'].includes(type)&&(days===null||(frequency==='year'?(days<330||days>380||(!annual.test(p.form)&&p.frequency!=='year')):(days<70||days>110))))continue;
 if(['instant','instantShares'].includes(type)&&frequency==='year'&&!annual.test(p.form)&&p.frequency!=='year')continue;
 const previous=byEnd.get(p.end);if(!previous||p.filed>previous.filed)byEnd.set(p.end,{date:p.end,start:p.start,value:p.val,filed:p.filed,accession:p.accn,unit,concept:name,url:p.url});
 }}series[id]={label,unit,points:[...byEnd.values()].sort((a,b)=>a.date.localeCompare(b.date))};}
 const periods=series.revenue.points.map(p=>p.date).slice(frequency==='year'?-10:-12);
 function derived(id,label,a,b,operation,unit){const right=new Map(series[b].points.map(p=>[p.date,p]));series[id]={label,unit,points:series[a].points.flatMap(p=>{const q=right.get(p.date);if(!q||p.start!==q.start)return [];const value=operation(p.value,q.value);return Number.isFinite(value)?[{...p,value,unit,concept:label,inputs:[p,q]}]:[];})};}
 derived('grossMargin','Gross margin','gross','revenue',(a,b)=>b?100*a/b:NaN,'%');derived('opMargin','Operating margin','operating','revenue',(a,b)=>b?100*a/b:NaN,'%');derived('netMargin','Net margin','profit','revenue',(a,b)=>b?100*a/b:NaN,'%');derived('fcf','CFO − capital spending','cfo','capex',(a,b)=>a-b,currency);
 return {currency,currencies,series,periods};
}
