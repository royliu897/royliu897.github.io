import {validDate} from './research-data.mjs?v=4';
export function parsePeriod(value,end=false){
 const s=String(value).trim();if(validDate(s))return s;
 const direct=s.match(/^(\d{4})(?:[\s-]*Q([1-4]))?$/i),reverse=s.match(/^Q([1-4])\s+(\d{4})$/i);const m=direct||(reverse?[reverse[0],reverse[2],reverse[1]]:null);
 if(!m)throw Error('Enter a year or quarter, e.g. 2025 or 2025 Q2.');
 const y=Number(m[1]),q=m[2]?Number(m[2]):null;if(y<1900||y>2200)throw Error('Use a year from 1900 to 2200.');
 const month=q?(end?q*3:(q-1)*3+1):(end?12:1),day=end?new Date(Date.UTC(y,month,0)).getUTCDate():1;
 return `${y}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
export function quarterLabel(date){if(!validDate(date))return date||'';return `${date.slice(0,4)} Q${Math.ceil(Number(date.slice(5,7))/3)}`;}
export function filingLabel(f){
 const form=f.form,date=f.date||f.filingDate,period=f.period||f.reportDate;
 if(/^10-[KQ]/.test(form))return `${form} · ${quarterLabel(period||date).replace(/^(\d{4}) (Q[1-4])$/, '$2 $1')}`;
 return `${form} · ${date||''}`;
}
export function pastRange(points,input){
 const text=String(input).trim().toLowerCase();if(!points.length)return [];
 if(text==='all')return points;
 if(!/^\d+$/.test(text)||Number(text)<1)throw Error('Enter a positive number of years, or all.');
 const last=points.at(-1)[0],first=last-Number(text)+1;
 return points.filter(([year])=>year>=first);
}

export function periodInput(date,end=false){if(!validDate(date))return date||'';const q=quarterLabel(date);return parsePeriod(q,end)===date?q:date;}
