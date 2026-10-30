const hasRecent=(data,names)=>names.some(name=>Object.values(data.facts?.[name]?.units||{}).some(points=>points.some(p=>Number.isFinite(p.val)&&p.start&&p.end>=String(Number(data.asOf.slice(0,4))-2)+'-01-01')));
export function needsClassSupplement(data){
 const hasMoney=Object.values(data.facts||{}).some(f=>Object.entries(f.units||{}).some(([u,ps])=>/^[A-Z]{3}$/.test(u)&&ps.some(p=>Number.isFinite(p.val))));
 return hasMoney&&!((hasRecent(data,['EarningsPerShareDiluted','DilutedEarningsLossPerShare'])&&hasRecent(data,['WeightedAverageNumberOfDilutedSharesOutstanding','AdjustedWeightedAverageShares']))||(hasRecent(data,['EarningsPerShareBasic','BasicEarningsLossPerShare'])&&hasRecent(data,['WeightedAverageNumberOfSharesOutstandingBasic','WeightedAverageShares'])));
}
export function mergeClassFacts(data,supplement){
 if(String(Number(data.cik))!==String(Number(supplement.cik)))throw Error('Filing supplement company identity mismatch.');
 if(data.share_class&&supplement.share_class&&data.share_class.identity!==supplement.share_class.identity)throw Error('Inconsistent listed share classes across filings.');
 const facts={...data.facts};
 for(const [name,incoming]of Object.entries(supplement.facts||{})){
  const existing=facts[name]||{},units={...existing.units};
  for(const [unit,points]of Object.entries(incoming.units||{})){
   const result=[...(units[unit]||[])],ids=new Set(result.map(p=>[p.start,p.end,p.accn,p.share_class].join(':')));
   for(const point of points){const id=[point.start,point.end,point.accn,point.share_class].join(':');if(!ids.has(id)){result.push({...point});ids.add(id);}}
   units[unit]=result;
  }
  facts[name]={...existing,...incoming,units};
 }
 return {...data,facts,share_class:supplement.share_class||data.share_class};
}
export async function supplementClassFacts(data,record,profile,request){
 if(!needsClassSupplement(data))return data;
 const reports=(profile.filings||[]).filter(f=>/^(10-K|20-F|40-F)$/.test(f.form)).sort((a,b)=>b.date.localeCompare(a.date));
 const first=reports[0]||(profile.filings||[]).find(f=>f.form==='10-Q');if(!first)return data;
 const fetchFiling=async filing=>{const value=await request(`/company/CIK${record.cik}/class-facts?ticker=${encodeURIComponent(record.ticker)}&accession=${filing.accession}`,604800000);if(Number(value.cik)!==Number(record.cik)||value.ticker!==record.ticker)throw Error('Filing supplement identity mismatch.');return value;};
 let initial;try{initial=await fetchFiling(first);}catch{return {...data,filing_supplement:{status:'unavailable',reason:'Class-specific filing data could not be retrieved.'}};}
 if(initial.status!=='available'||!initial.share_class)return {...data,filing_supplement:{status:'unavailable',reason:initial.reason||'No verified class-specific facts.'}};
 let result=mergeClassFacts(data,initial);const sources=[initial.source],failures=[];
 let history=profile,historyUnavailable=false;
 try{const candidate=await request(`/company/CIK${record.cik}/filings?from=${Math.max(1994,Number(data.asOf.slice(0,4))-20)}`,86400000);if(Number(candidate.cik)!==Number(record.cik))throw Error('Historical filing identity mismatch.');history=candidate;}catch{historyUnavailable=true;}
 const candidates=(history.filings||[]).filter(f=>/^(10-K|20-F|40-F)$/.test(f.form)).sort((a,b)=>b.date.localeCompare(a.date)),selected=[first];
 let last=Number((first.period||first.date).slice(0,4));if(!/^(10-K|20-F|40-F)$/.test(first.form)&&candidates.length){selected.push(candidates[0]);last=Number((candidates[0].period||candidates[0].date).slice(0,4));}
 for(const filing of candidates){const year=Number((filing.period||filing.date).slice(0,4));if(year<=last-3&&selected.length<6){selected.push(filing);last=year;}}
 const latestQuarter=(history.filings||[]).find(f=>f.form==='10-Q');if(latestQuarter&&!selected.some(f=>f.accession===latestQuarter.accession))selected.push(latestQuarter);
 const amendments=(history.filings||[]).filter(f=>/^(10-K|10-Q|20-F|40-F)\/A$/.test(f.form)&&selected.some(s=>s.period===f.period&&f.date>s.date));selected.push(...amendments.slice(0,2));
 const pending=selected.filter(f=>f.accession!==first.accession).sort((a,b)=>Number(b.form==='10-Q')-Number(a.form==='10-Q'));
 // Bound cold source requests. Successful immutable filing responses are cached.
 for(let i=0;i<pending.length;i+=2){const batch=pending.slice(i,i+2),out=await Promise.allSettled(batch.map(fetchFiling));
  for(let j=0;j<out.length;j++){const value=out[j];if(value.status==='fulfilled'&&value.value.status==='available'){result=mergeClassFacts(result,value.value);sources.push(value.value.source);}else failures.push(batch[j].accession);}
 }
 return {...result,filing_supplement:{status:failures.length||historyUnavailable?'partial':'available',sources,unavailable_accessions:failures,scope:'Listed-class EPS, weighted shares and allocated income from selected statement filings; not every filing disclosure.'}};
}
