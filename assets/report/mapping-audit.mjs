import {concepts,registryInfo} from './concept-registry.mjs?v=d4f1839989bb';

const registered=new Set(Object.values(concepts).flatMap(([names])=>names));
const DAY=86400000;
const labelFor=name=>name.replace(/([a-z])([A-Z])/g,'$1 $2');
function filingURL(cik,accession){return /^\d+$/.test(String(cik))&&/^\d{10}-\d{2}-\d{6}$/.test(accession||'')?`https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replaceAll('-','')}/`:null;}
function periodKind(point,quarterly){
 if(!point.start)return 'instant';
 const days=(Date.parse(point.end)-Date.parse(point.start))/DAY;
 if(!quarterly)return days>=330&&days<=380?'annual':null;
 if(days>=70&&days<=110)return 'quarter';
 if(days>110&&days<330)return 'YTD';
 if(days>=330&&days<=380)return 'annual';
 return null;
}

// An inventory of unregistered concepts in the loaded feed, not a claim that
// each one is a missing primary-statement row. No fuzzy/AI matching is active.
export function buildMappingAudit(data,financials,quarterly=false,activeConcepts=concepts){
 const registered=new Set(Object.values(activeConcepts).flatMap(([names])=>names));
 const cutoff=data.asOf,labels=new Map(financials.columns.flatMap((label,i)=>label!=='TTM'&&financials.period_dates[i]?[[financials.period_dates[i],label]]:[]));
 const rows=[];let unmappedConcepts=0;
 for(const [name,fact]of Object.entries(data.facts||{})){
  const mapped=registered.has(name)&&(!fact.namespace||['us-gaap','ifrs-full','dei'].includes(fact.namespace)||fact.mapping_approved);
  const groups=new Map();
  for(const [unit,points]of Object.entries(fact.units||{}))for(const p of points){
   if(mapped&&!p.unresolved&&!p.excluded_from_mapping)continue;
   if(!Number.isFinite(p.val)||!labels.has(p.end)||p.end>cutoff||!p.filed||p.filed>cutoff)continue;
   const kind=periodKind(p,quarterly);if(!kind)continue;
   const id=unit+':'+kind,group=groups.get(id)||{unit,kind,observations:new Map()},label=labels.get(p.end),old=group.observations.get(label);
   // Retain contradictory duplicate facts, rather than choosing a plausible value.
   if(!old||p.filed>old.filed||p.filed===old.filed&&String(p.accn||'')>String(old.accn||''))group.observations.set(label,{...p,conflicts:[]});
   else if(p.filed===old.filed&&p.accn===old.accn&&(p.start!==old.start||p.val!==old.val))old.conflicts.push({start:p.start,end:p.end,val:p.val});
   groups.set(id,group);
  }
  if(!groups.size)continue;unmappedConcepts++;
  for(const group of groups.values()){
   const namespace=fact.namespace||'unknown',tag=namespace+':'+(fact.source_name||name);
   rows.push({key:tag+':'+group.unit+':'+group.kind,tag,label:fact.label||labelFor(name),description:fact.description||'',original_label:fact.original_label,unit:group.unit,kind:group.kind,observations:Object.fromEntries([...group.observations].map(([label,p])=>[label,{start:p.start,end:p.end,value:p.val,filed:p.filed,accession:p.accn||null,source_url:p.source_url||filingURL(data.cik,p.accn),source_concept:p.source_concept||tag,...(p.unresolved?{unresolved:true,unresolved_reason:p.unresolved_reason,source_observations:p.source_observations}:{}),...(p.share_class?{share_class:p.share_class}:{}),...(p.conflicts.length?{conflicts:p.conflicts}:{} )}]))});
  }
 }
 rows.sort((a,b)=>a.tag.localeCompare(b.tag)||a.unit.localeCompare(b.unit)||a.kind.localeCompare(b.kind));
 return {registry:{...registryInfo,template:financials.company_type||'general',source_selection_policy:financials.source_selection?.policy||null},ai_status:'not_connected',cik:String(data.cik||financials.cik||''),as_of:cutoff,scope:'Unregistered numeric concepts in the loaded '+(data.provider||'SEC')+' feed at displayed period ends. Includes footnote details and overlapping totals; some amounts may already be included in mapped totals or residual Other rows. Not a list of proven missing statement rows. Custom and dimensional concepts absent from the loaded feed are outside this inventory.',period:quarterly?'quarterly':'annual',columns:financials.columns.filter(c=>c!=='TTM'),unmapped_concepts:unmappedConcepts,rows};
}
