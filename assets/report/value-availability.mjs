import {sourceNames} from './primary-bindings.mjs?v=ced40ecbac9d';
import {templateConcepts} from './statement-source-policy.mjs?v=ced40ecbac9d';
import {concepts} from './concept-registry.mjs?v=ced40ecbac9d';
const derived=new Set(['total_debt','gross_profit','total_operating_expenses','gross_loans','short_term_debt','long_term_debt','total_noncurrent_liabilities','total_liabilities_equity','net_income_continuing','cf_capex','cf_acquisitions','cf_investments','cf_net_stock','cf_net_preferred','cf_debt_net','cf_working_capital','free_cash_flow','other_equity','cf_other_operating','cf_other_investing','cf_other_financing']);
const reasons={
 missing_binding:'No reviewed mapping for this field.',
 not_in_loaded_feed:'No matching value in the loaded sources.',
 dependency_missing:'Required source inputs are missing.',
 ttm_inputs_missing:'Not enough data to calculate TTM.',
 share_basis_unresolved:'Share basis unresolved; value withheld.',
 conflicting_source:'Conflicting or excluded source observations.',
 ineligible_context:'Related data has a different unit, period or scope.',
 broader_cash:'Related cash values include restricted cash or only a component.',
 source_scope:'Related data has a different accounting scope.'
};
export function attachValueAvailability(data,financials,{currency,symbol,annualSource,registry:activeRegistry}={}){
 const registry=activeRegistry||templateConcepts(concepts,financials.company_type),basis=financials.share_basis?.observations||[],exclusions=financials.source_selection?.excluded_observations||[];
 const tagged=new Map(),excludedByCell=new Map(),unresolvedBasis=new Set(basis.filter(p=>p.basis_status==='unresolved').map(p=>p.metric_key+'|'+p.period));
 for(const p of exclusions){const key=p.key+'|'+p.end;if(!excludedByCell.has(key))excludedByCell.set(key,p);}
 function observationsAtEnd(name,end){
  if(!tagged.has(name)){const groups=new Map(),fact=data.facts?.[name];for(const [unit,ps]of Object.entries(fact?.units||{}))for(const p of ps)if(!p.filed||p.filed<=data.asOf){if(!groups.has(p.end))groups.set(p.end,[]);groups.get(p.end).push({p,unit,fact});}tagged.set(name,groups);}
  return tagged.get(name).get(end)||[];
 }
 for(const table of ['income_statement','balance_sheet','cash_flow'])for(const row of financials[table]){
  if(row.key.startsWith('_'))continue;const registryKey=financials.company_type==='insurance'&&row.key==='receivables'?'accounts_receivable':row.key,aliases=sourceNames(data,registry[registryKey]?.[0]||[],registryKey),type=registry[registryKey]?.[1]||'duration';
  row.source_context={concepts:aliases,currency,source_url:annualSource||null,inspect_href:symbol?'#/company/'+symbol.replace(':','.')+'/unmapped':null};
  const missing={};
  for(let i=0;i<financials.columns.length;i++){
   const period=financials.columns[i];if(Number.isFinite(row.values[period]))continue;const end=financials.period_dates[i];let status='unavailable',code='not_in_loaded_feed';
   const observations=aliases.flatMap(name=>observationsAtEnd(name,end));
   if(!aliases.length&&!derived.has(row.key)){status='unmapped';code='missing_binding';}
   else if(derived.has(row.key))code='dependency_missing';
   if(period==='TTM')code='ttm_inputs_missing';
   if(observations.some(({p,unit,fact})=>unit!==(type==='shares'?'shares':type==='per-share'?currency+'/shares':currency)||fact.namespace&&!['us-gaap','ifrs-full','dei'].includes(fact.namespace)&&!fact.mapping_approved)){status='ineligible';code='ineligible_context';}
   const excluded=excludedByCell.get(row.key+'|'+end);if(excluded){status=/conflict/i.test(excluded.reason||'')?'unresolved':'ineligible';code=status==='unresolved'?'conflicting_source':'source_scope';}
   if(row.key==='cash'&&!observations.length&&['CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents','CashEquivalentsAtCarryingValue','CashAndDueFromBanks'].some(name=>observationsAtEnd(name,end).length>0)){status='ineligible';code='broader_cash';}
   if(observations.length&&observations.every(({p})=>p.unresolved||p.excluded_from_mapping)){status='unresolved';code='conflicting_source';}
   if(unresolvedBasis.has(row.key+'|'+period)){status='unresolved';code='share_basis_unresolved';}
   missing[period]={status,code,...(end?{end}:{}),...(excluded?{policy_reason:excluded.reason}:{})};
  }
  if(Object.keys(missing).length)row.availability=missing;
 }
 financials.availability_policy={version:1,scope:'Reasons describe the loaded sources and configured mappings; unavailable is not a claim that a company did not disclose a value.'};
}
export function missingValueDefinition(row,period){
 const info=row.availability?.[period]||{status:'unavailable',code:'not_in_loaded_feed'};
 return {id:'missing:'+row.key+':'+period,title:row.label,group:info.status.charAt(0).toUpperCase()+info.status.slice(1)+' · '+period,formula:reasons[info.code]||reasons.not_in_loaded_feed,...(info.policy_reason?{detail:info.policy_reason}:{}),source_url:row.source_context?.source_url,inspect_href:row.source_context?.inspect_href,source_tags:row.source_context?.concepts||[]};
}
