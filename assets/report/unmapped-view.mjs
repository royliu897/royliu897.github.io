export function createUnmappedView(React){
 const h=React.createElement;
 function rawFormat(value,unit,scale){
  const scaled=/^[A-Z]{3}$/.test(unit)||unit==='shares';
  const divisor=scaled?({thousands:1e3,millions:1e6,billions:1e9}[scale]||1):1;
  return new Intl.NumberFormat('en-US',{maximumFractionDigits:divisor===1?8:3}).format(value/divisor);
 }
 return function UnmappedView({data,columns,unit='millions',formatHeader=x=>x}){
  const audit=data?.mapping_audit;
  const [query,setQuery]=React.useState(''),[limit,setLimit]=React.useState(50),[expanded,setExpanded]=React.useState(null);
  React.useEffect(()=>{setQuery('');setLimit(50);setExpanded(null);},[audit?.cik,audit?.period]);
  if(!audit)return h('p',{className:'report-unmapped-note'},'No structured source facts are available to inspect.');
  const search=query.trim().toLowerCase(),visibleColumns=columns.filter(c=>c!=='TTM');
  const rows=audit.rows.filter(row=>visibleColumns.some(c=>row.observations[c])&&(!search||`${row.tag} ${row.label} ${row.unit}`.toLowerCase().includes(search)));
  function exportData(){
   const blob=new Blob([JSON.stringify(audit,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
   anchor.href=url;anchor.download=`unmapped-${audit.cik}-${audit.period}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function sourceCell(row,column){
   const p=row.observations[column];
   const title=p?`Reported ${p.reported_value??p.value} ${p.reported_unit||row.unit}; ${p.start?p.start+' to ':''}${p.end}; filed ${p.filed}${p.conflicts?' · conflicting source observations':''}`:'';
   return h('td',{key:column,className:p?.value<0?'report-unmapped-negative':undefined},p?h(p.source_url?'a':'span',p.source_url?{href:p.source_url,target:'_blank',rel:'noopener noreferrer',title}:{title},p.unresolved||p.conflicts?'Conflict':rawFormat(p.value,row.unit,unit)):'—');
  }
  function sourceRow(row){
   const scaled=/^[A-Z]{3}$/.test(row.unit)||row.unit==='shares';
   const header=h('th',{scope:'row'},
    h('button',{type:'button',className:'report-unmapped-tag','aria-expanded':expanded===row.key,onClick:()=>setExpanded(expanded===row.key?null:row.key),title:row.label},row.label||row.tag),
    h('small',null,`${row.unit}${scaled?' · '+unit:''} · ${row.kind}`));
   const detail=expanded===row.key&&h('tr',{className:'report-unmapped-definition'},h('td',{colSpan:visibleColumns.length+1},
    h('strong',null,row.label),row.original_label&&h('p',null,row.original_label),h('p',null,row.description||'No source definition was supplied.'),h('p',null,`${row.tag} · ${row.unit} · ${row.kind}. Click a value to open its source filing.`)));
   return h(React.Fragment,{key:row.key},h('tr',null,header,...visibleColumns.map(c=>sourceCell(row,c))),detail);
  }
  const primary=data?.primary_filing_supplement,validation=data?.validation;
  const quality=h('details',{className:'report-unmapped-scope'},h('summary',null,'Data validation and filing coverage'),h('p',null,primary?'Primary filing cache: '+primary.status+'. '+(primary.scope||primary.reason||''):'Primary filing cache was not loaded.'),...(primary?.sources||[]).map(s=>h('p',{key:s.accession},h('a',{href:s.url,target:'_blank',rel:'noopener noreferrer'},s.form+' · '+s.period+' · filed '+s.date))),h('p',null,validation?.scope||'No validation results available.'),h('p',null,'Checks flag inconsistencies; passing checks do not establish complete or universally accurate data.'),...(validation?.checks||[]).filter(c=>c.status==='review').map((c,i)=>h('p',{key:i},c.year+': '+c.check+' — review required (difference '+new Intl.NumberFormat('en-US').format(c.difference)+').')),h('p',null,(primary?.conflicts?.length||0)+' primary candidate conflicts; '+(primary?.rejections?.length||0)+' scoped mappings withheld.'));
  const sourceDetails=h('details',{className:'report-unmapped-scope'},
   h('summary',null,'Source coverage and mapping assistance'),h('p',null,audit.scope),
   h('p',null,'AI mapping is not connected. No tags are matched by name similarity or added automatically. Export includes source definitions, periods, units and filing links for review.'),
   h('p',null,`Registry ${audit.registry.version}. Quarterly view separates standalone quarters, YTD and annual durations.`),
   h('p',null,...audit.registry.sources.map((source,i)=>h(React.Fragment,{key:source.url},i?' · ':'',h('a',{href:source.url,target:'_blank',rel:'noopener noreferrer'},source.label)))));
  const controls=h('div',{className:'report-unmapped-controls'},
   h('input',{type:'search','aria-label':'Filter unmapped tags',placeholder:'Filter raw tags or labels…',value:query,onChange:e=>{setQuery(e.target.value);setLimit(50);}}),
   h('span',{role:'status'},`${rows.length} source row${rows.length===1?'':'s'} · ${audit.unmapped_concepts} concepts across available periods`),
   h('button',{type:'button',onClick:exportData},'Export unmapped JSON'));
  const table=rows.length?h('div',{className:'report-unmapped-scroll'},h('table',{className:'report-unmapped-table'},
   h('thead',null,h('tr',null,h('th',null,'Source account / unit'),...visibleColumns.map(c=>h('th',{key:c},formatHeader(c))))),
   h('tbody',null,...rows.slice(0,limit).map(sourceRow)))):
   h('p',{className:'report-unmapped-note'},search?'No tags match this filter.':'No unregistered concepts were found for these periods. This does not establish complete filing coverage.');
  return h('section',{className:'report-unmapped','aria-label':'Unmapped source concepts'},
   h('p',{className:'report-unmapped-note'},'These source accounts are unmapped or contain excluded source conflicts. Some are footnote details or amounts already included in mapped totals or residual Other rows. An unmapped tag does not necessarily mean a missing statement row. Source values are not sign-flipped or split-adjusted; TTM is not calculated.'),
   quality,sourceDetails,controls,table,
   rows.length>limit&&h('button',{type:'button',className:'report-unmapped-more',onClick:()=>setLimit(limit+100)},`Show more (${rows.length-limit} remaining)`));
 };
}
