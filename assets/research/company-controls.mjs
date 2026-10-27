import {mountReviewQueue} from './review-queue.mjs';
import {companies,symbols} from './data.mjs?v=3';
export function mountCompanyControls(search){
 const select=document.getElementById('company'),toolbar=select.closest('.desk-toolbar'),label=select.parentElement;
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const key='roy-company-list-v1';let prefs={hidden:[],visited:{},sort:'recent'};
 try{const saved=JSON.parse(localStorage.getItem(key)||'{}');if(Array.isArray(saved.hidden))prefs.hidden=saved.hidden.filter(x=>typeof x==='string');if(saved.visited&&typeof saved.visited==='object')prefs.visited=saved.visited;if(['recent','az','za'].includes(saved.sort))prefs.sort=saved.sort;}catch{}
 const persist=()=>{try{localStorage.setItem(key,JSON.stringify(prefs));}catch{}};
 label.firstChild.textContent='';select.setAttribute('aria-label','Companies');
 const group=el('div');group.className='company-picker';label.before(group);group.append(label);
 const menu=el('details');menu.className='company-list-menu';const summary=el('summary','⋯');summary.setAttribute('aria-label','Company list options');menu.append(summary);const box=el('div');box.className='toolbar-popover';
 const sortLabel=el('label','Sort companies'),sort=el('select');sort.setAttribute('aria-label','Sort companies');sort.append(new Option('Most recent','recent'),new Option('Name A–Z','az'),new Option('Name Z–A','za'));sort.value=prefs.sort;sortLabel.append(sort);box.append(sortLabel);
 const remove=el('button','Remove from list');remove.type='button';remove.title='Remove from this list; notes and saved work are kept.';box.append(remove);menu.append(box);group.append(menu);group.after(search);
 const trigger=el('button');trigger.type='button';trigger.className='company-trigger';trigger.setAttribute('aria-label','Choose company');trigger.setAttribute('aria-expanded','false');group.prepend(trigger);label.hidden=true;
 const picker=el('div');picker.className='company-picker-dialog';picker.setAttribute('popover','auto');picker.setAttribute('aria-label','Company picker');toolbar.append(picker);
 const saved=el('div');saved.className='company-saved-list';picker.append(search,sortLabel,saved);menu.remove();
 function place(){const r=trigger.getBoundingClientRect();picker.style.left=Math.max(8,Math.min(r.left,innerWidth-368))+'px';picker.style.top=(r.bottom+8)+'px';}
 trigger.onclick=()=>{place();picker.togglePopover();};picker.addEventListener('toggle',e=>{trigger.setAttribute('aria-expanded',String(e.newState==='open'));if(e.newState==='open')search.querySelector('input').focus();});
 window.addEventListener('resize',()=>{if(picker.matches(':popover-open'))place();});
 function savedRows(ids){trigger.textContent=`${companies[select.value]?.ticker||select.value} · ${companies[select.value]?.name||''} ▾`;saved.replaceChildren();for(const id of ids){const row=el('div');row.className='company-saved-row';const choose=el('button',`${companies[id].ticker||id} · ${companies[id].name}`);choose.type='button';choose.setAttribute('aria-current',String(id===select.value));choose.onclick=()=>{select.value=id;select.dispatchEvent(new Event('change'));};const discard=el('button','×');discard.type='button';discard.setAttribute('aria-label',`Remove ${companies[id].name} from list`);discard.disabled=ids.length<2;discard.onclick=()=>{prefs.hidden.push(id);persist();if(id===select.value){select.value=ids.find(x=>x!==id);select.dispatchEvent(new Event('change'));}else render();};row.append(choose,discard);saved.append(row);}}
 mountReviewQueue(toolbar,group);

 function render(){const current=select.value,ids=symbols.filter(id=>!prefs.hidden.includes(id));if(current&&!ids.includes(current))ids.push(current);ids.sort((a,b)=>prefs.sort==='recent'?(Number(prefs.visited[b])||0)-(Number(prefs.visited[a])||0):(prefs.sort==='za'?-1:1)*companies[a].name.localeCompare(companies[b].name));select.replaceChildren(...ids.map(id=>new Option(`${companies[id].ticker||id} · ${companies[id].name}`,id)));select.value=current;remove.disabled=ids.length<2;savedRows(ids);}
 let stepping=false;
 document.addEventListener('research-company',()=>{const id=select.value;prefs.hidden=prefs.hidden.filter(x=>x!==id);prefs.visited[id]=Date.now();persist();if(!stepping)render();else savedRows([...select.options].map(o=>o.value));picker.hidePopover();});
 sort.onchange=()=>{prefs.sort=sort.value;persist();render();};
 remove.onclick=()=>{const id=select.value,next=[...select.options].find(o=>o.value!==id)?.value;if(!next)return;prefs.hidden.push(id);persist();select.value=next;select.dispatchEvent(new Event('change'));menu.open=false;};
 for(const [id,step]of [['prev',-1],['next',1]])document.getElementById(id).onclick=()=>{const ids=[...select.options].map(o=>o.value);select.value=ids[(ids.indexOf(select.value)+step+ids.length)%ids.length];stepping=true;select.dispatchEvent(new Event('change'));stepping=false;};
 prefs.hidden=prefs.hidden.filter(id=>id!==select.value);prefs.visited[select.value]=Date.now();persist();render();
 const settings=el('details');settings.className='desk-view-menu';const settingsSummary=el('summary','View');settings.append(settingsSummary);const settingBox=el('div');settingBox.className='toolbar-popover';for(const id of ['theme-toggle','density'])settingBox.append(document.getElementById(id));const reset=toolbar.querySelector('.reset-layout-short');if(reset)settingBox.append(reset);settings.append(settingBox);toolbar.append(settings);
 document.addEventListener('pointerdown',e=>{for(const d of [menu,settings])if(!d.contains(e.target))d.open=false;});
 for(const d of [menu,settings])d.onkeydown=e=>{if(e.key==='Escape'){d.open=false;d.querySelector('summary').focus();}};
}
