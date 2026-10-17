export const symbols=['MCD','AAPL','CAT','KO','NKE'];
export const companies={MCD:{name:'McDonald’s',cik:'63908'},AAPL:{name:'Apple',cik:'320193'},CAT:{name:'Caterpillar',cik:'18230'},KO:{name:'Coca-Cola',cik:'21344'},NKE:{name:'Nike',cik:'320187'}};
export const draftKey='roy-writing-drafts-v1';
export function parseSeries(text){
 const lines=text.trim().split(/\r?\n/);if(!/^year,value$/i.test(lines.shift()?.trim()||''))throw Error('CSV header must be year,value.');
 const rows=lines.filter(x=>x.trim()).map(l=>l.split(',').map(x=>x.trim()));
 if(!rows.length||rows.length>1000||rows.some(r=>r.length!==2||r.some(x=>!x)||!r.every(x=>Number.isFinite(Number(x)))))throw Error('Use 1–1,000 numeric year,value rows.');
 const points=rows.map(r=>r.map(Number)).sort((a,b)=>a[0]-b[0]);
 if(points.some(r=>!Number.isInteger(r[0])||r[0]<1800||r[0]>2200)||new Set(points.map(r=>r[0])).size!==points.length)throw Error('Years must be unique integers between 1800 and 2200.');return points;
}
export function makeDraft(symbol,note,id,date){
 if(!symbols.includes(symbol)||!note||typeof note.body!=='string')throw Error('Invalid note.');
 const body=[note.body,...Object.entries(note.review||{}).filter(([,v])=>typeof v==='string'&&v.trim()).map(([k,v])=>`## ${k.charAt(0).toUpperCase()+k.slice(1)}\n\n${v}`)].filter(Boolean).join('\n\n');if(!body.trim())throw Error('The note is empty.');
 return {id,revision:null,type:['note','analysis','thesis'].includes(note.type)?note.type:'note',title:(note.title||`${symbol} research note`).slice(0,140),slug:`${symbol.toLowerCase()}-research-${date.slice(0,10)}-${id.slice(0,8)}`,category:'Investing / Research',subtitle:'',summary:body.replace(/[#*`]/g,'').slice(0,500),body,savedAt:date};
}
export function appendDraft(existing,draft){
 if(!existing||typeof existing!=='object'||Array.isArray(existing))throw Error('Writing draft storage could not be read. Export the research note instead.');
 for(const [id,d] of Object.entries(existing))if(!d||d.id!==id||typeof d.savedAt!=='string'||!['title','slug','type','category','subtitle','summary','body'].every(k=>typeof d[k]==='string'))throw Error('Existing writing drafts need recovery. No drafts were changed.');
 return {...existing,[draft.id]:draft};
}
export function importedNotes(data){
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid notebook file.');
 const notes=data.notes||data,result={};
 for(const symbol of symbols){const n=notes[symbol];if(!n)continue;const body=n.body??n.note;if(typeof body!=='string'||body.length>140000)throw Error('Invalid note content.');result[symbol]={type:['note','analysis','thesis'].includes(n.type)?n.type:'note',review:Object.fromEntries(Object.entries(n.review||{}).filter(([k,v])=>['business','risks','valuation','sources'].includes(k)&&typeof v==='string').map(([k,v])=>[k,v.slice(0,30000)])),title:typeof n.title==='string'?n.title.slice(0,140):`${symbol} research note`,body,decision:['Pass','Investigate','Unreviewed'].includes(n.decision)?n.decision:'Unreviewed'};}
 if(!Object.keys(result).length)throw Error('No supported company notes found.');return result;
}

// Growth uses the preceding calendar year, even when it is outside the visible range.
export function chartSeries(points, start, end, mode='level') {
 const visible=points.filter(([year])=>year>=start&&year<=end);
 if(mode==='indexed') {
  const base=visible[0]?.[1];
  if(!(base>0))throw Error('Indexing requires a positive starting value.');
  return visible.map(([year,value])=>[year,value/base*100]);
 }
 if(mode==='growth')return visible.flatMap(([year,value])=>{
  const prior=points.find(([y])=>y===year-1)?.[1];
  return prior>0?[[year,(value/prior-1)*100]]:[];
 });
 return visible;
}
