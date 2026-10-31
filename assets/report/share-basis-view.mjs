const finite=Number.isFinite;
export function shareBasisRows(basis){
 return (basis?.observations||[]).filter(o=>o.basis_status==='unresolved'||o.basis_status==='inferred'||finite(o.factor)&&o.factor!==1).slice().sort((a,b)=>(b.basis_status==='unresolved')-(a.basis_status==='unresolved')||String(b.period).localeCompare(String(a.period))||a.metric.localeCompare(b.metric));
}
export function shareClassLabel(source){const match=source?.identity?.match(/^StatementClassOfStockAxis:([A-Z0-9]+)$/);return match?'Class '+match[1]:source?.ticker||'';}
export function shareActionLabel(event){
 const type=event.type||'',ratio=event.ratio;
 if(type==='spin_off')return 'Spin-off · no share conversion';
 if(!['split','stock_split','reverse_split','stock_dividend'].includes(type)||!finite(ratio)||ratio<=0)return type==='unclassified_action'?'Unclassified action':type.replaceAll('_',' ')||'Action';
 const number=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:6}).format(n);
 const label=type==='stock_dividend'?'stock dividend':ratio<1?'reverse split':'split';
 return (ratio<1?'1:'+number(1/ratio):number(ratio)+':1')+' '+label;
}
export function createShareBasisView(React){
 const h=React.createElement;
 return function ShareBasis({basis,companyKey}){
  const [view,setView]=React.useState('events'),[limit,setLimit]=React.useState(8);
  React.useEffect(()=>{setView('events');setLimit(8);},[companyKey,basis?.source_class?.identity,basis?.policy?.target_share_basis]);
  if(!basis)return null;
  const rows=shareBasisRows(basis),events=[...(basis.events||[]),...(basis.non_share_actions||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const unresolved=rows.filter(o=>o.basis_status==='unresolved').length;
  if(!events.length&&!rows.length&&!basis.source_class)return null;
  const target=basis.policy?.target_share_basis,knowledge=basis.policy?.knowledge_as_of,shareClass=shareClassLabel(basis.source_class);
  const link=(url,label)=>/^https:\/\//.test(url||'')?h('a',{href:url,target:'_blank',rel:'noopener noreferrer'},label):null;
  function filing(o){if(o.source_url)return o.source_url;return /^\d+$/.test(String(companyKey))&&/^\d{10}-\d{2}-\d{6}$/.test(o.accn||'')?'https://www.sec.gov/Archives/edgar/data/'+Number(companyKey)+'/'+o.accn.replaceAll('-','')+'/':null;}
  const more=(count,label)=>count>limit&&h('button',{type:'button',className:'report-review-more',onClick:()=>setLimit(limit+8)},label);
  const eventRows=events.slice(0,limit).map((e,i)=>{
   const sources=e.sources||[],source=sources.find(s=>/sec/i.test(s.source||''))||sources[0];
   return h('li',{key:e.id||e.date+'-'+i},h('span',null,e.date+' · '+shareActionLabel(e)),link(e.source_url||source?.url,'Source'));
  });
  const valueRows=rows.slice(0,limit).map((o,i)=>h('tr',{key:i},
   h('td',null,link(filing(o),o.period)||o.period),h('td',null,o.metric),
   h('td',null,finite(o.factor)?new Intl.NumberFormat('en-US',{maximumFractionDigits:6}).format(o.factor):'—'),h('td',null,o.basis_status)));
  const valuesTable=h('table',{className:'report-share-adjustments'},
   h('thead',null,h('tr',null,...['Period','Metric','Factor','Basis'].map(text=>h('th',{key:text,scope:'col'},text)))),h('tbody',null,...valueRows));
  const content=view==='events'
   ?h(React.Fragment,null,events.length?h('ul',{className:'report-share-events'},...eventRows):h('p',null,'No share-changing events loaded.'),more(events.length,'Show older events'))
   :h(React.Fragment,null,rows.length?valuesTable:h('p',null,'No adjustments needed for loaded values.'),more(rows.length,'Show more adjustments'));
  const toolbar=h('div',{className:'report-share-basis-toolbar'},h('div',{className:'report-review-switch',role:'group','aria-label':'Share basis sections'},
   ...['events','values'].map(v=>h('button',{key:v,type:'button','aria-pressed':view===v,onClick:()=>{setView(v);setLimit(8);}},v==='events'?'Events':'Adjustments'))));
  const dateLine=[shareClass,target?'Adjusted through '+target:null,knowledge&&knowledge!==target?'Data as of '+knowledge:null].filter(Boolean).join(' · ');
  return h('details',{className:'report-share-basis'},h('summary',null,'Share basis',unresolved?h('span',null,' · '+unresolved+' unresolved'):null),
   h('div',{className:'report-share-basis-body'},toolbar,h('p',{className:'report-share-basis-date'},dateLine),content));
 };
}
