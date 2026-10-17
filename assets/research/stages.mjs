const $=id=>document.getElementById(id),desk=$('main'),workspace=$('workspace'),drawers=$('tools-panel').querySelector('.desk-drawers');
const dock=document.createElement('div');dock.id='quick-dock';workspace.append(dock);
const detail=document.createElement('section');detail.id='detail-workspace';detail.hidden=true;workspace.after(detail);
const nav=document.createElement('nav');nav.className='research-tabs';nav.setAttribute('aria-label','Research workspace');
const content=document.createElement('div');content.className='research-content';const library=$('research'),body=library.querySelector('.drawer-body');
const sections=[...body.children].filter(e=>e.tagName==='DETAILS');
const collection=document.createElement('aside');collection.className='document-collection';collection.setAttribute('aria-label','Document collection');
const heading=document.createElement('h2');heading.textContent='Document collection';collection.append(heading,$('library-status'),sections[0]);
const main=document.createElement('div');main.className='research-main';main.append(nav,content);detail.append(collection,main);
const panels={};for(const name of ['Chart','Models','Data','Events','Notes','Report']){const panel=document.createElement('section');panel.hidden=true;panel.className='research-panel';panel.id='panel-'+name.toLowerCase();content.append(panel);panels[name]=panel;const b=document.createElement('button');b.textContent=name;b.setAttribute('aria-controls',panel.id);b.onclick=()=>show(name);nav.append(b);}
panels.Data.append(sections[1],sections[2],sections[3],sections[7]);panels.Chart.append(sections[4]);panels.Models.append(sections[5]);panels.Events.append(sections[6]);
// Keep the original IDs and live nodes: calculations, notes and source links retain state.
main.append($('research-message'));library.hidden=true;
let active='Chart';
function show(name){active=name;for(const [key,panel] of Object.entries(panels))panel.hidden=key!==name;for(const b of nav.children)b.setAttribute('aria-pressed',String(b.textContent===name));if(name==='Report')panels.Report.append($('reports'));for(const d of panels[name].children)if(d.tagName==='DETAILS'&&name!=='Data'&&!['valuation','calculator'].includes(d.id))d.open=true;}
function stage(){const detailed=document.querySelector('[data-view="detailed"]').getAttribute('aria-pressed')==='true';desk.dataset.stage=detailed?'detailed':'quick';detail.hidden=!detailed;workspace.hidden=detailed;
 if(detailed){panels.Notes.append($('notes-panel'));panels.Report.append($('reports'));panels.Models.append($('valuation'),$('calculator'));$('valuation').open=false;$('calculator').open=false;$('notes-panel').open=true;show(active);}
 else{workspace.prepend($('reports'));dock.append($('notes-panel'),$('calculator'));$('notes-panel').open=true;$('calculator').open=true;for(const id of ['valuation','financials','filings','archive']){$(id).open=false;drawers.append($(id));}}
 size();
}
function size(){const rect=desk.getBoundingClientRect();const top=desk.classList.contains('desk-expanded')||document.fullscreenElement?0:Math.max(0,rect.top);desk.style.setProperty('--stage-height',Math.max(400,innerHeight-top-12)+'px');}
document.addEventListener('research-view',stage);window.addEventListener('resize',size);document.addEventListener('fullscreenchange',size);
for(const id of ['valuation','financials','filings','archive'])$(id).addEventListener('toggle',()=>{if(desk.dataset.stage!=='quick'||!$(id).open)return;for(const other of ['valuation','financials','filings','archive'])if(other!==id)$(other).open=false;});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&desk.dataset.stage==='quick')for(const id of ['valuation','financials','filings','archive'])$(id).open=false;});
show(active);stage();
