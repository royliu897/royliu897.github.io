import {mountSeriesInput,dateFromDecimal,decimalDate} from './series-input.mjs';
import {filingList,financialFacts} from './sec-client.mjs?v=3';
import {parseManualSeries,periodLabel} from './manual-series.mjs?v=2';
import {formatAmount} from './amounts.mjs';
import {filingLabel,pastRange} from './periods.mjs?v=2';
import {annualFacts} from './research-data.mjs?v=6';
import {ReportViewer} from './pdf-viewer.mjs?v=2';
import {expression} from './finance.mjs?v=4';
import {projectedPrice,discountedPrice,migrateGrowth,migrateDividend} from './valuation-flow.mjs?v=3';
import {latestQuote} from './sec-client.mjs?v=5';
import {companies,symbols,draftKey,makeDraft,appendDraft,parseSeries,importedNotes,chartSeries} from './data.mjs?v=3';
const $=id=>document.getElementById(id), form=$('valuation-form'), root=document.querySelector('.desk');
const key='roy-research-desk-v1';let blocked=false,state={};
try{state=JSON.parse(localStorage.getItem(key)||'{}');if(!state||typeof state!=='object'||Array.isArray(state))throw Error();}catch{blocked=true;state={};}
if(state.notes&&(Array.isArray(state.notes)||typeof state.notes!=='object'||Object.values(state.notes).some(n=>!n||typeof n.body!=='string'))){blocked=true;state={};}
state.notes=state.notes&&typeof state.notes==='object'?state.notes:{};state.models=state.models&&typeof state.models==='object'?state.models:{};state.series=state.series&&typeof state.series==='object'?state.series:{};state.open=state.open&&typeof state.open==='object'?state.open:{};state.pins=Array.isArray(state.pins)?state.pins:[];
let symbol=symbols.includes(state.company)?state.company:'MCD',result=null,noteTimer,filingData,filingLoading,pdfURL,reportGeneration=0;
const money=n=>n.toLocaleString('en-US',{style:'currency',currency:companies[symbol].currency||'USD',maximumFractionDigits:2}),pct=n=>(n*100).toFixed(1)+'%';
function status(text,error=false){$('workspace-status').textContent=text;$('workspace-status').classList.toggle('desk-error',error);}
function persist(){try{if(blocked)throw Error();localStorage.setItem(key,JSON.stringify(state));return true;}catch{status('Browser storage unavailable. Export notes before leaving.',true);return false;}}
function download(name,text,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function noteSnapshot(){return {title:$('note-title').value,body:$('note-body').value,decision:$('note-decision').value,type:$('note-type').value,review:Object.fromEntries(['business','risks','valuation','sources'].map(k=>[k,$('review-'+k).value])),updated:new Date().toISOString()};}
function saveNote(){clearTimeout(noteTimer);state.notes[symbol]=noteSnapshot();$('note-status').textContent=persist()?'Saved locally':'Unsaved';}
['note-title','note-body','note-decision','note-type','review-business','review-risks','review-valuation','review-sources'].forEach(id=>$(id).addEventListener('input',()=>{$('note-status').textContent='Saving…';clearTimeout(noteTimer);noteTimer=setTimeout(saveNote,250);}));
window.addEventListener('pagehide',saveNote);document.addEventListener('visibilitychange',()=>{if(document.hidden)saveNote();});
window.addEventListener('beforeunload',e=>{if($('note-status').textContent==='Unsaved'){e.preventDefault();e.returnValue='';}});
function modelDefaults(){return {price:'',eps:'',years:5,discountYears:5,expectedPrice:'',exitPE:20,hurdle:10,growth:'.05x',growthVersion:2,dividend:0,divGrowth:'0',divGrowthVersion:2};}
function inputs(){return {...Object.fromEntries(['price','eps','years','expectedPrice','exitPE','hurdle','growth','dividend','divGrowth'].map(k=>[k,form.elements[k].value])),discountYears:form.elements.years.value};}
function saveModel(){state.models[symbol]={...state.models[symbol],...inputs(),growthVersion:2,divGrowthVersion:2};persist();}
let quoteGeneration=0;
async function fillQuote(force=false,refresh=false){const id=symbol,token=++quoteGeneration,old=form.elements.price.value;$('quote-status').textContent='…';$('quote-refresh').disabled=true;try{const q=await latestQuote(id,refresh);if(token!==quoteGeneration||id!==symbol)return;if(q.currency!==(companies[id].currency||'USD'))throw Error('Quote currency differs; enter price manually.');if(form.elements.price.value===old&&(force||!old)){form.elements.price.value=q.price;state.models[id]={...state.models[id],priceManual:false};clearDiscount();saveModel();}$('quote-status').textContent='';$('quote-source').title=`${q.currency} · Quote: ${new Date(q.asOf).toLocaleString()} · Fetched: ${new Date(q.fetchedAt||Date.now()).toLocaleString()}`;}catch(e){if(token===quoteGeneration&&id===symbol){$('quote-status').textContent='Unavailable';$('quote-status').title=e.message||'Enter price manually.';}}finally{if(token===quoteGeneration)$('quote-refresh').disabled=false;}}
$('quote-refresh').onclick=()=>fillQuote(true,true);
function clearDiscount(){result=null;['pv','cagr','irr'].forEach(id=>$(id).textContent='—');$('value-chart').replaceChildren();$('projections').replaceChildren();$('model-export').disabled=$('model-to-note').disabled=true;}
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
function calculate(event){event?.preventDefault();try{const raw=inputs();if(['price','expectedPrice','discountYears','hurdle','dividend','divGrowth'].some(k=>!raw[k].trim()))throw Error('Complete the discounted value fields.');const v=Object.fromEntries(Object.entries(raw).map(([k,val])=>[k,['growth','divGrowth'].includes(k)?val:Number(val)]));v.hurdle/=100;result=discountedPrice(v);state.models[symbol]={...state.models[symbol],...raw,growthVersion:2,divGrowthVersion:2};persist();$('model-error').textContent='';$('pv').textContent=money(result.pv);$('cagr').textContent=pct(result.reinvestCAGR);$('cagr').title=result.assumption;$('irr').textContent=pct(result.irr);$('model-export').disabled=$('model-to-note').disabled=false;
 if($('valuation-chart').open)drawValuationChart();
 const fragment=document.createDocumentFragment();for(const r of result.rows){const tr=document.createElement('tr');for(const value of [r.year,r.eps===null?'—':money(r.eps),r.pe===null?'—':r.pe.toFixed(1),money(r.price),money(r.dividend),r.shares.toFixed(4),money(r.wealth),money(r.cashWealth)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}fragment.append(tr);}$('projections').replaceChildren(fragment);
 }catch(e){clearDiscount();$('model-error').textContent=e.message;}}
$('project-calculate').onclick=()=>{try{const raw=inputs(),price=projectedPrice({eps:Number(raw.eps),years:Number(raw.years),exitPE:Number(raw.exitPE),growth:raw.growth});form.elements.expectedPrice.value=price.toFixed(2);clearDiscount();$('model-error').textContent='';saveModel();}catch(e){$('model-error').textContent=e.message;}};
form.addEventListener('submit',calculate);form.addEventListener('input',e=>{if(e.target.name==='price')state.models[symbol]={...state.models[symbol],priceManual:true};clearDiscount();$('model-error').textContent='';saveModel();});
$('model-reset').onclick=()=>{delete state.models[symbol];loadModel();persist();};
function loadModel(){if(state.models[symbol]&&(state.models[symbol].growthVersion!==2||state.models[symbol].divGrowthVersion!==2)){state.models[symbol]=migrateDividend(migrateGrowth(state.models[symbol]));persist();}$('valuation-chart').open=false;clearResults();const v={...modelDefaults(),...state.models[symbol]};if(!v.expectedPrice&&v.eps){try{v.expectedPrice=projectedPrice({eps:Number(v.eps),years:Number(v.years),exitPE:Number(v.exitPE),growth:v.growth});v.discountYears=v.years;}catch{}}for(const [k,value] of Object.entries(v))if(form.elements[k])form.elements[k].value=value;$('model-source').textContent=`${companies[symbol].ticker||symbol} · ${companies[symbol].currency||'USD'} · Editable assumptions`;$('model-error').textContent='';++quoteGeneration;$('quote-refresh').disabled=false;$('quote-status').textContent='';const c=companies[symbol],ticker=c.provider==='company'?(symbol==='2317'?'2317.TW':symbol==='000660'?'000660.KS':c.ticker):(c.ticker||symbol).replaceAll('.','-');$('quote-source').textContent=c.ticker||symbol;$('quote-source').href='https://finance.yahoo.com/quote/'+encodeURIComponent(ticker)+'/';$('quote-source').title='Yahoo Finance';if((!v.price||v.priceManual===false)&&$('valuation').open)fillQuote(v.priceManual===false);}
$('valuation').addEventListener('toggle',()=>{if($('valuation').open&&(!form.elements.price.value||state.models[symbol]?.priceManual===false))fillQuote(state.models[symbol]?.priceManual===false);});
$('model-export').onclick=()=>{if(result)download(`${symbol}-valuation.csv`,Object.keys(result.rows[0]).join(',')+'\n'+result.rows.map(r=>Object.values(r).join(',')).join('\n'),'text/csv');};
$('model-to-note').onclick=()=>{if(!result)return;const v=inputs();$('note-body').value+=`${$('note-body').value?'\n\n':''}## Valuation — ${new Date().toISOString().slice(0,10)}\n\nPrice ${companies[symbol].currency||'USD'} ${v.price}; starting EPS ${companies[symbol].currency||'USD'} ${v.eps}; ${v.discountYears} years to exit; expected future price ${v.expectedPrice}; projection exit P/E ${v.exitPE}; EPS growth ${v.growth}; first-year dividend ${companies[symbol].currency||'USD'} ${v.dividend}; dividend growth ${v.divGrowth}; required return ${v.hurdle}%.\n\nDiscounted value ${money(result.pv)} per share; reinvested CAGR ${pct(result.reinvestCAGR)}; cash-flow IRR ${pct(result.irr)}. ${result.assumption}\n`;saveNote();setNotes(true);};
function draft(){return makeDraft(symbol,noteSnapshot(),crypto.randomUUID(),new Date().toISOString());}
$('writing-draft').onclick=()=>{saveNote();try{const d=draft(),existing=JSON.parse(localStorage.getItem(draftKey)||'{}');localStorage.setItem(draftKey,JSON.stringify(appendDraft(existing,d)));window.location.href=`write.html?draft=${encodeURIComponent(d.id)}`;}catch(e){status(e.message||'Could not create the writing draft. Export it instead.',true);}};
$('note-export').onclick=()=>{try{download(`${symbol}-draft.json`,JSON.stringify(draft(),null,2));}catch(e){status(e.message,true);}};
$('notes-export').onclick=()=>{saveNote();download('research-notes.json',JSON.stringify({version:1,companies:symbols.filter(id=>companies[id].cik&&companies[id].ticker).map(id=>companies[id]),notes:state.notes},null,2));};
$('notes-import').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>1500000)throw Error('Notebook must be smaller than 1.5 MB.');saveNote();const imported=importedNotes(JSON.parse(await f.text()));for(const [ticker,n] of Object.entries(imported)){const old=state.notes[ticker];state.notes[ticker]=old?.body&&old.body!==n.body?{...old,body:`${old.body}\n\n---\nImported note\n\n${n.body}`}:{...n,type:$('note-type').value,review:Object.fromEntries(['business','risks','valuation','sources'].map(k=>[k,$('review-'+k).value])),updated:new Date().toISOString()};}persist();loadNote();status('Notes imported. Existing text was retained.');}catch(e){status(e.message,true);}finally{e.target.value='';}};
function loadNote(){const n=state.notes[symbol]||{};$('note-heading').textContent=`${symbol} · Note`;$('note-title').value=n.title||`${companies[symbol].name} (${symbol})`;$('note-body').value=n.body||'';$('note-decision').value=n.decision||'Unreviewed';$('note-type').value=n.type||'note';for(const k of ['business','risks','valuation','sources'])$('review-'+k).value=n.review?.[k]||'';$('note-status').textContent='Local';document.dispatchEvent(new Event('review-status-sync'));}
function changeCompany(){saveNote();symbol=$('company').value;state.company=symbol;loadNote();loadModel();series();loadReport();if($('filings').open)filings();persist();document.dispatchEvent(new Event('research-company'));}
$('company').replaceChildren(...symbols.map(id=>new Option(`${companies[id].ticker||id} · ${companies[id].name}`,id)));$('company').value=symbol;$('company').onchange=changeCompany;for(const [id,step] of [['prev',-1],['next',1]])$(id).onclick=()=>{const ids=[...$('company').options].map(o=>o.value);$('company').value=ids[(ids.indexOf(symbol)+step+ids.length)%ids.length];changeCompany();};
function setNotes(open){state.notesVisible=open;$('workspace').classList.toggle('tools-hidden',!open);$('notes-toggle').setAttribute('aria-expanded',String(open));persist();}
$('notes-toggle').onclick=()=>setNotes(state.notesVisible===false);$('density').onclick=()=>{state.compact=!state.compact;root.classList.toggle('compact',state.compact);$('density').setAttribute('aria-pressed',String(state.compact));persist();};
const drawerIds=['research','valuation','financials','filings','calculator','notes-panel'];
for(const id of drawerIds){const d=$(id);d.open=state.pins.includes(id)||(state.open[id]??id==='notes-panel');d.classList.toggle('pinned',state.pins.includes(id));d.addEventListener('toggle',()=>{if(!root.dataset.stage&&!d.open&&state.pins.includes(id)){d.open=true;return;}state.open[id]=d.open;persist();if(d.open&&id==='filings')filings();if(d.open&&id==='financials')series();});}
document.querySelectorAll('[data-pin]').forEach(c=>{const id=c.dataset.pin;c.checked=state.pins.includes(id);c.onchange=()=>{state.pins=state.pins.filter(x=>x!==id);if(c.checked){state.pins.push(id);$(id).open=true;}$(id).classList.toggle('pinned',c.checked);persist();};});
function width(value,save=true){const upper=Math.min(680,Math.max(300,$('workspace').clientWidth-415));const n=Math.min(upper,Math.max(300,value));$('desk-divider').setAttribute('aria-valuemax',String(upper));$('workspace').style.setProperty('--note-width',n+'px');$('desk-divider').setAttribute('aria-valuenow',String(n));state.noteWidth=n;if(save)persist();}
const divider=$('desk-divider');divider.addEventListener('pointerdown',e=>{divider.setPointerCapture(e.pointerId);});let raf;
divider.addEventListener('pointermove',e=>{if(!divider.hasPointerCapture(e.pointerId))return;const right=$('workspace').getBoundingClientRect().right;cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>width(right-e.clientX,false));});divider.addEventListener('pointerup',e=>{divider.releasePointerCapture(e.pointerId);persist();});divider.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();width(e.key==='Home'?300:e.key==='End'?680:(state.noteWidth||400)+(e.key==='ArrowLeft'?20:-20));}});
$('reset-layout').onclick=()=>{state.pins=[];state.open={};drawerIds.forEach(id=>{$(id).open=id==='notes-panel';$(id).classList.remove('pinned');});document.querySelectorAll('[data-pin]').forEach(c=>c.checked=false);state.compact=false;root.classList.remove('compact');$('density').setAttribute('aria-pressed','false');width(400);setNotes(true);persist();};
$('calc').oninput=()=>{try{const value=expression($('calc').value);$('calc-result').textContent=formatAmount(value,8);$('calc-result').title=String(value);}catch{$('calc-result').textContent='—';$('calc-result').title='';}};
state.chartPrefs=state.chartPrefs||{};
function companyMetadata(ticker){return filingList(ticker);}
async function companyFacts(ticker){return (await financialFacts(ticker)).facts;}
let activePoints=[],activeSources=[],activeUnit='',seriesGeneration=0,graphSpec=null;
async function series(){
 const generation=++seriesGeneration,ticker=symbol,pref=state.chartPrefs[symbol]||{},custom=state.series[symbol];
 $('metric').value=pref.metric||(custom?'custom':'revenue');
 for(const option of $('metric').options)option.disabled=option.value==='custom'&&!custom;
 $('series-past').value=pref.past||'all';$('series-mode').value=pref.mode||'level';
 const metric=$('metric').value,isCustom=metric==='custom';$('series-label').readOnly=!isCustom;$('series-label-field').hidden=!isCustom;$('series-unit-field').hidden=!isCustom;
 activePoints=[];activeSources=[];graphSpec=null;$('series-create').disabled=true;$('series-source').hidden=true;
 if(isCustom){activePoints=custom?.points||[];activeSources=custom?.source?activePoints.map(([year,value],i)=>({year,value,url:custom.source,label:custom.label,date:custom.observations?.[i]?.date})):[];activeUnit=custom?.unit||custom?.label||'USD';$('series-label').value=custom?.label||'Manual series';$('series-unit').value=activeUnit;drawSeries();return;}
 if(!$('financials').open)return;
 $('series-status').textContent='Loading…';
 try{const [meta,facts]=await Promise.all([companyMetadata(ticker),companyFacts(ticker)]);if(generation!==seriesGeneration)return;
 const names=metric==='revenue'?['RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','Revenue','SalesRevenueNet']:metric==='profit'?['NetIncomeLoss','ProfitLossAttributableToOwnersOfParent','ProfitLoss']:[companies[ticker].eps||'EarningsPerShareDiluted','DilutedEarningsLossPerShare'];
 const currency=companies[ticker].currency||'USD',unit=metric==='eps'?currency+'/shares':currency,byYear=new Map();
 const epsOption=$('metric').querySelector('[value=eps]');epsOption.disabled=!(facts[companies[ticker].eps||"EarningsPerShareDiluted"]||facts.DilutedEarningsLossPerShare);epsOption.textContent=companies[ticker].eps?'EPS (reported)':'Diluted EPS';
 for(const name of names){if(!facts[name])continue;for(const point of annualFacts(facts[name],unit,meta.asOf)){const year=Number(point.date.slice(0,4));if(!byYear.has(year))byYear.set(year,{...point,concept:name});}}
 const rows=[...byYear.entries()].sort((a,b)=>a[0]-b[0]);activePoints=rows.map(([y,v])=>[y,v.value]);
 activeSources=rows.map(([year,v])=>{const filing=meta.filings.find(f=>f.accession===v.accession);return {year,url:v.url||filing?.url||`https://www.sec.gov/Archives/edgar/data/${meta.cik}/${v.accession.replaceAll('-','')}/${v.accession}-index.html`,label:filing?filingLabel(filing):`10-K · ${year}`,date:v.date,start:v.start,value:v.value,concept:v.concept,unit};});
 activeUnit=metric==='eps'?currency+' / share':currency;$('series-label').value=$('metric').selectedOptions[0].textContent;drawSeries();
 }catch(e){if(generation===seriesGeneration)$('series-status').textContent=e.message;}
}
function drawSeries(){
 graphSpec=null;$('series-create').disabled=true;$('series-values').replaceChildren();
 state.chartPrefs[symbol]={metric:$('metric').value,past:$('series-past').value,mode:$('series-mode').value};persist();
 try{const selected=pastRange(activePoints,$('series-past').value);if(!selected.length){$('series-status').textContent='This field is not available in the loaded reports.';return;}
 const from=selected[0][0],through=selected.at(-1)[0],mode=$('series-mode').value,points=$('metric').value==='custom'&&state.series[symbol]?.frequency==='date'&&mode==='growth'?selected.flatMap(([date,value])=>{const iso=dateFromDecimal(date),prior=new Date(iso+'T00:00:00Z');prior.setUTCFullYear(prior.getUTCFullYear()-1);const key=decimalDate(prior.toISOString().slice(0,10)),previous=activePoints.find(p=>Math.abs(p[0]-key)<1e-7)?.[1];return previous>0?[[date,(value/previous-1)*100]]:[];}):chartSeries(activePoints,from,through,mode),unit=mode==='growth'?'%':mode==='indexed'?'Index (start = 100)':activeUnit;
 if(!points.length)throw Error('No values in this range.');
 const source=activeSources.filter(s=>s.year>=from&&s.year<=through&&s.url).at(-1);
 graphSpec={title:`${symbol} · ${$('series-label').value}${$('metric').value==='custom'?'':` (${companies[symbol].standard||'US GAAP'})`}`,points,unit,source:source?.url,sourceLabel:source?.label,sources:activeSources,frequency:$('metric').value==='custom'?(state.series[symbol]?.frequency||'year'):'year'};
 for(const [year,value]of points){const tr=document.createElement('tr');for(const v of [year,activePoints.find(p=>p[0]===year)?.[1],value]){const td=document.createElement('td');td.textContent=tr.children.length?formatAmount(v):String(v);tr.append(td);}$('series-values').append(tr);}
 $('series-status').textContent=`${periodLabel(from,graphSpec.frequency)}–${periodLabel(through,graphSpec.frequency)} · ${points.length} values`;$('series-create').disabled=false;
 }catch(e){$('series-status').textContent=e.message;}
}
$('series-create').onclick=()=>{drawSeries();if(!graphSpec)return;document.dispatchEvent(new CustomEvent('research-open-graph',{detail:graphSpec}));$('series-source').hidden=!graphSpec.source;if(graphSpec.source){$('series-source').href=graphSpec.source;$('series-source').textContent=graphSpec.sourceLabel;}};
$('metric').onchange=()=>{state.chartPrefs[symbol]={...state.chartPrefs[symbol],metric:$('metric').value};series();};
['series-past','series-mode'].forEach(id=>$(id).onchange=drawSeries);
$('series-label').onchange=()=>{if(state.series[symbol]&&$('metric').value==='custom'){state.series[symbol].label=$('series-label').value;activeUnit=state.series[symbol].unit||'$';persist();drawSeries();}};

async function filings(){const ticker=symbol,year=$('filing-year').value;$('filing-links').replaceChildren();$('filing-results').replaceChildren();try{const meta=await companyMetadata(ticker);if(symbol!==ticker||$('filing-year').value!==year)return;const rows=meta.filings.filter(f=>f.date.startsWith(year));$('filing-status').textContent=`${rows.length} filings · as of ${meta.asOf}${meta.provider?' · imported':''}`;const ir=document.createElement('a');ir.textContent=companies[ticker].provider==='company'?'Company reports ↗':'EDGAR ↗';ir.href=companies[ticker].ir||`https://www.sec.gov/edgar/browse/?CIK=${meta.cik}`;ir.target='_blank';ir.rel='noopener';$('filing-links').append(ir);for(const f of rows){const a=document.createElement('a');a.textContent=filingLabel(f);a.href=f.url;a.dataset.documentUrl=f.url;a.dataset.documentLabel=filingLabel(f);a.title=`Filed ${f.date}; period ${f.period||'—'}`;$('filing-results').append(a);}}catch{$('filing-status').textContent='Filings unavailable.';}}
$('filing-year').onchange=filings;
function reportDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('roy-research-documents',1);r.onupgradeneeded=()=>r.result.createObjectStore('reports');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function savedPDF(ticker,value){const db=await reportDB();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('reports',value?'readwrite':'readonly'),store=tx.objectStore('reports'),request=value?store.put(value,ticker):store.get(ticker);let found;request.onsuccess=()=>{found=request.result;};tx.oncomplete=()=>resolve(found);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
function reportStatus(text,error=false){$('report-status').textContent=text;$('report-status').hidden=!error;if(error)status(text,true);}
const viewer=new ReportViewer($('report-frame'),text=>reportStatus(text,/unable|unavailable/i.test(text)));
function showPDF(record){if(pdfURL)URL.revokeObjectURL(pdfURL);pdfURL=record?URL.createObjectURL(record.blob):null;$('report-link').hidden=!record;$('document-title').textContent=record?`${symbol} · ${record.name}`:`${symbol} · Company report`;if(record){$('report-link').href=pdfURL;viewer.load(record.blob);}else{$('report-link').removeAttribute('href');viewer.clear();reportStatus(`${symbol} · No local document selected.`);}}
async function loadReport(){const generation=++reportGeneration;showPDF(null);try{const record=await savedPDF(symbol);if(generation===reportGeneration)showPDF(record);}catch{reportStatus('Document storage unavailable. Open a local PDF.',true);}}
$('zoom-page').onclick=()=>viewer.fit();$('zoom-out').onclick=()=>viewer.zoom(1/1.2);$('zoom-in').onclick=()=>viewer.zoom(1.2);$('zoom-fit').onclick=()=>viewer.zoom(0);
$('report-upload').onchange=async e=>{const ticker=symbol;try{const f=e.target.files[0];if(!f)return;if(f.size>30000000||!f.name.toLowerCase().endsWith('.pdf'))throw Error('Select a PDF smaller than 30 MB.');const record={name:f.name,blob:f};await savedPDF(ticker,record);if(symbol===ticker){showPDF(record);document.dispatchEvent(new Event('report-loaded'));}}catch(error){reportStatus(error.message,true);}finally{e.target.value='';}};
root.classList.toggle('compact',Boolean(state.compact));$('density').setAttribute('aria-pressed',String(Boolean(state.compact)));width(Number(state.noteWidth)||400,false);$('workspace').classList.toggle('tools-hidden',state.notesVisible===false);$('notes-toggle').setAttribute('aria-expanded',String(state.notesVisible!==false));loadNote();loadModel();series();loadReport();if(blocked)status('Saved workspace could not be read. Existing storage has not been overwritten.',true);

function reviewMode(view){state.view=view;document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));$('review-fields').hidden=view!=='detailed';$('research').hidden=view!=='detailed';document.dispatchEvent(new Event('research-view'));if(view==='detailed'){$('research').open=true;$('notes-panel').open=true;setNotes(true);}persist();}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>reviewMode(b.dataset.view));reviewMode(state.view||'quick');


let resizeTimer;window.addEventListener("resize",()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>width(Number(state.noteWidth)||400,false),150);});

import("./research.mjs?v=company14").then(()=>import("./stages.mjs?v=company14")).catch(()=>status("Research library could not load. Reload to retry.",true));



$('series-unit').onchange=()=>{const custom=state.series[symbol];if(custom&&$('metric').value==='custom'){custom.unit=$('series-unit').value.trim()||'$';activeUnit=custom.unit;persist();drawSeries();}};

const quickImport=$('series-table').closest('details');quickImport.replaceChildren();const importSummary=document.createElement('summary');importSummary.textContent='Manual / CSV';const importHost=document.createElement('div');quickImport.append(importSummary,importHost);mountSeriesInput(importHost,data=>{state.series[symbol]={...data,label:data.name};state.chartPrefs[symbol]={metric:'custom'};persist();series();});
