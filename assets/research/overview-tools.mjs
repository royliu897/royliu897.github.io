export const rowKeys=['revenue','profit','eps','grossMargin','opMargin','netMargin','cfo','capex','fcf','cash','equity','dividends','outstanding','shares'];
const definitions={
 revenue:'Revenue recognized from selling goods and services during the period.',
 profit:'Reported net income after expenses and taxes. The source concept identifies whether it is attributable to the parent or includes noncontrolling interests.',
 eps:'Reported earnings per share. Diluted EPS includes potentially dilutive securities; basic EPS is used only when diluted data is unavailable. The filing’s share basis is preserved, without ADR conversion.',
 grossMargin:'Gross profit ÷ revenue × 100',opMargin:'Operating profit ÷ revenue × 100',netMargin:'Net income ÷ revenue × 100',
 cfo:'Cash provided by operating activities, including working-capital movements.',
 capex:'Reported cash payments to acquire property, plant and equipment. This does not necessarily include all investment spending.',
 fcf:'Operating cash flow − capital spending',cash:'Cash and cash equivalents at the period end.',
 equity:'Reported equity attributable to shareholders of the parent at the period end.',
 dividends:'Dividends per share reported for the period. Declaration and distribution dates depend on the source concept.',
 outstanding:'Reported shares outstanding at the period end; this is not the public float.',
 shares:'Weighted-average diluted shares during the period; this differs from period-end shares outstanding.'
};
export function definition(key,series,data){
 const point=series.points.find(p=>data.facts?.[p.concept]?.description);
 return {text:definitions[key]||series.label,reported:point?data.facts[point.concept].description:'',derived:['grossMargin','opMargin','netMargin','fcf'].includes(key)};
}
export function appliedFormula(key,point){
 if(!point.inputs)return '';
 const [a,b]=point.inputs,fmt=n=>n.toLocaleString('en-US',{maximumFractionDigits:4});
 return key==='fcf'?`${fmt(a.value)} − ${fmt(b.value)} = ${fmt(point.value)} ${point.unit}`:`${fmt(a.value)} ÷ ${fmt(b.value)} × 100 = ${fmt(point.value)}%`;
}
export function rectangle(a,b){const cells=[];for(let r=Math.min(a.r,b.r);r<=Math.max(a.r,b.r);r++)for(let c=Math.min(a.c,b.c);c<=Math.max(a.c,b.c);c++)cells.push(`${r}:${c}`);return cells;}
export function summarize(cells){
 const groups=new Map();for(const cell of cells){if(!Number.isFinite(cell.value))continue;const group=groups.get(cell.unit)||[];group.push(cell.value);groups.set(cell.unit,group);}
 return [...groups].map(([unit,values])=>{const sum=values.reduce((a,b)=>a+b,0);return {unit,count:values.length,sum,average:sum/values.length,min:Math.min(...values),max:Math.max(...values)};});
}
export function chartLines(report,spec){
 const lines=(spec.keys||[]).filter(k=>report.series[k]).map(key=>{const s=report.series[key],dates=spec.dates?.[key]||report.periods;return {key,label:s.label,unit:s.unit,points:s.points.filter(p=>dates.includes(p.date)&&(!spec.from||p.date>=spec.from)&&(!spec.to||p.date<=spec.to))};}).filter(s=>s.points.length);
 if(!lines.length)throw Error('No values in this range.');
 if(spec.mode==='indexed'){for(const s of lines){const base=s.points[0].value;if(!(base>0))throw Error('Start = 100 needs a positive first value for every series.');s.points=s.points.map(p=>({...p,value:p.value/base*100}));s.unit='Start = 100';}}
 else if(new Set(lines.map(s=>s.unit)).size>1)throw Error('Select matching units, or use Start = 100.');
 return lines;
}
