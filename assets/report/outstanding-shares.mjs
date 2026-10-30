// Actual issued shares net of treasury are different from EPS weighted shares.
export function outstandingShares(data,record={},knowledge=data.asOf){
 if(data.current_shares?.status==='available')return data.current_shares;
 const names=['EntityCommonStockSharesOutstanding','CommonStockSharesOutstanding','NumberOfSharesOutstanding'],points=[];
 for(const name of names){const fact=data.facts?.[name];if(name==='EntityCommonStockSharesOutstanding'?fact?.namespace!=='dei':fact?.namespace&&!['us-gaap','ifrs-full'].includes(fact.namespace))continue;for(const p of fact?.units?.shares||[])if(!p.start&&!p.unresolved&&!p.excluded_from_mapping&&Number.isFinite(p.val)&&p.val>0&&p.end<=knowledge&&p.filed<=knowledge)points.push({...p,concept:name,namespace:fact.namespace});}
 points.sort((a,b)=>b.end.localeCompare(a.end)||b.filed.localeCompare(a.filed));let first=points[0];
 if(!first)return data.current_shares||{status:'unavailable'};
 let peers=points.filter(p=>p.end===first.end&&p.filed===first.filed);
 // The DEI cover count is the explicitly reported entity common count.
 // A GAAP statement count can be rounded; no invented rounding tolerance.
 // Contradictory DEI observations still withhold the count.
 const cover=peers.filter(p=>p.concept==='EntityCommonStockSharesOutstanding'&&p.namespace==='dei');
 if(cover.length){peers=cover;first=cover[0];}
 const age=(Date.parse(knowledge)-Date.parse(first.end))/86400000;
 if(new Set(peers.map(p=>p.val)).size!==1||age>550)return {status:'unavailable'};
 return {status:'available',common_outstanding:first.val,asOf:first.end,filed:first.filed,multiple_classes:data.security_model?!eligibleCommonSecurity(data,record):!!data.share_class||(record.tickers||[]).length>1,source:'Reported common shares outstanding',source_cik:first.source_cik||String(Number(data.cik)),source_url:first.source_url||('https://www.sec.gov/Archives/edgar/data/'+Number(data.cik)+'/'+first.accn?.replaceAll('-','')+'/'),concept:first.concept};
}

export function selectedSecurityKind(data,record={}){
 const ticker=String(record.ticker||'').replaceAll('.','-'),list=(data.security_model?.listings||[]).filter(s=>s.ticker===ticker),kinds=[...new Set(list.map(s=>s.kind))];
 return ticker===data.security_model?.selected_ticker?data.security_model.selected_kind:kinds.length===1?kinds[0]:null;
}

export function eligibleCommonSecurity(data,record={}){
 const model=data.security_model;if(!model||model.status!=='available'||selectedSecurityKind(data,record)!=='common')return false;
 if(!Array.isArray(model.class_conflicts)||model.class_conflicts.length||!Array.isArray(model.unknown_common_members)||model.unknown_common_members.length||!Array.isArray(model.unknown_tickers)||model.unknown_tickers.length)return false;
 return Math.max(model.common_listed_classes||0,model.common_context_classes?.length||0)===1;
}
