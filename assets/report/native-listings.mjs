// Explicit security-to-issuer links, separate from financial concept mappings.
// SK hynix's SEC prospectus identifies its KOSPI ordinary listing as 000660.
const aliases={
 'NYSE:TSM':{exchange:'TWSE',ticker:'2330',name:'Taiwan Semiconductor Manufacturing'},
 'OTC:HXSCL':{exchange:'KRX',ticker:'000660',name:'SK hynix'},
 'Nasdaq:SKHY':{exchange:'KRX',ticker:'000660',name:'SK hynix'}
};
export function nativeRedirect(symbol){const target=aliases[symbol];return target?{...target,from:symbol,symbol:target.exchange+':'+target.ticker,message:`${symbol.replace(':',': ')} → ${target.exchange}: ${target.ticker}. Showing native-currency financials and prices; OTC/ADS conversion is not applied.`}:null;}
export function isKoreanListing(symbol){return /^KRX:\d{6}$/.test(symbol);}

export function isTaiwanListing(symbol){return /^TWSE:\d{4,6}$/.test(symbol);}
