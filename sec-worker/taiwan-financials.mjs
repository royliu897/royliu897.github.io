// MOPS inline-XBRL. Numeric identity, units, scales and entity-wide contexts
// are read from the document; labels never determine canonical mappings.
const decode=s=>s.replace(/&#x([\da-f]+);/gi,(_,x)=>String.fromCodePoint(parseInt(x,16))).replace(/&#(\d+);/g,(_,x)=>String.fromCodePoint(+x)).replaceAll('&amp;','&').replaceAll('&nbsp;',' ').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"');
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:.-]+)\s*=\s*["']([^"']*)["']/g)].map(m=>[m[1].toLowerCase(),decode(m[2])]));
const plain=s=>decode(s.replace(/<[^>]*>/g,'')).trim();
const date=(body,tag)=>body.match(new RegExp('<(?:\\w+:)?'+tag+'\\b[^>]*>([^<]+)<','i'))?.[1];
export function normalizeTaiwanStatement(text,profile,year,quarter,asOf){
 const inline=/<ix:nonFraction\b/i.test(text);
 if(text.length>12000000||(!inline&&!/<(?:\w+:)?xbrl\b/i.test(text)))throw Error('MOPS did not return a supported inline-XBRL statement.');
 const ifrsUri=text.match(/\bxmlns:(?:ifrs-full|ifrs)=["']([^"']+)["']/)?.[1];
 if(!/^https?:\/\/xbrl\.(?:ifrs|iasb)\.org\/taxonomy\//.test(ifrsUri||''))throw Error('MOPS IFRS taxonomy namespace could not be verified.');
 const metadata=new Map();
 if(inline)for(const m of text.matchAll(/<ix:nonNumeric\b([^>]*)>([\s\S]*?)<\/ix:nonNumeric>/gi)){const a=attrs(m[1]);if(['tifrs-notes:CompanyID','tifrs-notes:Year','tifrs-notes:Quarter','tifrs-notes:ReportCategory'].includes(a.name)){const key=a.name.split(':')[1],value=plain(m[2]);if(metadata.has(key)&&metadata.get(key)!==value)throw Error('Conflicting MOPS metadata.');metadata.set(key,value);}}
 else for(const m of text.matchAll(/<tifrs-notes:(CompanyID|Year|Quarter|ReportCategory)\b[^>]*>([^<]*)<\/tifrs-notes:\1>/g))metadata.set(m[1],plain(m[2]));
 if(metadata.get('Year')!==String(year)||metadata.get('Quarter')!==String(quarter)||metadata.get('ReportCategory')!=='Consolidated report'||metadata.has('CompanyID')&&metadata.get('CompanyID')!==profile.ticker)throw Error('MOPS issuer, period or consolidated report metadata mismatch.');
 const end=`${year}-${['03-31','06-30','09-30','12-31'][quarter-1]}`,contexts=new Map(),units=new Map(),facts={},seen=new Map(),conflicts=[];let excluded=0;
 for(const m of text.matchAll(/<(?:\w+:)?context\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?context>/gi)){
  const a=attrs(m[1]),body=m[2],id=body.match(/<(?:\w+:)?identifier\b[^>]*>([^<]+)</i)?.[1]?.trim();
  const scheme=body.match(/<(?:\w+:)?identifier\b([^>]*)>/i)?.[1];if(scheme&&attrs(scheme).scheme!=='http://www.twse.com.tw')throw Error('MOPS entity identifier scheme mismatch.');
  if(id!==profile.ticker){if(id)throw Error('MOPS XBRL issuer identity mismatch.');continue;}
  if(/(?:explicitMember|typedMember)\b/i.test(body)){excluded++;continue;}
  const start=date(body,'startDate'),finish=date(body,'endDate')||date(body,'instant');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(finish||'')||finish>end||finish>asOf)continue;
  contexts.set(a.id,{start,end:finish});
 }
 if(![...contexts.values()].some(c=>c.end===end))throw Error('MOPS statement does not contain the requested period.');
 for(const m of text.matchAll(/<(?:\w+:)?unit\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?unit>/gi)){
  const measures=[...m[2].matchAll(/<(?:\w+:)?measure\b[^>]*>([^<]+)</g)].map(x=>x[1].split(':').at(-1));
  if(measures.length===1&&['TWD','shares','pure'].includes(measures[0]))units.set(attrs(m[1]).id,measures[0]);
  if(measures.join('/')==='TWD/shares'&&/unitDenominator/.test(m[2]))units.set(attrs(m[1]).id,'TWD/shares');
 }
 // Primary row English labels are supplied by MOPS itself.
 const labels=new Map();for(const m of text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
  const label=m[1].match(/<span\b[^>]*class=["']en["'][^>]*>([\s\S]*?)<\/span>/i),local=m[1].match(/<span\b[^>]*class=["']zh["'][^>]*>([\s\S]*?)<\/span>/i);
  if(label)for(const n of m[1].matchAll(/<ix:nonFraction\b([^>]*)>/gi)){const name=attrs(n[1]).name;if(!labels.has(name))labels.set(name,{label:plain(label[1]),original_label:local?plain(local[1]):''});}
 }
 const url=`https://mopsov.twse.com.tw/server-java/FileDownLoad?functionName=t164sb01&step=9&co_id=${profile.ticker}&year=${year}&season=${quarter}&report_id=C`,accn=`MOPS-${profile.ticker}-${year}-Q${quarter}`;
 for(const m of (inline?text.matchAll(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi):text.matchAll(/<([A-Za-z_][\w.-]*:[\w.-]+)\b([^>]*)>([^<]*)<\/\1>/g))){
  const a=attrs(inline?m[1]:m[2]);if(!inline)a.name=m[1];const ctx=contexts.get(a.contextref),sourceUnit=units.get(a.unitref);let unit=sourceUnit;if(!ctx||!unit||a['xsi:nil']==='true'||a.continuedat)continue;
  let [namespace,name]=a.name?.split(':')||[];if(!inline&&unit==='TWD'&&['BasicEarningsLossPerShare','DilutedEarningsLossPerShare','BasicEarningsLossPerShareFromContinuingOperations','DilutedEarningsLossPerShareFromContinuingOperations'].includes(name))unit='TWD/shares';if(namespace==='ifrs')namespace='ifrs-full';if(!name||!['ifrs-full','tifrs-SCF','tifrs-bsci-ci'].includes(namespace))continue;
  // Taiwan's namespace must remain distinct from IASB concepts in the raw feed.
  const storage=namespace==='ifrs-full'?name:'TW_'+namespace.replaceAll('-','_')+'_'+name;
  const format=a.format?.split(':').at(-1)||'',raw=plain(inline?m[2]:m[3]),scale=inline?Number(a.scale||0):0;let val;
  if(!Number.isInteger(scale)||Math.abs(scale)>12)continue;
  if(/fixed-zero|zerodash/i.test(format))val=0;
  else{if(format&&!/^num-?dot-?decimal$/i.test(format))continue;const clean=raw.replace(/[(),\s\u00a0]/g,'');if(!/^[+-]?\d+(\.\d+)?$/.test(clean))continue;val=Number(clean);if(raw.startsWith('(')||a.sign==='-')val=-Math.abs(val);}
  val*=10**scale;if(!Number.isFinite(val))continue;
  const fact=facts[storage]??={namespace,source_name:name,source_account_id:a.name,...(labels.get(a.name)||{label:name.replace(/([a-z])([A-Z])/g,'$1 $2')}),...(namespace!=='ifrs-full'&&['BondsPayable','LongtermBankLoans','OperatingRevenue','GrossProfitLossFromOperations','OperatingCosts','AccountsReceivableNet','NetCashFlowsFromUsedInInvestingActivities','CashFlowsFromUsedInFinancingActivities','LongtermLiabilitiesCurrentPortion','OrdinaryShare','PaymentsToAcquireTreasuryShares','ChangesInOperatingAssetsAndLiabilities','ProceedsFromIssuingBonds','RepaymentsOfBonds','ProceedsFromLongTermDebt','RepaymentsOfLongTermDebt','AcquisitionOfPropertyPlantAndEquipment','ProceedsFromDisposalOfPropertyPlantAndEquipment','CashDividendsPaid'].includes(name)?{mapping_approved:true}:{}),description:'Taiwan MOPS consolidated inline-XBRL account '+a.name,units:{}};
  const p={...ctx,val,filed:asOf,known_at:asOf,publication_date_unknown:true,accn,form:quarter===4?'MOPS-ANNUAL':'MOPS-INTERIM',...(quarter===4&&ctx.start&&ctx.end.endsWith('12-31')?{frequency:'year'}:{}),source_url:url,source_concept:a.name,context_ref:a.contextref,source_unit:sourceUnit,...(unit!==sourceUnit?{unit_resolution:'Legacy MOPS EPS currency-only unit interpreted using the registered per-share concept'}:{}),consolidation:'CFS',scale,decimals:a.decimals};
  const key=[storage,unit,ctx.start,ctx.end].join('|'),old=seen.get(key);
  if(old){if(old.val!==val){old.unresolved=true;old.excluded_from_mapping=true;p.unresolved=true;p.excluded_from_mapping=true;old.unresolved_reason=p.unresolved_reason='Conflicting same-context MOPS observations';(fact.units[unit]??=[]).push(p);conflicts.push({concept:a.name,end:ctx.end,values:[old.val,val]});}continue;}
  seen.set(key,p);(fact.units[unit]??=[]).push(p);
 }
 if(!Object.keys(facts).length)throw Error('No supported entity-wide MOPS facts were found.');
 return {facts,status:'available',excluded_contexts:excluded,conflicts,sources:[{accession:accn,url,date:asOf,publication_date_unknown:true,form:quarter===4?'MOPS annual':'MOPS interim',period:end}]};
}
