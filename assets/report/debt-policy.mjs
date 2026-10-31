// Preserve the issuer's debt scope; totals never substitute zero for a gap.
const valid=p=>p&&Number.isFinite(p.val)&&p.val>=0;
const at=(s,key,end)=>(s[key]||[]).find(p=>p.end===end);
export function deriveDebt(series,makePoint){
 const ends=new Set(['short_term_debt','long_term_debt','total_debt','_long_debt_total','_short_borrowings','_commercial_paper','_debt_current','_debt_lease_current','_debt_lease_noncurrent','_debt_lease_total'].flatMap(key=>(series[key]||[]).map(p=>p.end)));
 function put(key,p){if(!at(series,key,p.end))(series[key]??=[]).push(p);}
 for(const end of ends){
  const short=at(series,'_short_borrowings',end),paper=at(series,'_commercial_paper',end),leaseCurrent=at(series,'_debt_lease_current',end),leaseLong=at(series,'_debt_lease_noncurrent',end);
  if(!at(series,'long_term_debt',end)&&valid(leaseLong))put('long_term_debt',{...leaseLong,debt_scope:'includes_finance_leases'});
  let current=at(series,'_debt_current',end);
  if(valid(leaseCurrent)&&(!current||leaseCurrent.source_priority==='primary-statement'&&current.source_priority!=='primary-statement'))current={...leaseCurrent,debt_scope:'includes_finance_leases'};
  // ShortTermBorrowings is a total, commercial paper a component. Never add both.
  const borrowing=valid(short)?short:valid(paper)?{...paper,debt_partial:true}:null;
  if(!at(series,'short_term_debt',end)){
   if(valid(current)&&borrowing)put('short_term_debt',{...makePoint([current,borrowing],current.val+borrowing.val,'Current long-term debt + short-term borrowings'),debt_scope:current.debt_scope?'includes_current_finance_leases':'excludes_finance_leases',debt_partial:!!borrowing.debt_partial});
   else if(borrowing)put('short_term_debt',{...borrowing,debt_partial:true});
   else if(valid(current))put('short_term_debt',{...current,debt_partial:true});
  }
  let total=at(series,'total_debt',end);
  if(total){if(total.debt_statement_basis&&total.current_debt_separately_reported===false){series.short_term_debt=(series.short_term_debt||[]).filter(p=>p.end!==end||!p.debt_partial);}total.debt_scope=total.debt_scope||(total.source_concept?.endsWith(':LongTermDebt')?'excludes_finance_leases':'reported_basis');continue;}
  const currentTotal=at(series,'short_term_debt',end),long=at(series,'long_term_debt',end),whole=at(series,'_long_debt_total',end),wholeLeases=at(series,'_debt_lease_total',end);
  if(valid(currentTotal)&&!currentTotal.debt_partial&&valid(long)&&!long.debt_partial){
   const scope=long.debt_scope==='includes_finance_leases'?'includes_finance_leases':currentTotal.concept==='DebtCurrent'||currentTotal.debt_scope==='includes_current_finance_leases'?'includes_current_finance_leases':'excludes_finance_leases';
   total={...makePoint([currentTotal,long],currentTotal.val+long.val,'Reported current debt + noncurrent debt'),debt_scope:scope};
  }else if(valid(wholeLeases)&&valid(short))total={...makePoint([wholeLeases,short],wholeLeases.val+short.val,'Long-term debt and leases (all maturities) + short-term borrowings'),debt_scope:'includes_finance_leases'};
  else if(valid(whole)&&valid(short))total={...makePoint([whole,short],whole.val+short.val,'Long-term debt (all maturities) + short-term borrowings'),debt_scope:'excludes_finance_leases'};
  if(total)put('total_debt',total);
 }
}
export function investedCapital(equity,debt,scope,currentLease,noncurrentLease,nci){
 if(!Number.isFinite(equity)||!Number.isFinite(debt))return;
 const leases=scope==='includes_finance_leases'||scope==='reported_basis'?0:scope==='includes_current_finance_leases'?(noncurrentLease||0):(currentLease||0)+(noncurrentLease||0);
 return equity+debt+leases+(nci||0);
}
export function reportInvestedCapital(f,period){
 const row=key=>f.balance_sheet?.find(r=>r.key===key),value=key=>row(key)?.values?.[period];
 const equity=value('shareholders_equity'),total=value('total_debt');
 if(!Number.isFinite(equity))return;
 if(!Number.isFinite(total)){
  if(f.debt_policy_version)return;
  return equity+['short_term_debt','long_term_debt','noncurrent_capital_leases','minority_interest'].reduce((n,key)=>n+(value(key)||0),0);
 }
 return investedCapital(equity,total,row('total_debt')?.provenance?.[period]?.debt_scope,value('current_capital_leases'),value('noncurrent_capital_leases'),value('minority_interest'));
}
