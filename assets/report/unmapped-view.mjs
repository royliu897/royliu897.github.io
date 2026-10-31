import {createDataReview} from './data-review.mjs?v=162d5e719d39';
export function createUnmappedView(React){
 const h=React.createElement,DataReview=createDataReview(React);
 function rawFormat(value,unit,scale){
  const scaled=/^[A-Z]{3}$/.test(unit)||unit==='shares';
  const divisor=scaled?({thousands:1e3,millions:1e6,billions:1e9}[scale]||1):1;
  return new Intl.NumberFormat('en-US',{maximumFractionDigits:divisor===1?8:3}).format(value/divisor);
 }
 return function UnmappedView({data,columns,unit='millions',formatHeader=x=>x}){
  const audit=data?.mapping_audit;
  const [query,setQuery]=React.useState(''),[limit,setLimit]=React.useState(50),[expanded,setExpanded]=React.useState(null);
  React.useEffect(()=>{setQuery('');setLimit(50);setExpanded(null);},[audit?.cik,audit?.period]);
  if(!audit)return h('section',{className:'report-unmapped'},h(DataReview,{data}),h('p',{className:'report-unmapped-note'},'No unmapped source inventory is available for this report.'));
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
  const quality=h(DataReview,{data});
  const controls=h('div',{className:'report-unmapped-controls'},
   h('input',{type:'search','aria-label':'Filter unmapped tags',placeholder:'Filter raw tags or labels…',value:query,onChange:e=>{setQuery(e.target.value);setLimit(50);}}),
   h('span',{role:'status'},`${rows.length} source row${rows.length===1?'':'s'} · ${audit.unmapped_concepts} concepts across available periods`),
   h('button',{type:'button',onClick:exportData},'Export unmapped JSON'));
  const table=rows.length?h('div',{className:'report-unmapped-scroll'},h('table',{className:'report-unmapped-table'},
   h('thead',null,h('tr',null,h('th',null,'Source account / unit'),...visibleColumns.map(c=>h('th',{key:c},formatHeader(c))))),
   h('tbody',null,...rows.slice(0,limit).map(sourceRow)))):
   h('p',{className:'report-unmapped-note'},search?'No tags match this filter.':'No unregistered concepts were found for these periods. This does not establish complete filing coverage.');
  return h('section',{className:'report-unmapped','aria-label':'Unmapped source concepts'},
   h('p',{className:'report-unmapped-note'},'Raw source details, including footnotes and components. Original signs and share basis.'),
   quality,controls,table,
   rows.length>limit&&h('button',{type:'button',className:'report-unmapped-more',onClick:()=>setLimit(limit+100)},`Show more (${rows.length-limit} remaining)`));
 };
}
