import {expression,irr} from './finance.mjs?v=5';
export function migrateGrowth(saved){if(!saved||saved.growthVersion===2)return saved;return {...saved,growth:`(${String(saved.growth??'.05').replace(/\bt\b/g,'(t-1)')})*x`,growthVersion:2};}
export function epsPath({eps,years,growth,exitPE}){
 if(![eps,years,exitPE].every(Number.isFinite)||eps<=0||exitPE<=0||!Number.isInteger(years)||years<1||years>50)throw Error('Use positive EPS and P/E, and 1–50 whole years.');
 const rows=[];for(let t=1;t<=years;t++){eps+=expression(growth,t,eps);if(!Number.isFinite(eps)||eps<=0||!Number.isFinite(eps*exitPE))throw Error('EPS must remain positive and finite in every projected year.');rows.push(eps);}return rows;
}
export function projectedPrice(input){return epsPath(input).at(-1)*input.exitPE;}
export function discountedPrice(input){
 const {price,expectedPrice,discountYears:years,hurdle,dividend,divGrowth}=input;
 if(![price,expectedPrice,years,hurdle,dividend].every(Number.isFinite)||price<=0||expectedPrice<=0||!Number.isInteger(years)||years<1||years>50||hurdle<=-1||dividend<0)throw Error('Use positive prices, 1–50 whole years, nonnegative dividends and a return above −100%.');
 let path=null;try{const projected=epsPath(input);if(input.years===years&&Math.abs(projected.at(-1)*input.exitPE-expectedPrice)<Math.max(1,expectedPrice)*1e-10)path=projected;}catch{}
 let pv=0,shares=1,cash=0,d=dividend;const rows=[];
 for(let year=1;year<=years;year++){
  const dg=year===1?0:expression(divGrowth,year-2);if(dg<=-1)throw Error('Dividend growth must exceed −100%.');if(year>1)d*=1+dg;
  const pe=path?price/input.eps+(input.exitPE-price/input.eps)*year/years:null,p=path?path[year-1]*pe:price*(expectedPrice/price)**(year/years),openingShares=shares,received=shares*d;shares+=received/p;cash+=d;pv+=d/(1+hurdle)**year;
  const row={year,eps:path?path[year-1]:null,pe,price:p,dividend:d,dividendGrowth:dg,openingShares,reinvestedDividend:received,shares,cash,wealth:shares*p,cashWealth:p+cash};
  if(!Object.values(row).every(v=>v===null||Number.isFinite(v)))throw Error('Inputs produce values too large to calculate.');rows.push(row);
 }
 pv+=expectedPrice/(1+hurdle)**years;if(!Number.isFinite(pv))throw Error('Discounted value is outside the supported range.');
 return {assumption:path?'Annual dividends; linear P/E path; no taxes or fees.':'Annual dividends; constant price growth to the expected exit price for reinvestment; no taxes or fees.',rows,pv,exit:expectedPrice,reinvestCAGR:(rows.at(-1).wealth/price)**(1/years)-1,irr:irr(price,rows.map(r=>r.dividend),expectedPrice)};
}
