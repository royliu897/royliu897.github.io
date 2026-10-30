export function parseYahooSplits(json,ticker,cik,fetchedAt){
 const result=json.chart?.result?.[0];
 if(json.chart?.error||!result||result.meta?.symbol!==ticker)throw Error('Split feed company identity mismatch.');
 const events=Object.values(result.events?.splits||{}).map(event=>{
  const ratio=Number(event.numerator)/Number(event.denominator),date=new Date(Number(event.date)*1000).toISOString().slice(0,10);
  if(!Number.isFinite(ratio)||ratio<=0||ratio===1||!Number.isFinite(Number(event.date)))throw Error('Invalid split event.');
  const conventional=Math.abs(ratio-Math.round(ratio))<1e-8||Math.abs(1/ratio-Math.round(1/ratio))<1e-8||[2,3,4,5,10,20].some(d=>Math.abs(ratio*d-Math.round(ratio*d))<1e-8);
  return {id:`yahoo:${ticker}:${date}:${ratio}`,date,ratio,type:conventional?(ratio<1?'reverse_split':'split'):'unclassified_action',known_at:fetchedAt.slice(0,10),source:'Yahoo Finance',url:`https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/history/`,numerator:Number(event.numerator),denominator:Number(event.denominator)};
 }).filter(e=>e.date<=fetchedAt.slice(0,10)).sort((a,b)=>a.date.localeCompare(b.date));
 const monthlyPrices={};
 const bars=result.indicators?.quote?.[0]?.close||[],timestamps=result.timestamp||[];
 const formatter=new Intl.DateTimeFormat('en-US',{timeZone:result.meta.exchangeTimezoneName||'UTC',year:'numeric',month:'2-digit'});
 for(let i=0;i<timestamps.length;i++)if(Number.isFinite(bars[i])&&bars[i]>0){
  const date=new Date(timestamps[i]*1000);if(date>new Date(fetchedAt))continue;
  const parts=Object.fromEntries(formatter.formatToParts(date).map(p=>[p.type,p.value]));
  monthlyPrices[`${parts.year}-${parts.month}`]=bars[i];
 }
 return {cik:String(cik),ticker,status:'available',fetchedAt,events,monthly_prices:monthlyPrices,currency:result.meta.currency||null,price_basis:'Yahoo split-adjusted monthly close; not dividend-adjusted total return',source:'Yahoo Finance corporate actions',coverage:'Available Yahoo history; not a guarantee of complete corporate-action coverage'};
}
