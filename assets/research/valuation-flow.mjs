import {expression,irr,model} from './finance.mjs?v=4';
export function projectedPrice({eps,years,growth,exitPE}){
 if(![eps,years,exitPE].every(Number.isFinite)||eps<=0||exitPE<=0||!Number.isInteger(years)||years<1||years>50)throw Error('Use positive EPS and P/E, and 1–50 whole years.');
 for(let t=0;t<years;t++){const g=expression(growth,t);if(g<=-1)throw Error('EPS growth must exceed −100%.');eps*=1+g;}
 const price=eps*exitPE;if(!Number.isFinite(price)||price<=0)throw Error('Projected price is outside the supported range.');return price;
}
export function discountedPrice(input){
 const {price,expectedPrice,discountYears:years,hurdle,dividend,divGrowth}=input;
 if(![price,expectedPrice,years,hurdle,dividend].every(Number.isFinite)||price<=0||expectedPrice<=0||!Number.isInteger(years)||years<1||years>50||hurdle<=-1||dividend<0)throw Error('Use positive prices, 1–50 whole years, nonnegative dividends and a return above −100%.');
 try{if(input.years===years&&Math.abs(projectedPrice(input)-expectedPrice)<Math.max(1,expectedPrice)*1e-10)return {...model(input),assumption:'Annual dividends; linear P/E path; no taxes or fees.'};}catch{}
 let pv=0,shares=1,cash=0,d=dividend;const rows=[];
 for(let year=1;year<=years;year++){
  const dg=year===1?0:expression(divGrowth,year-2);if(dg<=-1)throw Error('Dividend growth must exceed −100%.');if(year>1)d*=1+dg;
  const p=price*(expectedPrice/price)**(year/years),openingShares=shares,received=shares*d;shares+=received/p;cash+=d;pv+=d/(1+hurdle)**year;
  const row={year,eps:null,pe:null,price:p,dividend:d,dividendGrowth:dg,openingShares,reinvestedDividend:received,shares,cash,wealth:shares*p,cashWealth:p+cash};
  if(!Object.values(row).every(v=>v===null||Number.isFinite(v)))throw Error('Inputs produce values too large to calculate.');rows.push(row);
 }
 pv+=expectedPrice/(1+hurdle)**years;if(!Number.isFinite(pv))throw Error('Discounted value is outside the supported range.');
 return {assumption:'Annual dividends; constant price growth to the expected exit price for reinvestment; no taxes or fees.',rows,pv,exit:expectedPrice,reinvestCAGR:(rows.at(-1).wealth/price)**(1/years)-1,irr:irr(price,rows.map(r=>r.dividend),expectedPrice)};
}
