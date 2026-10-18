export function numberLiteral(text){
 const match=String(text).match(/^((?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([mbt])?$/i);
 if(!match)throw Error('Invalid number.');
 return Number(match[1])*({m:1e6,b:1e9,t:1e12}[match[2]?.toLowerCase()]||1);
}
export function formatAmount(value,digits=2){
 if(!Number.isFinite(value))return '—';
 let scale=1,suffix='';
 for(const [n,s] of [[1e12,'t'],[1e9,'b'],[1e6,'m']])if(Math.abs(value)>=n){scale=n;suffix=s;break;}
 if(scale>1&&scale<1e12&&Math.abs(Number((value/scale).toFixed(digits)))>=1000){scale*=1000;suffix=scale===1e9?'b':'t';}
 return (value/scale).toLocaleString('en-US',{maximumFractionDigits:digits})+suffix;
}
