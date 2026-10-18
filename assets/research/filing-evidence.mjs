// Cached public filings are fetched only when a viewer or Evidence is opened.
let catalogue;
const indexes=new Map();
export function accessionFromURL(value){try{const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='www.sec.gov')return null;const m=u.pathname.match(/^\/Archives\/edgar\/data\/\d+\/(\d{18})\//);return m?`${m[1].slice(0,10)}-${m[1].slice(10,12)}-${m[1].slice(12)}`:null;}catch{return null;}}
async function json(url){const r=await fetch(url);if(!r.ok)throw Error('Cached filing unavailable.');return r.json();}
export async function cachedFiling(url){const accession=accessionFromURL(url);if(!accession)return null;catalogue??=json('assets/research/filing-cache/manifest.json').catch(e=>{catalogue=null;throw e;});const entry=(await catalogue).filings.find(f=>f.accession===accession);if(!entry)return null;if(!indexes.has(accession))indexes.set(accession,json(entry.base+entry.index).catch(e=>{indexes.delete(accession);throw e;}));return {...await indexes.get(accession),base:entry.base};}
export function matchFact(index,{concept,start,date,unit,value}){
 if(!concept||!date||!unit||!Number.isFinite(value))return null;
 const matches=index.facts.filter(f=>f.concept===concept&&f.end===date&&f.unit===unit&&f.value===value&&(!start||f.start===start));
 // Repeated display of the same fact is fine; different duration contexts are not.
 if(!matches.length||new Set(matches.map(f=>f.start+'|'+f.end+'|'+f.unit)).size!==1)return null;
 return matches[0];
}
const element=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
function originalLink(url){const a=element('a','Original ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
export function filingFrame(url,title,anchor){const frame=element('iframe');frame.className='cached-filing';frame.title=title;frame.loading='lazy';frame.setAttribute('sandbox','allow-same-origin allow-popups allow-popups-to-escape-sandbox');frame.referrerPolicy='no-referrer';frame.src=url+(anchor?'#'+encodeURIComponent(anchor):'');return frame;}
export async function mountFiling(host,url,title,anchor,useCache=false){
 if(!host.isConnected)return;
 host.replaceChildren();
 if(!useCache){const frame=filingFrame(url,title,anchor);frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');host.append(frame);return;}
 const loading=element('p','Loading…');host.append(loading);
 try{const cached=await cachedFiling(url);if(!host.isConnected||!host.contains(loading))return;loading.remove();
 if(cached){host.append(filingFrame(cached.base+cached.file,title,anchor));return;}
 host.append(element('p','No cached copy available.'));
 }catch{if(host.isConnected&&host.contains(loading))loading.textContent='Cached copy unavailable.';}
}
export async function renderEvidence(host,series,point){
 host.replaceChildren();const url=point.url||series.source;if(!url){host.append(element('p','No source linked.'));return;}
 const header=element('div');header.className='evidence-heading';header.append(element('span',`${point.date} · ${point.value.toLocaleString()} ${series.unit}`),originalLink(url));host.append(header);
 const pending=element('p','Loading…');host.append(pending);
 try{const cached=await cachedFiling(url);if(!host.isConnected||host.firstChild!==header)return;pending.remove();const concept=series.definition||point.concept;
 const match=cached&&matchFact(cached,{concept,start:point.start,date:point.date,unit:series.unit,value:point.value});
 if(!match){host.append(element('p',cached?'Exact excerpt not matched.':'No cached excerpt.'));return;}
 const open=element('button','Full filing');open.type='button';open.onclick=()=>{document.dispatchEvent(new CustomEvent('research-open-document',{detail:{url:cached.url,label:cached.label,anchor:match.anchor}}));host.closest('dialog')?.close();};header.append(open);
 host.append(filingFrame(cached.base+match.excerpt,`${concept} · ${point.date}`,match.anchor));
 const disclosure=element('details'),summary=element('summary','Copy details');disclosure.append(summary,element('p',cached.changes.join(' · ')));host.append(disclosure);
 }catch{if(host.isConnected&&host.firstChild===header)pending.textContent='Cached excerpt unavailable.';}
}
