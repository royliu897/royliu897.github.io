const fxCache=new Map(),pending=new Map();
export async function getUsdFx(currency){
 const hit=fxCache.get(currency);if(hit&&Date.now()-hit.time<300000)return hit.value;if(pending.has(currency))return pending.get(currency);
 const task=(async()=>{const response=await fetch('https://research-api.royrliu.com/fx/'+currency,{signal:AbortSignal.timeout(20000)}),value=await response.json();if(!response.ok)throw Error(value.error||'FX is unavailable.');if(value.base!=='USD'||value.quote!==currency||!Number.isFinite(value.usd_per_unit)||value.usd_per_unit<=0)throw Error('FX identity could not be verified.');fxCache.set(currency,{time:Date.now(),value});return value;})();pending.set(currency,task);try{return await task;}finally{pending.delete(currency);}
}
export function translatePayloadToUsd(payload,fx){
 const native=payload?.profile?.currency;if(!payload||native==='USD')return payload;
 if(fx?.base!=='USD'||fx.quote!==native||!Number.isFinite(fx.usd_per_unit)||fx.usd_per_unit<=0)throw Error('FX currency does not match this report.');
 const factor=fx.usd_per_unit,multiply=values=>Object.fromEntries(Object.entries(values||{}).map(([k,v])=>[k,Number.isFinite(v)?v*factor:v]));
 const f=payload.financials,financials={...f};
 for(const table of ['income_statement','balance_sheet','cash_flow'])financials[table]=f[table].map(row=>row.is_shares||row.key.startsWith('shares_')?row:{...row,values:multiply(row.values),...(row.ttm_values?{ttm_values:multiply(row.ttm_values)}:{}),provenance:Object.fromEntries(Object.entries(row.provenance||{}).map(([period,p])=>[period,{...p,reported_currency:native,display_currency:'USD',display_fx:factor}]))});
 if(f.mapping_audit)financials.mapping_audit={...f.mapping_audit,display_translation:{currency:'USD',reporting_currency:native,fx},rows:f.mapping_audit.rows.map(row=>{
  if(row.unit!==native&&row.unit!==native+'/shares')return row;
  return {...row,reported_unit:row.unit,unit:row.unit.replace(native,'USD'),observations:Object.fromEntries(Object.entries(row.observations).map(([period,p])=>[period,{...p,reported_value:p.reported_value??p.value,reported_unit:row.unit,value:p.value*factor}]))};
 })};
 return {...payload,financials,profile:{...payload.profile,currency:'USD',reporting_currency:native,display_fx:fx},price:payload.price?{...payload.price,reported_price:payload.price.price,reported_currency:native,price:payload.price.price*factor,currency:'USD'}:null,historical_prices:multiply(payload.historical_prices),dividends:(payload.dividends||[]).map(p=>({...p,amount:p.amount*factor,reported_currency:native}))};
}
export function createCurrencyDisplay(React){
 const h=React.createElement;
 return function useCurrencyDisplay(annual,selected,symbol){
  const currency=annual?.profile?.currency||selected?.profile?.currency,[enabledFor,setEnabledFor]=React.useState(null),[fx,setFx]=React.useState(null),[loading,setLoading]=React.useState(false),[error,setError]=React.useState(''),generation=React.useRef(0);
  React.useEffect(()=>{generation.current++;setEnabledFor(null);setFx(null);setLoading(false);setError('');},[symbol]);
  async function toggle(){const token=++generation.current;if(enabledFor===symbol){setEnabledFor(null);setError('');return;}setLoading(true);setError('');try{const rate=await getUsdFx(currency);if(token===generation.current){setFx(rate);setEnabledFor(symbol);}}catch(e){if(token===generation.current)setError(e.message);}finally{if(token===generation.current)setLoading(false);}}
  const active=enabledFor===symbol&&fx?.quote===currency;
  const a=React.useMemo(()=>active?translatePayloadToUsd(annual,fx):annual,[annual,active,fx]),s=React.useMemo(()=>active?translatePayloadToUsd(selected,fx):selected,[selected,active,fx]);
  const control=currency&&currency!=='USD'?h('div',{className:'report-currency-control'},h('label',null,h('input',{type:'checkbox',checked:!!active,disabled:loading,onChange:toggle}),' Display USD'),loading&&h('span',{role:'status'},'Loading FX…'),fx&&h('span',null,`1 USD = ${new Intl.NumberFormat('en-US',{maximumFractionDigits:6}).format(fx.per_usd)} ${fx.quote} · ${fx.asOf.replace('T',' ').replace('.000Z',' UTC')} · ${fx.kind==='daily_reference'?'daily reference':'latest FX quote'}. `,h('a',{href:fx.source_url,target:'_blank',rel:'noopener noreferrer'},fx.source),active&&' · All periods translated at this rate; not historical FX.'),error&&h('span',{role:'status'},error+' Native values retained.')):null;
  return [a,s,control];
 };
}
