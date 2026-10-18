import {expression} from './finance.mjs?v=4';
export function safeURL(value){const u=new URL(value);if(!['https:','http:'].includes(u.protocol))throw Error('Use an http or https source URL.');return u.href;}
export function validDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
export function parseObservations(text){
 const rows=text.trim().split(/\r?\n/).map(l=>l.split(/[,\t]/).map(v=>v.trim()));
 const header=rows.shift();if(header?.length!==2||!['date','year','observation_date'].includes(header[0].toLowerCase()))throw Error('Use two columns: date,value (or a FRED CSV).');
 const out=[];for(const r of rows){if(r.length===1&&!r[0])continue;if(r.length!==2)throw Error('Use exactly two columns.');if(r[1]==='.'||r[1]==='')continue;const date=/^\d{4}$/.test(r[0])?r[0]+'-12-31':r[0];if(!validDate(date)||!Number.isFinite(Number(r[1])))throw Error('Each row needs a valid date and finite value.');out.push({date,value:Number(r[1])});}
 if(!out.length||out.length>20000||new Set(out.map(p=>p.date)).size!==out.length)throw Error('Use 1–20,000 unique dates.');return out.sort((a,b)=>a.date.localeCompare(b.date));
}
export function annualize(points,method){
 const groups=new Map();for(const p of points){const y=p.date.slice(0,4);if(!groups.has(y))groups.set(y,[]);groups.get(y).push(p);}
 return [...groups].sort().map(([year,rows])=>{rows.sort((a,b)=>a.date.localeCompare(b.date));const value=method==='sum'?rows.reduce((s,p)=>s+p.value,0):method==='mean'?rows.reduce((s,p)=>s+p.value,0)/rows.length:rows.at(-1).value;return {date:year+'-12-31',value,count:rows.length};});
}
export function transform(points,mode){
 if(!points.length)return [];
 if(mode==='indexed'){if(points[0].value<=0)throw Error('Indexing requires a positive first value.');return points.map(p=>({...p,value:p.value/points[0].value*100}));}
 if(mode==='change')return points.slice(1).flatMap((p,i)=>points[i].value>0?[{...p,value:(p.value/points[i].value-1)*100}]:[]);
 return points;
}
export function relationship(a,b,formula){
 if(!formula.trim()||formula.length>100||/[^AB\d.eE+\-*/^()\s]/.test(formula))throw Error('Use A, B, numbers and arithmetic operators.');
 const second=new Map(b.map(p=>[p.date,p]));let skipped=0;const points=[];
 for(const p of a){const q=second.get(p.date);if(!q){skipped++;continue;}try{points.push({date:p.date,value:expression(formula.replace(/A/g,`(${p.value})`).replace(/B/g,`(${q.value})`)),inputs:[p,q]});}catch{skipped++;}}
 if(!points.length)throw Error('No matching dates with finite results. Choose explicit annual alignment if needed.');return {points,skipped};
}
export function annualFacts(fact,unit,cutoff){
 const byEnd=new Map();for(const p of fact.units[unit]||[]){if(!['10-K','10-K/A'].includes(p.form)||p.filed>cutoff||p.end>cutoff)continue;if(p.start){const days=(Date.parse(p.end)-Date.parse(p.start))/86400000;if(days<330||days>380)continue;}
  if(!Number.isFinite(p.val))continue;const previous=byEnd.get(p.end);if(!previous||p.filed>previous.filed)byEnd.set(p.end,p);
 }
 return [...byEnd.values()].sort((a,b)=>a.end.localeCompare(b.end)).map(p=>({date:p.end,value:p.val,filed:p.filed,start:p.start||null,accession:p.accn}));
}

// Preserve extrema and endpoints when a long daily series exceeds chart resolution.
export function plotSample(points,limit=600){
 if(points.length<=limit)return points;
 const selected=new Set([0,points.length-1]),size=Math.ceil(points.length/((limit-2)/2));
 for(let start=0;start<points.length;start+=size){let lo=start,hi=start;for(let i=start;i<Math.min(points.length,start+size);i++){if(points[i].value<points[lo].value)lo=i;if(points[i].value>points[hi].value)hi=i;}selected.add(lo);selected.add(hi);}
 return [...selected].sort((a,b)=>a-b).map(i=>points[i]);
}
