const root=document.documentElement,desk=document.getElementById('main'),full=document.getElementById('fullscreen'),theme=document.getElementById('theme-toggle');
function applyTheme(dark){root.dataset.theme=dark?'dark':'light';theme.setAttribute('aria-pressed',String(dark));theme.textContent=dark?'Light mode':'Dark mode';}
let stored;try{stored=localStorage.getItem('roy-research-theme');}catch{}
applyTheme(stored?stored==='dark':matchMedia('(prefers-color-scheme: dark)').matches);
theme.onclick=()=>{const dark=root.dataset.theme!=='dark';applyTheme(dark);try{localStorage.setItem('roy-research-theme',dark?'dark':'light');}catch{}};
function sync(){const active=Boolean(document.fullscreenElement)||desk.classList.contains('desk-expanded');full.textContent=active?'Exit fullscreen':'Fullscreen';full.setAttribute('aria-pressed',String(active));}
async function exit(){if(document.fullscreenElement)await document.exitFullscreen();desk.classList.remove('desk-expanded');document.body.classList.remove('desk-is-expanded');sync();window.dispatchEvent(new Event('resize'));}
// Full-window layout preserves browser pinch zoom, including embedded documents.
full.onclick=async()=>{if(document.fullscreenElement||desk.classList.contains('desk-expanded')){await exit();return;}desk.classList.add('desk-expanded');document.body.classList.add('desk-is-expanded');sync();window.dispatchEvent(new Event('resize'));};
document.addEventListener('fullscreenchange',sync);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&(document.fullscreenElement||desk.classList.contains('desk-expanded'))){e.preventDefault();exit();}});

const toolbar=desk.querySelector('.desk-toolbar');
new ResizeObserver(()=>desk.style.setProperty('--toolbar-height',toolbar.getBoundingClientRect().height+'px')).observe(toolbar);
