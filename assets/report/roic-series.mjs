// Keep missing years visible, including an unresolved latest fiscal year.
// No interpolation or carry-forward of an earlier return.
export function alignRoicHistory(observations,annualDates){
 const years=new Set(annualDates.filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).map(d=>d.slice(0,4)));
 if(!years.size)return [];
 const points=new Map(observations.filter(p=>years.has(p.year)&&Number.isFinite(p.roic)).map(p=>[p.year,p.roic]));
 if(!points.size)return [];
 const first=Number([...points.keys()].sort()[0]),last=Number([...years].sort().at(-1));
 return Array.from({length:last-first+1},(_,i)=>{const year=String(first+i);return {year,roic:points.get(year)??null};});
}
