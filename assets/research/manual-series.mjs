import {numberLiteral} from './amounts.mjs';
export function parseManualSeries(text,start,frequency='year'){
 const match=String(start).trim().match(frequency==='quarter'?/^(\d{4})\s*Q([1-4])$/i:/^(\d{4})$/);if(!match)throw Error(frequency==='quarter'?'Start with a year and quarter, e.g. 2020 Q1.':'Start with a year, e.g. 2020.');
 const year=+match[1];if(year<1900||year>2200)throw Error('Use a year between 1900 and 2200.');let currency=null;const points=[];const values=String(text).split(',');if(values.length>1000)throw Error('Use at most 1,000 values.');
 values.forEach((raw,i)=>{let s=raw.trim();if(!s)return;let negative=false;if(/^\(.*\)$/.test(s)){negative=true;s=s.slice(1,-1).trim();}if(/^[+-]/.test(s)){if(negative)throw Error('Use either a sign or parentheses.');negative=s[0]==='-';s=s.slice(1).trim();}const symbol=s.match(/^([$£€¥])/);if(symbol){if(currency&&currency!==symbol[1])throw Error('Use one currency per series.');currency=symbol[1];s=s.slice(1).trim();}const value=numberLiteral(s)*(negative?-1:1);if(!Number.isFinite(value))throw Error('Value is too large.');const period=year+(frequency==='quarter'?(+match[2]-1+i)/4:i);points.push([period,value]);});
 if(!points.length)throw Error('Enter comma-separated values.');return {points,unit:currency||'$',frequency};
}
export function periodLabel(value,frequency){return frequency==='quarter'?`${Math.floor(value)} Q${Math.round((value%1)*4)+1}`:String(value);}
