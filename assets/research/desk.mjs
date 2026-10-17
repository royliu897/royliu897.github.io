import {ReportViewer} from './pdf-viewer.mjs?v=2';
import {expression,model} from './finance.mjs';
import {companies,symbols,draftKey,makeDraft,appendDraft,parseSeries,importedNotes,chartSeries} from './data.mjs';
const $=id=>document.getElementById(id), form=$('valuation-form'), root=document.querySelector('.desk');
const key='roy-research-desk-v1';let blocked=false,state={};
try{state=JSON.parse(localStorage.getItem(key)||'{}');if(!state||typeof state!=='object'||Array.isArray(state))throw Error();}catch{blocked=true;state={};}
if(state.notes&&(Array.isArray(state.notes)||typeof state.notes!=='object'||Object.values(state.notes).some(n=>!n||typeof n.body!=='string'))){blocked=true;state={};}
state.notes=state.notes&&typeof state.notes==='object'?state.notes:{};state.models=state.models&&typeof state.models==='object'?state.models:{};state.series=state.series&&typeof state.series==='object'?state.series:{};state.open=state.open&&typeof state.open==='object'?state.open:{};state.pins=Array.isArray(state.pins)?state.pins:[];
let symbol=symbols.includes(state.company)?state.company:'MCD',result=null,noteTimer,filingData,filingLoading,archive,stage=0,pdfURL,reportGeneration=0;
const money=n=>n.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}),pct=n=>(n*100).toFixed(1)+'%';
function status(text,error=false){$('workspace-status').textContent=text;$('workspace-status').classList.toggle('desk-error',error);}
function persist(){try{if(blocked)throw Error();localStorage.setItem(key,JSON.stringify(state));return true;}catch{status('Browser storage unavailable. Export notes before leaving.',true);return false;}}
function download(name,text,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function noteSnapshot(){return {title:$('note-title').value,body:$('note-body').value,decision:$('note-decision').value,type:$('note-type').value,review:Object.fromEntries(['business','risks','valuation','sources'].map(k=>[k,$('review-'+k).value])),updated:new Date().toISOString()};}
function saveNote(){clearTimeout(noteTimer);state.notes[symbol]=noteSnapshot();$('note-status').textContent=persist()?'Saved locally':'Unsaved';}
['note-title','note-body','note-decision','note-type','review-business','review-risks','review-valuation','review-sources'].forEach(id=>$(id).addEventListener('input',()=>{$('note-status').textContent='Saving…';clearTimeout(noteTimer);noteTimer=setTimeout(saveNote,250);}));
window.addEventListener('pagehide',saveNote);document.addEventListener('visibilitychange',()=>{if(document.hidden)saveNote();});
window.addEventListener('beforeunload',e=>{if($('note-status').textContent==='Unsaved'){e.preventDefault();e.returnValue='';}});
function modelDefaults(){return symbol==='MCD'?{price:242.5,eps:12.2,years:5,exitPE:22,hurdle:10,growth:'.05',dividend:7.72,divGrowth:'0'}:{price:'',eps:'',years:5,exitPE:20,hurdle:10,growth:'.05',dividend:0,divGrowth:'0'};}
function inputs(){return Object.fromEntries(['price','eps','years','exitPE','hurdle','growth','dividend','divGrowth'].map(k=>[k,form.elements[k].value]));}
function clearResults(){result=null;['pv','cagr','irr'].forEach(id=>$(id).textContent='—');$('value-chart').replaceChildren();$('projections').replaceChildren();$('model-export').disabled=$('model-to-note').disabled=true;}
function graph(id,series,years){
 const target=$(id);target.replaceChildren();if(!years.length)return;
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 760 280');svg.setAttribute('role','img');svg.setAttribute('aria-label',series.map(s=>s.name).join(', ')+' by year');
 const el=(name,attrs,text)=>{const n=document.createElementNS(ns,name);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;svg.append(n);return n;};
 const vals=series.flatMap(s=>s.values),lo=Math.min(0,...vals),hi=Math.max(0,...vals)*1.08||1,x=i=>62+(years[i]-years[0])*678/Math.max(1,years.at(-1)-years[0]),y=v=>245-(v-lo)/(hi-lo)*220;
 for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4;el('line',{x1:62,x2:740,y1:y(v),y2:y(v),stroke:'#dedcd3'});el('text',{x:53,y:y(v)+4,'text-anchor':'end',fill:'#5d6365','font-size':10},v.toLocaleString('en-US',{maximumFractionDigits:1}));}
 years.forEach((year,i)=>{if(years.length<12||i%Math.ceil(years.length/10)===0||i===years.length-1)el('text',{x:x(i),y:270,'text-anchor':'middle',fill:'#5d6365','font-size':10},year);});
 series.forEach(s=>{el('polyline',{points:s.values.map((v,i)=>`${x(i)},${y(v)}`).join(' '),fill:'none',stroke:s.color,'stroke-width':2});s.values.forEach((v,i)=>{const c=el('circle',{cx:x(i),cy:y(v),r:3,fill:s.color}),title=document.createElementNS(ns,'title');title.textContent=`${s.name}, ${years[i]}: ${v.toLocaleString()}`;c.append(title);});});target.append(svg);
}
function drawValuationChart(){
 if(!result||!$('valuation-chart').open)return;
 const v={price:Number(inputs().price)};
 graph('value-chart',[{name:'Reinvested',color:'#284d6b',values:[v.price,...result.rows.map(r=>r.wealth)]},{name:'Cash held',color:'#9b733f',values:[v.price,...result.rows.map(r=>r.cashWealth)]},{name:'Share price',color:'#7a817d',values:[v.price,...result.rows.map(r=>r.price)]}],[0,...result.rows.map(r=>r.year)]);
}
$('valuation-chart').addEventListener('toggle',()=>{if($('valuation-chart').open)drawValuationChart();else $('value-chart').replaceChildren();});
function calculate(event){event?.preventDefault();try{const raw=inputs(),v=Object.fromEntries(Object.entries(raw).map(([k,val])=>[k,['growth','divGrowth'].includes(k)?val:Number(val)]));v.hurdle/=100;result=model(v);state.models[symbol]=raw;persist();$('model-error').textContent='';$('pv').textContent=money(result.pv);$('cagr').textContent=pct(result.reinvestCAGR);$('irr').textContent=pct(result.irr);$('model-export').disabled=$('model-to-note').disabled=false;
 if($('valuation-chart').open)drawValuationChart();
 const fragment=document.createDocumentFragment();for(const r of result.rows){const tr=document.createElement('tr');for(const value of [r.year,money(r.eps),r.pe.toFixed(1),money(r.price),money(r.dividend),r.shares.toFixed(4),money(r.wealth),money(r.cashWealth)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}fragment.append(tr);}$('projections').replaceChildren(fragment);
 }catch(e){clearResults();$('model-error').textContent=e.message;}}
form.addEventListener('submit',calculate);form.addEventListener('input',()=>{clearResults();$('model-error').textContent='Inputs changed. Calculate to update results.';});
$('model-reset').onclick=()=>{delete state.models[symbol];loadModel();persist();};
function loadModel(){$('valuation-chart').open=false;$('value-chart').replaceChildren();const v=state.models[symbol]||modelDefaults();for(const [k,value] of Object.entries(v))if(form.elements[k])form.elements[k].value=value;$('model-source').textContent=symbol==='MCD'?'MCD starting example · Price $242.50, Oct 15 2026 · FY2025 adjusted EPS $12.20 · Annualized dividend $7.72. Editable assumptions, not live data.':`${symbol} · Enter company-specific financial assumptions.`;$('model-error').textContent='';if(v.price&&v.eps)calculate();else clearResults();}
$('model-export').onclick=()=>{if(result)download(`${symbol}-valuation.csv`,Object.keys(result.rows[0]).join(',')+'\n'+result.rows.map(r=>Object.values(r).join(',')).join('\n'),'text/csv');};
$('model-to-note').onclick=()=>{if(!result)return;const v=inputs();$('note-body').value+=`${$('note-body').value?'\n\n':''}## Valuation — ${new Date().toISOString().slice(0,10)}\n\nPrice $${v.price}; starting EPS $${v.eps}; ${v.years} years; exit P/E ${v.exitPE}; EPS growth ${v.growth}; first-year dividend $${v.dividend}; dividend growth ${v.divGrowth}; required return ${v.hurdle}%.\n\nDiscounted value ${money(result.pv)} per share; reinvested CAGR ${pct(result.reinvestCAGR)}; cash-flow IRR ${pct(result.irr)}. Annual dividends; linear P/E path; no taxes or fees.\n`;saveNote();setNotes(true);};
function draft(){return makeDraft(symbol,noteSnapshot(),crypto.randomUUID(),new Date().toISOString());}
$('writing-draft').onclick=()=>{saveNote();try{const d=draft(),existing=JSON.parse(localStorage.getItem(draftKey)||'{}');localStorage.setItem(draftKey,JSON.stringify(appendDraft(existing,d)));window.location.href=`write.html?draft=${encodeURIComponent(d.id)}`;}catch(e){status(e.message||'Could not create the writing draft. Export it instead.',true);}};
$('note-export').onclick=()=>{try{download(`${symbol}-draft.json`,JSON.stringify(draft(),null,2));}catch(e){status(e.message,true);}};
$('notes-export').onclick=()=>{saveNote();download('research-notes.json',JSON.stringify({version:1,notes:state.notes},null,2));};
$('notes-import').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>1500000)throw Error('Notebook must be smaller than 1.5 MB.');saveNote();const imported=importedNotes(JSON.parse(await f.text()));for(const [ticker,n] of Object.entries(imported)){const old=state.notes[ticker];state.notes[ticker]=old?.body&&old.body!==n.body?{...old,body:`${old.body}\n\n---\nImported note\n\n${n.body}`}:{...n,type:$('note-type').value,review:Object.fromEntries(['business','risks','valuation','sources'].map(k=>[k,$('review-'+k).value])),updated:new Date().toISOString()};}persist();loadNote();status('Notes imported. Existing text was retained.');}catch(e){status(e.message,true);}finally{e.target.value='';}};
function loadNote(){const n=state.notes[symbol]||{};$('note-heading').textContent=`${symbol} · Note`;$('note-title').value=n.title||`${companies[symbol].name} (${symbol})`;$('note-body').value=n.body||'';$('note-decision').value=n.decision||'Unreviewed';$('note-type').value=n.type||'note';for(const k of ['business','risks','valuation','sources'])$('review-'+k).value=n.review?.[k]||'';$('note-status').textContent='Local';}
function changeCompany(){saveNote();symbol=$('company').value;state.company=symbol;loadNote();loadModel();series();loadReport();if($('filings').open)filings();persist();document.dispatchEvent(new Event('research-company'));}
$('company').value=symbol;$('company').onchange=changeCompany;for(const [id,step] of [['prev',-1],['next',1]])$(id).onclick=()=>{$('company').value=symbols[(symbols.indexOf(symbol)+step+symbols.length)%symbols.length];changeCompany();};
function setNotes(open){state.notesVisible=open;$('workspace').classList.toggle('tools-hidden',!open);$('notes-toggle').setAttribute('aria-expanded',String(open));persist();}
$('notes-toggle').onclick=()=>setNotes(state.notesVisible===false);$('density').onclick=()=>{state.compact=!state.compact;root.classList.toggle('compact',state.compact);$('density').setAttribute('aria-pressed',String(state.compact));persist();};
const drawerIds=['research','valuation','financials','filings','calculator','archive','notes-panel'];
for(const id of drawerIds){const d=$(id);d.open=state.pins.includes(id)||(state.open[id]??id==='notes-panel');d.classList.toggle('pinned',state.pins.includes(id));d.addEventListener('toggle',()=>{if(!root.dataset.stage&&!d.open&&state.pins.includes(id)){d.open=true;return;}state.open[id]=d.open;persist();if(d.open&&id==='filings')filings();});}
document.querySelectorAll('[data-pin]').forEach(c=>{const id=c.dataset.pin;c.checked=state.pins.includes(id);c.onchange=()=>{state.pins=state.pins.filter(x=>x!==id);if(c.checked){state.pins.push(id);$(id).open=true;}$(id).classList.toggle('pinned',c.checked);persist();};});
function width(value,save=true){const upper=Math.min(680,Math.max(300,$('workspace').clientWidth-415));const n=Math.min(upper,Math.max(300,value));$('desk-divider').setAttribute('aria-valuemax',String(upper));$('workspace').style.setProperty('--note-width',n+'px');$('desk-divider').setAttribute('aria-valuenow',String(n));state.noteWidth=n;if(save)persist();}
const divider=$('desk-divider');divider.addEventListener('pointerdown',e=>{divider.setPointerCapture(e.pointerId);});let raf;
divider.addEventListener('pointermove',e=>{if(!divider.hasPointerCapture(e.pointerId))return;const right=$('workspace').getBoundingClientRect().right;cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>width(right-e.clientX,false));});divider.addEventListener('pointerup',e=>{divider.releasePointerCapture(e.pointerId);persist();});divider.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();width(e.key==='Home'?300:e.key==='End'?680:(state.noteWidth||400)+(e.key==='ArrowLeft'?20:-20));}});
$('reset-layout').onclick=()=>{state.pins=[];state.open={};drawerIds.forEach(id=>{$(id).open=id==='notes-panel';$(id).classList.remove('pinned');});document.querySelectorAll('[data-pin]').forEach(c=>c.checked=false);state.compact=false;root.classList.remove('compact');$('density').setAttribute('aria-pressed','false');width(400);setNotes(true);persist();};
$('calc').oninput=()=>{try{$('calc-result').textContent=expression($('calc').value).toLocaleString('en-US',{maximumFractionDigits:8});}catch{$('calc-result').textContent='—';}};
const metrics={revenue:[25494,25920,26885],profit:[8469,8223,8563],eps:[11.56,11.39,11.95]};
state.chartPrefs=state.chartPrefs||{};
let activePoints=[];
function series(){
 const pref=state.chartPrefs[symbol]||{},custom=state.series[symbol];
 $('metric').value=pref.metric||(custom?'custom':'revenue');
 for(const option of $('metric').options)option.disabled=option.value==='custom'?!custom:symbol!=='MCD';
 const metric=$('metric').value,isCustom=metric==='custom';
 activePoints=isCustom?(custom?.points||[]):symbol==='MCD'?[2023,2024,2025].map((y,i)=>[y,metrics[metric][i]]):[];
 $('series-label').value=isCustom?(custom?.label||''):symbol==='MCD'?$('metric').selectedOptions[0].textContent:'';
 $('series-label').readOnly=!isCustom;
 for(const [id,saved] of [['series-from',pref.from],['series-through',pref.through]]){
  $(id).replaceChildren(...activePoints.map(([year])=>new Option(year,year)));
  $(id).value=activePoints.some(([y])=>y===saved)?saved:id==='series-from'?activePoints[0]?.[0]:activePoints.at(-1)?.[0];
 }
 $('series-mode').value=pref.mode||'level';
 $('series-source').hidden=isCustom||symbol!=='MCD';
 $('series-source').href='https://www.sec.gov/Archives/edgar/data/63908/000006390826000035/mcd-20251231.htm';
 drawSeries();
}
function drawSeries(){
 $('series-chart').replaceChildren();$('series-values').replaceChildren();
 if(!activePoints.length){$('series-status').textContent=`${symbol} · No series loaded. Import a year,value table with explicit units.`;return;}
 const from=Number($('series-from').value),through=Number($('series-through').value),mode=$('series-mode').value;
 state.chartPrefs[symbol]={metric:$('metric').value,from,through,mode};persist();
 try{
  if(from>through)throw Error('Choose a start year no later than the end year.');
  const points=chartSeries(activePoints,from,through,mode),label=mode==='growth'?'Annual change (%)':mode==='indexed'?'Index (start = 100)':$('series-label').value;
  graph('series-chart',[{name:label,color:'#284d6b',values:points.map(r=>r[1])}],points.map(r=>r[0]));
  const displayed=new Map(points);
  for(const [year,value] of activePoints.filter(([y])=>y>=from&&y<=through)){
   const tr=document.createElement('tr');for(const v of [year,value,displayed.get(year)]){const td=document.createElement('td');td.textContent=v===undefined?'—':tr.children.length===0?String(v):v.toLocaleString('en-US',{maximumFractionDigits:2});tr.append(td);}$('series-values').append(tr);
  }
  $('series-status').textContent=`${symbol} · ${from}–${through} · ${label}. `+($('metric').value==='custom'?'Imported data.':'Manually sourced from FY2025 10-K. ')+(mode==='growth'?'Change requires a positive prior-year value; other periods are omitted.':'');
 }catch(e){$('series-status').textContent=e.message;}
}
$('metric').onchange=()=>{state.chartPrefs[symbol]={metric:$('metric').value};series();};
['series-from','series-through','series-mode'].forEach(id=>$(id).onchange=drawSeries);
for(const [id,years] of [['series-all',Infinity],['series-five',5],['series-ten',10]])$(id).onclick=()=>{if(!activePoints.length)return;const last=activePoints.at(-1)[0];$('series-from').value=activePoints.find(([y])=>y>=last-years+1)?.[0]??activePoints[0][0];$('series-through').value=last;drawSeries();};
$('series-reset').onclick=()=>{delete state.series[symbol];delete state.chartPrefs[symbol];persist();series();};
$('series-label').onchange=()=>{if(state.series[symbol]&&$('metric').value==='custom'){state.series[symbol].label=$('series-label').value;persist();drawSeries();}};
$('series-upload').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>100000)throw Error('CSV must be smaller than 100 KB.');const points=parseSeries(await f.text());state.series[symbol]={label:`${symbol} imported series — specify units`,points};state.chartPrefs[symbol]={metric:"custom"};persist();series();}catch(error){$('series-status').textContent=error.message;}finally{e.target.value='';}};
async function filings(){const ticker=symbol,year=$('filing-year').value;$('filing-links').replaceChildren();$('filing-results').replaceChildren();for(const form of ['10-K','10-Q','DEF 14A']){const a=document.createElement('a');a.textContent=`${form} · EDGAR search ↗`;a.href=`https://www.sec.gov/edgar/search/#/dateRange=custom&ciks=${companies[ticker].cik.padStart(10,'0')}&startdt=${encodeURIComponent(year)}-01-01&enddt=${encodeURIComponent(year)}-12-31&forms=${encodeURIComponent(form)}`;a.target='_blank';a.rel='noopener';$('filing-links').append(a);}try{filingLoading??=fetch('assets/research/filings.json').then(r=>{if(!r.ok)throw Error();return r.json();});filingData=await filingLoading;if(symbol!==ticker||$('filing-year').value!==year)return;const rows=(filingData.companies[ticker]||[]).filter(f=>f.filingDate.startsWith(year));$('filing-status').textContent=`Metadata snapshot: ${filingData.asOf}. ${rows.length} matching filings.`;for(const f of rows){const a=document.createElement('a');a.textContent=`${f.form} · period ${f.reportDate||'—'} · filed ${f.filingDate} ↗`;a.href=f.url;a.target='_blank';a.rel='noopener';$('filing-results').append(a);}}catch{$('filing-status').textContent='Metadata unavailable. Use the EDGAR searches above.';filingLoading=null;}}
$('filing-year').onchange=filings;
function reportDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('roy-research-documents',1);r.onupgradeneeded=()=>r.result.createObjectStore('reports');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function savedPDF(ticker,value){const db=await reportDB();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('reports',value?'readwrite':'readonly'),store=tx.objectStore('reports'),request=value?store.put(value,ticker):store.get(ticker);let found;request.onsuccess=()=>{found=request.result;};tx.oncomplete=()=>resolve(found);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
const viewer=new ReportViewer($('report-frame'),text=>{$('report-status').textContent=text;});
function showPDF(record){if(pdfURL)URL.revokeObjectURL(pdfURL);pdfURL=record?URL.createObjectURL(record.blob):null;$('report-link').hidden=!record;$('document-title').textContent=record?`${symbol} · ${record.name}`:`${symbol} · Company report`;if(record){$('report-link').href=pdfURL;viewer.load(record.blob);}else{$('report-link').removeAttribute('href');viewer.clear();$('report-status').textContent=`${symbol} · No local document selected.`;}}
async function loadReport(){const generation=++reportGeneration;showPDF(null);try{const record=await savedPDF(symbol);if(generation===reportGeneration)showPDF(record);}catch{$('report-status').textContent='Document storage unavailable. Use the publisher link.';}}
$('zoom-page').onclick=()=>viewer.fit();$('zoom-out').onclick=()=>viewer.zoom(1/1.2);$('zoom-in').onclick=()=>viewer.zoom(1.2);$('zoom-fit').onclick=()=>viewer.zoom(0);
$('report-upload').onchange=async e=>{const ticker=symbol;try{const f=e.target.files[0];if(!f)return;if(f.size>30000000||!f.name.toLowerCase().endsWith('.pdf'))throw Error('Select a PDF smaller than 30 MB.');const record={name:f.name,blob:f};await savedPDF(ticker,record);if(symbol===ticker)showPDF(record);}catch(error){$('report-status').textContent=error.message;}finally{e.target.value='';}};
function renderRecord(text){const box=document.createElement('section');box.className='desk-record';const lines=text.split(/\n## (?:Screening questions|Diligence questions)/)[0].replace(/This case is selected for learning;[^\n]*screen\./g,'').replace(/First decide whether[^\n]*/g,'').replace(/```text[\s\S]*?```/g,'').split('\n');for(let i=0;i<lines.length;i++){const l=lines[i].trim();if(!l)continue;if(l.startsWith('|')){const wrap=document.createElement('div');wrap.className='desk-table-wrap';const table=document.createElement('table');let header=true;while(i<lines.length&&lines[i].trim().startsWith('|')){const cells=lines[i++].trim().split('|').slice(1,-1).map(s=>s.trim());if(cells.every(c=>/^:?-+:?$/.test(c)))continue;const tr=document.createElement('tr');for(const c of cells){const td=document.createElement(header?'th':'td');td.textContent=c;tr.append(td);}table.append(tr);header=false;}i--;wrap.append(table);box.append(wrap);continue;}const h=l.match(/^#+\s+(.*)/),p=document.createElement(h?'h3':'p');p.textContent=(h?h[1]:l).replaceAll('**','');box.append(p);}return box;}
$('archive-open').onclick=async()=>{try{const r=await fetch('assets/research/case-01.json');if(!r.ok)throw Error();archive=await r.json();stage=0;$('archive-content').replaceChildren();$('archive-outcome').replaceChildren();$('archive-status').textContent=`Information date: ${archive.asOf} · Reconstructed from public filings`;$('archive-next').disabled=false;showStage();}catch{$('archive-status').textContent='Record unavailable.';}};
function showStage(){if(!archive||stage>=archive.stages.length)return;$('archive-content').append(renderRecord(archive.stages[stage++].text));$('archive-next').disabled=stage>=archive.stages.length;$('archive-reveal').disabled=stage<archive.stages.length;}
$('archive-next').onclick=showStage;$('archive-reveal').onclick=async()=>{if(!archive||stage<archive.stages.length)return;try{const r=await fetch('assets/research/case-01-reveal.json');if(!r.ok)throw Error();const data=await r.json(),box=$('archive-outcome');box.replaceChildren();for(const text of [data.identity,data.outcome]){const p=document.createElement('p');p.textContent=text;box.append(p);}for(const s of data.sources){const a=document.createElement('a');a.textContent=s.label+' ↗';a.href=s.url;a.target='_blank';a.rel='noopener';const p=document.createElement('p');p.append(a);box.append(p);}}catch{$('archive-outcome').textContent='Subsequent results unavailable.';}};
root.classList.toggle('compact',Boolean(state.compact));$('density').setAttribute('aria-pressed',String(Boolean(state.compact)));width(Number(state.noteWidth)||400,false);$('workspace').classList.toggle('tools-hidden',state.notesVisible===false);$('notes-toggle').setAttribute('aria-expanded',String(state.notesVisible!==false));loadNote();loadModel();series();loadReport();if(blocked)status('Saved workspace could not be read. Existing storage has not been overwritten.',true);

function reviewMode(view){state.view=view;document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));$('review-fields').hidden=view!=='detailed';$('research').hidden=view!=='detailed';document.dispatchEvent(new Event('research-view'));if(view==='detailed'){$('research').open=true;$('notes-panel').open=true;setNotes(true);}persist();}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>reviewMode(b.dataset.view));reviewMode(state.view||'quick');
$('series-apply').onclick=()=>{try{const text=$('series-table').value.replace(/\t/g,','),points=parseSeries(text);state.series[symbol]={label:$('series-label').value||`${symbol} imported series — specify units`,points};state.chartPrefs[symbol]={metric:"custom"};persist();series();}catch(e){$('series-status').textContent=e.message;}};

let resizeTimer;window.addEventListener("resize",()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>width(Number(state.noteWidth)||400,false),150);});

import("./research.mjs?v=workbench2").then(()=>import("./stages.mjs?v=workbench2")).catch(()=>status("Research library could not load. Reload to retry.",true));
