import {valuationKeys} from './native-valuation.mjs?v=d4f1839989bb';
import {missingValueDefinition} from './value-availability.mjs?v=d4f1839989bb';
import {createCurrencyDisplay} from './usd-display.mjs?v=d4f1839989bb';
import {createUnmappedView} from './unmapped-view.mjs?v=d4f1839989bb';
import {resolveDefinition,definitionById,definitionTokens} from './definition-graph.mjs?v=d4f1839989bb';
export {statisticFormula} from './definition-graph.mjs?v=d4f1839989bb';
export function createReportFeatures(React){
 const h=React.createElement;
 const chain=[];
 let sequence=0;
 function closeFrom(index=0,restore=false){
  const removed=chain.splice(index);const anchor=removed[0]?.anchor;
  for(const item of removed.reverse()){if(item.popup.matches(':popover-open'))item.popup.hidePopover();item.popup.remove();item.anchor?.setAttribute('aria-expanded','false');item.anchor?.removeAttribute('aria-controls');}
  if(restore&&anchor?.isConnected)anchor.focus({preventScroll:true});
 }
 function spawn(definition,anchor,parentIndex=-1){
  closeFrom(parentIndex+1);
  const popup=document.createElement('div');popup.popover='manual';popup.id='report-definition-'+(++sequence);popup.className='report-formula-popover';popup.setAttribute('role','dialog');popup.setAttribute('aria-label',definition.title+' definition');popup.tabIndex=-1;
  const heading=document.createElement('div');heading.className='report-formula-heading';const title=document.createElement('strong');title.textContent=definition.title;heading.append(title);
  const closeButton=document.createElement('button');closeButton.type='button';closeButton.className='report-formula-close';closeButton.setAttribute('aria-label','Close definition');closeButton.textContent='×';heading.append(closeButton);popup.append(heading);
  const group=document.createElement('p');group.className='report-formula-group';group.textContent=definition.group||'Definition';popup.append(group);
  const formula=document.createElement('p');formula.className='report-formula-expression';
  for(const token of definitionTokens(definition.formula,definition.id)){
   if(token.ref){const term=document.createElement('button');term.type='button';term.className='report-definition-term';term.textContent=token.text;term.dataset.definitionRef=token.ref;term.setAttribute('aria-haspopup','dialog');term.setAttribute('aria-expanded','false');formula.append(term);}
   else formula.append(document.createTextNode(token.text));
  }
  popup.append(formula);
  if(definition.detail){const detail=document.createElement('p');detail.textContent=definition.detail;popup.append(detail);}
  if(definition.source_tags?.length){const tags=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Configured source tags';tags.append(summary);const text=document.createElement('p');text.textContent=definition.source_tags.join(', ');tags.append(text);popup.append(tags);}
  for(const [href,label]of [[definition.source_url,'Open annual source'],[definition.inspect_href,'Inspect loaded source tags']])if(href&&(href.startsWith('https://')||href.startsWith('#/'))){const link=document.createElement('a');link.href=href;link.textContent=label;link.className='report-source-link';if(href.startsWith('https://')){link.target='_blank';link.rel='noopener noreferrer';}else link.addEventListener('click',()=>closeFrom());popup.append(link);}
  document.body.append(popup);
  const item={popup,anchor,definition};chain.push(item);anchor.setAttribute('aria-expanded','true');anchor.setAttribute('aria-controls',popup.id);closeButton.addEventListener('click',()=>closeFrom(chain.indexOf(item),true));
  popup.style.width=Math.min(350,document.documentElement.clientWidth-24)+'px';popup.showPopover();
  const rect=anchor.getBoundingClientRect(),box=popup.getBoundingClientRect(),width=document.documentElement.clientWidth,height=document.documentElement.clientHeight;
  const left=parentIndex>=0&&rect.right+box.width+12<width?rect.right+12:Math.max(12,Math.min(rect.left,width-box.width-12));
  popup.style.left=left+'px';popup.style.top=(rect.bottom+8+box.height<height-12?rect.bottom+8:Math.max(12,Math.min(rect.top-box.height-8,height-box.height-12)))+'px';
  popup.focus({preventScroll:true});
 }
 document.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target.closest('button'):null;if(!target)return;
  if(target.dataset.definitionLabel){
   if(chain[0]?.anchor===target){closeFrom(0,true);return;}
   const definition=resolveDefinition({label:target.dataset.definitionLabel,group:target.dataset.definitionGroup,metricKey:target.dataset.definitionKey,companyType:target.dataset.companyType,quarterly:target.dataset.definitionPeriod==='quarterly'});
   if(definition)spawn({...definition,...(target.dataset.definitionReason?{detail:target.dataset.definitionReason}:{})},target);return;
  }
  if(target.dataset.definitionRef){
   const parentIndex=chain.findIndex(item=>item.popup.contains(target));if(parentIndex<0)return;
   if(chain[parentIndex+1]?.anchor===target){closeFrom(parentIndex+1,true);return;}
   const context=chain[parentIndex].definition.context||{},definition=definitionById(target.dataset.definitionRef,context);
   if(definition)spawn({...definition,context},target,parentIndex);
  }
 });
 document.addEventListener('pointerdown',event=>{if(chain.length&&!chain.some(item=>item.popup.contains(event.target)||item.anchor.contains(event.target)))closeFrom();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&chain.length){event.preventDefault();closeFrom(chain.length-1,true);}});
 window.addEventListener('resize',()=>closeFrom());
 window.addEventListener('hashchange',()=>closeFrom());
 window.addEventListener('scroll',event=>{if(chain.length&&!chain.some(item=>item.popup.contains(event.target)))closeFrom();},true);
 function MetricLabel({label,group='',metricKey,data,valuation,basis}){
  const valuationKey=valuationKeys[label],valuationBasis=valuation?.bases?.[valuationKey];if(group==='Valuation'&&valuationBasis)group+=' · '+valuationBasis;

  return h('button',{type:'button',className:'report-stat-label','data-definition-label':label,'data-definition-group':group,'data-definition-key':metricKey,'data-definition-reason':valuation?.reasons?.[valuationKey]||basis,'data-company-type':data?.company_type,'data-definition-period':data?.columns?.some(c=>c.includes('Q'))?'quarterly':'annual','aria-haspopup':'dialog','aria-expanded':false,title:`Definition: ${label}`},label);
 }
 function MissingValue({row,period}){return h('button',{type:'button',className:'report-missing-value','aria-label':row.label+' '+period+': why this value is blank',title:'Why this value is blank',onClick:event=>{const anchor=event.currentTarget;if(chain[0]?.anchor===anchor){closeFrom(0,true);return;}spawn(missingValueDefinition(row,period),anchor);}},'—');}
 function ThemeToggle(){
  const [dark,setDark]=React.useState(()=>document.documentElement.dataset.theme==='dark');
  function apply(value){document.documentElement.dataset.theme=value?'dark':'light';setDark(value);}
  React.useEffect(()=>{const update=event=>{if(event.key==='roy-research-theme')apply(event.newValue?event.newValue==='dark':matchMedia('(prefers-color-scheme: dark)').matches);};window.addEventListener('storage',update);return()=>window.removeEventListener('storage',update);},[]);
  function toggle(){const value=!dark;apply(value);try{localStorage.setItem('roy-research-theme',value?'dark':'light');}catch{}}
  return h('button',{type:'button',className:'report-theme-toggle',onClick:toggle,'aria-label':dark?'Light mode':'Dark mode','aria-pressed':dark,title:dark?'Switch to light mode':'Switch to dark mode'},
   h('svg',{viewBox:'0 0 24 24',width:16,height:16,fill:'none',stroke:'currentColor',strokeWidth:1.7,'aria-hidden':true},dark?h(React.Fragment,null,h('circle',{cx:12,cy:12,r:4}),h('path',{d:'M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'})):h('path',{d:'M20.8 13A8.7 8.7 0 0 1 11 3.2 8.8 8.8 0 1 0 20.8 13Z'})),h('span',null,dark?'Light mode':'Dark mode'));
 }
 function CompanyNotes({companyKey,coverage,annualFiling,basis,sourceNotice,sourceSummary,valuationNotice}){
  const storageKey='roy-report-notes:'+companyKey;
  const [open,setOpen]=React.useState(false),[value,setValue]=React.useState(()=>{try{return localStorage.getItem(storageKey)||'';}catch{return '';}}),[failed,setFailed]=React.useState(false);
  if(!companyKey)return null;
  function update(event){const text=event.target.value;setValue(text);try{localStorage.setItem(storageKey,text);setFailed(false);}catch{setFailed(true);}}
  return h('div',{className:'report-company-notes'},sourceNotice&&h('details',{className:'report-source-notice'},h('summary',null,sourceSummary||'Financial source details'),h('p',null,sourceNotice,' ',valuationNotice,' ',annualFiling&&h('a',{href:annualFiling,target:'_blank',rel:'noopener noreferrer',className:'underline'},'Open annual source'))),
   coverage&&h('p',{className:'report-coverage-note'},coverage,' ',annualFiling&&h('a',{href:annualFiling,target:'_blank',rel:'noopener noreferrer',className:'underline'},'Open annual filing')),
   basis&&h('details',{className:'report-share-basis'},
    h('summary',null,`Share basis: ${basis.events.length} known event${basis.events.length===1?'':'s'}${basis.observations.some(o=>o.basis_status==='unresolved')?' · unresolved values omitted':''} · details`),
    h('div',{className:'report-share-basis-body'},
     h('p',null,`Knowledge cutoff: ${basis.policy.knowledge_as_of}. Target share basis: ${basis.policy.target_share_basis}. Mode: ${basis.policy.mode}.`),
     h('p',null,'Confirmed = corroborated EPS/share observations or a source disclosure. Inferred = chronology or a single comparative observation. Unresolved = contradictory or insufficient evidence; affected values are omitted.'),
     basis.source_class&&h('p',null,`Listed share class: ${basis.source_class.identity}. Additional statement sources: ${basis.filing_supplement?.sources?.length||0} filings.`),
     basis.filing_supplement?.status==='partial'&&h('p',null,'Some historical class-specific source filings could not be retrieved or verified. Unavailable values remain blank.'),
     basis.feed_status!=='available'&&h('p',null,'Yahoo event history is unavailable or ambiguous for this share class. Using available SEC event facts; event coverage may be incomplete.'),
     ...basis.events.map(e=>h('p',{key:e.id},`${e.date}: ${e.ratio}-for-1 (${e.type.replaceAll('_',' ')}). `,...e.sources.map((source,i)=>h('a',{key:i,href:source.url,target:'_blank',rel:'noopener noreferrer'},source.source+(i<e.sources.length-1?' · ':''))))),
     h('p',null,'Source share-basis observations below remain in the original reporting currency.'),h('p',null,'EPS uses reported annual values when available. Nonannual TTM EPS is an estimate from common income and time-weighted shares; quarterly diluted EPS is not summed. Cash dividends do not trigger share-basis changes; dividend/share history is displayed on the target basis, not as original declared cash amounts.'),
     h('div',{className:'report-basis-observations'},...basis.observations.filter(o=>o.basis_status==='unresolved'||o.metric==='EPS (Diluted)'||o.metric==='Earnings Per Share (Diluted)'||/diluted/i.test(o.metric)).map((o,i)=>h('p',{key:i},`${o.metric} ${o.period}: ${o.value===undefined?'unavailable':Number(o.value).toFixed(o.metric.startsWith('Shares')?0:3)} · ${o.basis_status}${o.factor&&o.factor!==1?' · factor '+o.factor:''}${o.calculation?' · '+o.calculation:''}${o.metric.startsWith('EPS')&&o.reported_value!==undefined?' · reported '+o.reported_value:''}${o.filed?' · filed '+o.filed:''}`,o.accn&&h('a',{href:o.source_url||'https://www.sec.gov/Archives/edgar/data/'+Number(companyKey)+'/'+o.accn.replaceAll('-','')+'/',target:'_blank',rel:'noopener noreferrer'},' · filing')))))),
   h('span',{className:'font-semibold'},'Company Notes: '),h('button',{type:'button',className:'report-notes-toggle',onClick:()=>setOpen(!open),'aria-expanded':open},open?'Hide ▴':'Show ▾'),
   open&&h('div',null,h('textarea',{'aria-label':'Company notes',className:'report-notes-input',value,onChange:update,placeholder:'Write your business description or research notes…',rows:4}),h('p',{className:'report-notes-status',role:'status'},failed?'Could not save in this browser. Copy your notes before leaving.':'Saved in this browser only.')));
 }
 return {MetricLabel,MissingValue,ThemeToggle,CompanyNotes,UnmappedView:createUnmappedView(React),useCurrencyDisplay:createCurrencyDisplay(React)};
}
