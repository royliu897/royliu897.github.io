// Primary statement bindings use exact captions, entity scope and units.
// This never searches prose or guesses from company/ticker names.
const clean=s=>String(s||'').toLowerCase().replace(/[^a-z]/g,'');
const debtCurrent=new Set(['DebtCurrent','LongTermDebtCurrent','LongTermDebtAndCapitalLeaseObligationsCurrent']);
const debtLong=new Set(['LongTermDebtNoncurrent','LongTermDebtAndCapitalLeaseObligations']);
const debtWhole=new Set(['LongTermDebt','LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities']);
function unique(points){return points.length&&new Set(points.map(p=>p.value)).size===1?points[0]:null;}
export function criticalStatementFacts(inv){
 const monetary=inv.facts.filter(p=>p.statement==='balance_sheet'&&!p.start&&!p.typed&&!p.dimensions?.length&&Number.isFinite(p.value)&&p.value>=0&&/^[A-Z]{3}$/.test(p.unit||'')&&p.end<=inv.filing.period&&p.accession===inv.filing.accession&&p.source_url===inv.filing.url&&p.filed===inv.filing.date),approved=[];
 for(const p of monetary){const label=clean(p.label);let key;
  if(p.balance_classification==='current_liabilities'&&/^(?:current)?leaseliabilit(?:y|ies)(?:net)?$/.test(label))key='reported_lease_liabilities_current';
  if(/^(?:longterm|noncurrent)leaseliabilit(?:y|ies)(?:net)?$/.test(label))key='reported_lease_liabilities_noncurrent';
  if(key)approved.push({...p,target_key:key,derived:false,mapping_rule:'Exact primary balance-sheet lease caption and classification'});
 }
 const groups=new Map();for(const p of monetary){const id=p.end+'|'+p.unit;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(p);}
 for(const rawPoints of groups.values()){
  const points=rawPoints.filter(p=>p.namespace==='us-gaap'&&/^https?:\/\/fasb.org\/us-gaap\//.test(p.namespace_uri||''));
  if(points.some(p=>p.name==='DebtLongtermAndShorttermCombinedAmount'||p.name==='LongTermDebt'&&/^(?:total)?debt$/.test(clean(p.label))))continue;
  const current=unique(points.filter(p=>debtCurrent.has(p.name))),long=unique(points.filter(p=>debtLong.has(p.name))),whole=unique(points.filter(p=>debtWhole.has(p.name)));
  const borrowingPoints=points.filter(p=>p.name==='ShortTermBorrowings'||p.name==='OtherShortTermBorrowings'&&/^shorttermborrowings/.test(clean(p.label))||p.name==='NotesAndLoansPayable'&&p.balance_classification==='current_liabilities'&&/^(?:loansandnotespayable|notesandloanspayable)$/.test(clean(p.label)));
  const short=unique(borrowingPoints.length?borrowingPoints:points.filter(p=>p.name==='CommercialPaper'&&p.balance_classification==='current_liabilities')); 
  let parts;
  if(long)parts=[long,...(current?[current]:[]),...(short&&current?.name!=='DebtCurrent'?[short]:[])];
  else if(whole&&!current)parts=[whole,...(short?[short]:[])];
  if(!parts?.length)continue;
  if(points.some(p=>p.name==='NotesAndLoansPayable'&&!borrowingPoints.includes(p)))continue;
  if(long&&whole&&whole.value!==long.value+(current?.value||0))continue;
  // A recognized line with contradictory amounts, or an issuer-specific debt
  // line we cannot classify, prevents claiming a complete statement total.
  if(rawPoints.some(p=>p.namespace!=='us-gaap'&&/^(?:current|noncurrent|longterm|shortterm)?(?:debt|borrowings|notespayable)(?:net)?$/.test(clean(p.label))))continue;
  if(points.some(p=>p.name==='ShortTermBorrowings')&&!short)continue;
  const scope=[long,whole].some(p=>p&&/AndCapitalLeaseObligations/.test(p.name))?'includes_finance_leases':current&&(current.name==='DebtCurrent'||/AndCapitalLeaseObligations/.test(current.name))?'includes_current_finance_leases':'excludes_finance_leases';
  // A conflicting recognized debt line makes the statement sum unresolved.
  if(points.some(p=>(debtCurrent.has(p.name)&&!current)||(debtLong.has(p.name)&&!long)||(debtWhole.has(p.name)&&!whole)))continue;
  approved.push({...parts[0],name:'PrimaryStatementDebt',qname:'report:PrimaryStatementDebt',namespace:'report',target_key:'total_debt',value:parts.reduce((n,p)=>n+p.value,0),derived:true,debt_scope:scope,debt_statement_basis:true,current_debt_separately_reported:!!current||!!short,source_concepts:parts.map(p=>p.qname),source_labels:parts.map(p=>p.label),mapping_rule:'Sum of disjoint debt lines on the primary balance sheet'});
 }
 return approved;
}

export function appendCriticalStatementFacts(result,inventories){
 for(const inv of inventories)for(const p of criticalStatementFacts(inv)){
  const name=p.qname,fact=result.facts[name]??={namespace:p.namespace,label:p.label,mapping_approved:true,units:{}};
  (fact.units[p.unit]??=[]).push({val:p.value,end:p.end,filed:p.filed,accn:p.accession,form:inv.filing.form,source_url:p.source_url,source_concept:p.qname,source_concepts:p.source_concepts,source_label:p.label,source_priority:'primary-statement',mapping_key:p.target_key,mapping_rule:p.mapping_rule,derived:p.derived?p.mapping_rule:undefined,source_sha256:inv.source_sha256,debt_scope:p.debt_scope,debt_statement_basis:p.debt_statement_basis,current_debt_separately_reported:p.current_debt_separately_reported});
 }
 return result;
}
