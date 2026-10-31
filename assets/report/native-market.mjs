import {validReportDate} from './report-dates.mjs?v=d4f1839989bb';
// TWSE publishes dated closing P/E/P/B independently of our share-count feed.
// Rounded ratios are never reverse-engineered into shares or market cap.
export function selectTaiwanMarket(snapshot,ticker,knowledge){
 const p=snapshot?.rows?.[ticker];if(snapshot?.version!==1||snapshot.currency!=='TWD'||!p||!validReportDate(knowledge)||!validReportDate(snapshot.known_at)||!validReportDate(p.asOf)||p.asOf>snapshot.known_at||snapshot.known_at>knowledge)return null;
 const age=(Date.parse(knowledge)-Date.parse(p.asOf))/86400000;if(!Number.isFinite(age)||age<0||age>7||!Number.isFinite(p.price)||p.price<=0)return null;
 return {provider:'TWSE',currency:'TWD',asOf:p.asOf,known_at:snapshot.known_at,price:p.price,pe:Number.isFinite(p.pe)&&p.pe>0?p.pe:null,pb:Number.isFinite(p.pb)&&p.pb>0?p.pb:null,financial_period:p.financial_period,source_url:snapshot.source_url};
}
let promise,retryAt=0;
export async function loadTaiwanMarket(ticker,knowledge,fetcher=fetch){
 if(Date.now()<retryAt)return null;
 try{promise??=fetcher(String(new URL('./data/taiwan-market.json',import.meta.url)),{signal:AbortSignal.timeout(5000)}).then(async r=>{if(!r.ok)throw Error();return r.json();}).catch(error=>{promise=undefined;retryAt=Date.now()+60000;throw error;});return selectTaiwanMarket(await promise,ticker,knowledge);}catch{return null;}
}
