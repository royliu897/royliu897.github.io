import {numberLiteral} from './amounts.mjs';
// Deliberately small arithmetic language; no execution of user-entered JavaScript.
export function expression(source, t=0) {
  const s=String(source).trim(); let pos=0;
  function ws(){while(/\s/.test(s[pos]||'')&&pos<s.length)pos++;}
  function atom(){ws();if(s[pos]==='('){pos++;const v=sum();ws();if(s[pos++]!==')')throw Error('Missing closing parenthesis');return v;}if(s[pos]==='t'){pos++;return t;}const m=s.slice(pos).match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?[mbt]?/i);if(!m)throw Error('Use numbers, m/b/t suffixes, parentheses and + − * / ^.');pos+=m[0].length;return numberLiteral(m[0]);}
  function power(){let a=atom();ws();if(s[pos]==='^'){pos++;a=Math.pow(a,unary());}return a;}
  function unary(){ws();if(s[pos]==='+'){pos++;return unary();}if(s[pos]==='-'){pos++;return -unary();}return power();}
  function product(){let a=unary();ws();while(s[pos]==='*'||s[pos]==='/'){const op=s[pos++],b=unary();a=op==='*'?a*b:a/b;ws();}return a;}
  function sum(){let a=product();ws();while(s[pos]==='+'||s[pos]==='-'){const op=s[pos++],b=product();a=op==='+'?a+b:a-b;ws();}return a;}
  if(s.length>200)throw Error('Expression too long');const value=sum();ws();if(pos!==s.length||!Number.isFinite(value))throw Error('Invalid or non-finite expression');return value;
}
export function irr(price, dividends, exit){
  const npv=r=>dividends.reduce((v,d,i)=>v+d/(1+r)**(i+1),-price)+exit/(1+r)**dividends.length;
  let lo=-0.9999,hi=1;while(npv(hi)>0&&hi<1e8)hi*=2;
  for(let n=0;n<180;n++){let mid=(lo+hi)/2;if(npv(mid)>0)lo=mid;else hi=mid;}return (lo+hi)/2;
}
export function model({price,eps,years,hurdle,exitPE,growth,dividend,divGrowth}){
  if(![price,eps,exitPE,dividend,hurdle,years].every(Number.isFinite)||!(price>0&&eps>0&&exitPE>0&&dividend>=0&&hurdle>-1&&Number.isInteger(years)&&years>=1&&years<=50))throw Error('Use finite positive price, EPS and P/E; nonnegative dividends; 1–50 whole years; required return above −100%.');
  let shares=1,cash=0,e=eps,d=dividend,pv=0;const rows=[],startPE=price/eps;
  for(let year=1;year<=years;year++){
    const t=year-1,g=expression(growth,t),dg=year===1?0:expression(divGrowth,year-2);
    if(g<=-1||dg<=-1)throw Error('Annual growth must be greater than −100%.');
    e*=1+g;if(year>1)d*=1+dg;
    const pe=startPE+(exitPE-startPE)*year/years, p=e*pe,received=shares*d;
    const openingShares=shares;shares+=received/p;cash+=d;pv+=d/(1+hurdle)**year;
    rows.push({year,epsGrowth:g,dividendGrowth:dg,eps:e,pe,price:p,dividend:d,dividendYield:d/p,openingShares,reinvestedDividend:received,shares,cash,wealth:shares*p,cashWealth:p+cash});
    if(!Object.values(rows.at(-1)).every(Number.isFinite))throw Error('Inputs produce values too large to calculate.');
  }
  const last=rows.at(-1);pv+=last.price/(1+hurdle)**years;
  return {rows,pv,exit:last.price,reinvestCAGR:(last.wealth/price)**(1/years)-1,cashCAGR:(last.cashWealth/price)**(1/years)-1,irr:irr(price,rows.map(r=>r.dividend),last.price)};
}
