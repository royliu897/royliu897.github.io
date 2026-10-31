// A compact view of loaded-source evidence, never a filing completeness score.
const tables=['income_statement','balance_sheet','cash_flow'];
const titles={reported:'Reported',derived:'Calculated',available:'Available',unmapped:'Unmapped',unresolved:'Unresolved',ineligible:'Different scope',unavailable:'Not in loaded sources',not_disclosed:'Not disclosed'};
const explanation={unmapped:'No reviewed mapping is configured for this field.',unresolved:'Conflicting observations or an unresolved share basis prevent selection.',ineligible:'A related observation has a different scope, context or unit.',unavailable:'The loaded sources do not provide eligible inputs. This is not evidence that the filing omits the field.',not_disclosed:'The reviewed source explicitly establishes that this field is not disclosed.'};
export const reviewStatusLabel=status=>titles[status]||titles.unavailable;
export function reviewPeriods(data){return (data?.columns||[]).filter(c=>c!=='TTM').slice().reverse();}
export function buildDataReview(data,period=reviewPeriods(data)[0]){
 const fields=tables.flatMap(table=>(data?.[table]||[]).filter(row=>!row.key.startsWith('_')).map(row=>{
  const value=row.values?.[period],provenance=row.provenance?.[period],info=row.availability?.[period];
  const normalized=Number.isFinite(provenance?.factor)&&provenance.factor!==1;
  const status=Number.isFinite(value)?provenance?.calculation||provenance?.derived||normalized?'derived':provenance?.accn||provenance?.source_url?'reported':'available':info?.status||'unavailable';
  return {id:table+'|'+row.key,key:row.key,table,label:row.label,period,status,value:Number.isFinite(value)?value:null,reason:provenance?.calculation||(normalized?'Reported observation adjusted to the target share basis. See Share basis details for the factor and evidence.':provenance?.derived?'Calculated from multiple source observations.':null)||info?.policy_reason||explanation[status]||'Selected from the loaded observations.',source_url:provenance?.source_url||(/^\d{10}-\d{2}-\d{6}$/.test(provenance?.accn||'')&&/^\d+$/.test(String(provenance?.source_cik||data.cik))?'https://www.sec.gov/Archives/edgar/data/'+Number(provenance?.source_cik||data.cik)+'/'+provenance.accn.replaceAll('-','')+'/':null),accessions:provenance?.source_accessions||[provenance?.accn].filter(Boolean),filed:provenance?.filed||null,end:provenance?.end||info?.end||null,source_tags:row.source_context?.concepts||[]};
 }));
 const end=data?.period_dates?.[data?.columns?.indexOf(period)],checks=(data?.validation?.checks||[]).filter(c=>c.year===period||end&&c.year===end),shown=fields.filter(f=>f.value!==null).length;
 const flagged=fields.filter(f=>['unmapped','unresolved','ineligible'].includes(f.status));
 return {period,fields,checks,shown,gaps:fields.length-shown,flagged,review_count:flagged.length+checks.filter(c=>c.status==='review').length};
}
export function reviewSnapshot(payload){
 const data=payload.financials,profile=payload.profile||{};
 if(profile.reporting_currency&&profile.currency!==profile.reporting_currency)throw Error('Audit snapshots require native-currency payloads, before display FX conversion.');
 return {version:1,cik:String(data.cik||''),symbol:data.ticker,currency:profile.reporting_currency||profile.currency,knowledge_as_of:data.knowledge_as_of||null,periods:reviewPeriods(data).map(period=>{const review=buildDataReview(data,period);return {period,fields:review.fields,checks:review.checks};})};
}
export function compareReviewSnapshots(before,after){
 if(before.cik!==after.cik||before.symbol!==after.symbol)throw Error('Cannot compare different securities.');
 const changes=[];
 if(before.currency!==after.currency)changes.push({type:'currency_changed',before:before.currency,after:after.currency});
 const periods=new Map(after.periods.map(p=>[p.period,p]));
 for(const old of before.periods){const next=periods.get(old.period);if(!next){changes.push({type:'period_removed',period:old.period});continue;}
  const fields=new Map(next.fields.map(f=>[f.id,f]));
  for(const field of old.fields){if(field.value===null)continue;const current=fields.get(field.id);
   if(!current||current.value===null)changes.push({type:'value_removed',period:old.period,field:field.label,before:field.value,status:current?.status||'row_removed'});
   else if(current.value!==field.value)changes.push({type:'value_changed',period:old.period,field:field.label,before:field.value,after:current.value,before_accessions:field.accessions,after_accessions:current.accessions});
  }
 }
 return changes;
}
export function createDataReview(React){
 const h=React.createElement;
 return function DataReview({data}){
  const periods=reviewPeriods(data),[open,setOpen]=React.useState(false),[view,setView]=React.useState('review'),[chosen,setChosen]=React.useState(null),[expanded,setExpanded]=React.useState(null),[filter,setFilter]=React.useState('all'),[limit,setLimit]=React.useState(12);
  const id=React.useId(),period=periods.includes(chosen)?chosen:periods[0];
  React.useEffect(()=>{setOpen(false);setView('review');setChosen(null);setExpanded(null);setFilter('all');setLimit(12);},[data?.cik,data?.ticker,data?.mapping_audit?.period]);
  const review=React.useMemo(()=>open?buildDataReview(data,period):null,[data,period,open]);
  function changeView(next){setView(next);setExpanded(null);setLimit(12);}
  function detailLink(url,label){return /^https:\/\//.test(url||'')?h('a',{href:url,target:'_blank',rel:'noopener noreferrer'},label):null;}
  function item(key,title,status,content){const active=expanded===key,detail=id+'-'+key.replace(/[^a-z0-9_-]/gi,'-');return h('li',{key},h('button',{type:'button',className:'report-review-item','aria-expanded':active,'aria-controls':detail,onClick:()=>setExpanded(active?null:key)},h('span',null,title),h('span',{className:'report-review-status'},status,' ',active?'−':'+')),active&&h('div',{className:'report-review-detail',id:detail},content));}
  function fieldItem(field){return item(field.id,field.label,reviewStatusLabel(field.status),h(React.Fragment,null,h('p',null,field.reason),field.filed&&h('p',null,'Filed '+field.filed+(field.end?' · period ended '+field.end:'')),detailLink(field.source_url,'Open source filing')));}
  const primary=data?.primary_filing_supplement,source=data?.review_sources;
  const sources=[...(primary?.sources||[]),...(data?.source_coverage?.sources||[])].filter((s,i,all)=>all.findIndex(p=>(p.url||p.accession)===(s.url||s.accession))===i).sort((a,b)=>String(b.date||b.filed||b.period||'').localeCompare(String(a.date||a.filed||a.period||'')));
  let content=null;
  if(open&&review){
   if(view==='sources')content=h(React.Fragment,null,h('p',{className:'report-review-caption'},source?.provider||data?.native_provider||'Loaded statement sources',source?.fetched_at?' · retrieved '+source.fetched_at.slice(0,10):''),source?.quote_as_of&&h('p',{className:'report-review-caption'},'Price timestamp: '+source.quote_as_of.replace('T',' ').replace('.000Z',' UTC')),data?.mapping_audit?.display_translation?.fx?.asOf&&h('p',{className:'report-review-caption'},'Display FX: '+data.mapping_audit.display_translation.fx.asOf),h('ul',{className:'report-review-list'},...sources.slice(0,limit).map((s,i)=>item('source-'+i,(s.form||'Statement')+' · '+(s.period||s.date||s.filed||'Date unavailable'),s.date||s.filed||'',h(React.Fragment,null,h('p',null,s.accession||'Primary source report'),detailLink(s.url,'Open source report'))))),!sources.length&&h('p',{className:'report-review-caption'},primary?.reason||'No additional filing metadata was loaded.'),sources.length>limit&&h('button',{type:'button',className:'report-review-more',onClick:()=>setLimit(limit+12)},'Show more sources'));
   else if(view==='fields'){
    const fields=review.fields.filter(f=>filter==='all'||filter==='gaps'&&f.value===null||filter==='shown'&&f.value!==null);
    content=h(React.Fragment,null,h('label',{className:'report-review-filter'},'Show ',h('select',{value:filter,onChange:e=>{setFilter(e.target.value);setExpanded(null);setLimit(12);},'aria-label':'Filter reviewed fields'},h('option',{value:'all'},'All template fields'),h('option',{value:'gaps'},'Fields with gaps'),h('option',{value:'shown'},'Fields shown'))),h('ul',{className:'report-review-list'},...fields.slice(0,limit).map(fieldItem)),fields.length>limit&&h('button',{type:'button',className:'report-review-more',onClick:()=>setLimit(limit+12)},'Show more fields'));
   }else{
    const items=[...review.checks.filter(c=>c.status==='review').map((c,i)=>item('check-'+i,c.check,'Review',h(React.Fragment,null,h('p',null,c.note||'The available observations do not reconcile within the configured tolerance.'),h('p',null,'Difference: '+new Intl.NumberFormat('en-US',{maximumFractionDigits:4}).format(c.difference)+(c.currency?' '+c.currency:'')),c.source_accessions?.length>0&&h('p',{className:'report-review-tags'},c.source_accessions.join(', '))))),...review.flagged.map(fieldItem)];
    content=h(React.Fragment,null,h('p',{className:'report-review-caption'},review.shown+' fields shown · '+review.gaps+' gaps · '+review.checks.filter(c=>c.status==='pass').length+' accounting checks passed'),h('p',{className:'report-review-caption'},'Checks cover loaded sources, not complete filing disclosure. Unavailable fields may be undisclosed or outside the loaded data.'),items.length?h('ul',{className:'report-review-list'},...items.slice(0,limit)):h('p',{className:'report-review-empty'},'No flagged items for this period. '+(review.checks.length?'':'No independent accounting checks could be assessed.')),items.length>limit&&h('button',{type:'button',className:'report-review-more',onClick:()=>setLimit(limit+12)},'Show more items'));
   }
  }
  return h('details',{className:'report-data-review',open,onToggle:e=>setOpen(e.currentTarget.open)},h('summary',null,'Data review',h('span',null,' · '+(period||'No reporting period'))),open&&h('div',{className:'report-review-body'},h('div',{className:'report-review-toolbar'},h('div',{className:'report-review-switch',role:'group','aria-label':'Data review sections'},...['review','fields','sources'].map(v=>h('button',{key:v,type:'button','aria-pressed':view===v,onClick:()=>changeView(v)},v[0].toUpperCase()+v.slice(1)))),view!=='sources'&&h('select',{'aria-label':'Review period',value:period||'',onChange:e=>{setChosen(e.target.value);setExpanded(null);setLimit(12);}},...periods.map(p=>h('option',{key:p,value:p},p)))),content));
 };
}
