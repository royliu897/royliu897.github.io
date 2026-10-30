import {dartAccountInfo} from './dart-account-registry.mjs';
const endFor=(year,code)=>`${year}-${({'11011':'12-31','11013':'03-31','11012':'06-30','11014':'09-30'})[code]}`;
const amount=value=>typeof value==='string'&&/^-?\d+(?:\.\d+)?$/.test(value.replaceAll(',','').trim())?Number(value.replaceAll(',','').trim()):null;
const hash=text=>{let value=2166136261;for(const char of text)value=Math.imul(value^char.charCodeAt(0),16777619);return (value>>>0).toString(16);};
export function normalizeDartStatement(response,profile,year,code,asOf){
 if(profile.fiscal_month!=='12')throw Error('Only verified December fiscal year ends are supported by this OpenDART adapter.');
 if(!['11011','11013','11012','11014'].includes(code)||year<2015||year>Number(asOf.slice(0,4)))throw Error('Invalid OpenDART statement period.');
 const facts={},sources=new Map(),contexts=new Map(),conflicts=[];let excluded=0;
 if(response.status==='013')return {facts,sources:[],status:'unavailable',excluded_contexts:0,conflicts:[],conflicting_contexts:0,unresolved_contexts:0,resolved_conflicts:0};
 if(response.status!=='000')throw Error('OpenDART statement data is unavailable.');
 for(const row of response.list||[]){
  if(row.corp_code!==profile.corp_code||row.bsns_year!==String(year)||row.reprt_code!==code)throw Error('OpenDART statement issuer or period mismatch.');
  if(row.fs_div&&row.fs_div!=='CFS')throw Error('Separate accounts cannot be merged into consolidated statements.');
  if(!['BS','IS','CIS','CF'].includes(row.sj_div)||row.account_detail&&row.account_detail!=='-'){excluded++;continue;}
  if(!/^\d{14}$/.test(row.rcept_no||''))throw Error('Invalid OpenDART filing receipt.');
  const filed=row.rcept_no.slice(0,4)+'-'+row.rcept_no.slice(4,6)+'-'+row.rcept_no.slice(6,8);if(filed>asOf)continue;
  if(!/^[A-Z]{3}$/.test(row.currency||''))throw Error('OpenDART statement currency was not verified.');
  const match=(row.account_id||'').match(/^(ifrs-full|ifrs|dart)_([A-Za-z][A-Za-z0-9]*)$/),namespace=match?.[1]==='ifrs'?'ifrs-full':match?.[1]||'dart-custom',name=match?.[2]||row.sj_div+'_'+year+'_'+hash((row.account_nm||'Unlabelled')+'|'+row.ord);
  const account=dartAccountInfo(row.account_id,row.account_nm,row.sj_div),unit=account.unit_kind==='shares'?'shares':account.unit_kind==='per-share'?row.currency+'/shares':row.currency;
  const sourceURL='https://englishdart.fss.or.kr/dsbh001/main.do?rcpNo='+row.rcept_no;
  sources.set(row.rcept_no,{accession:row.rcept_no,url:sourceURL,date:filed,form:code==='11011'?'DART annual':'DART interim',period:endFor(year,code)});
  const storageName=account.storage_name||(namespace==='dart'?'Dart_'+name:name);
  const fact=facts[storageName]??={namespace,source_name:name,label:account.label,label_source:account.label_source,original_label:row.account_nm||name,source_labels:[],source_account_id:row.account_id||name,description:'OpenDART '+row.sj_div+' account: '+(row.account_id||'custom')+'. English label: '+account.label,units:{},...(account.mapping_approved?{mapping_approved:true,mapping_target:account.mapping_target}: {})};
  if(!fact.source_labels.includes(row.account_nm||name))fact.source_labels.push(row.account_nm||name);
  const add=(field,y,kind)=>{
   const value=amount(row[field]);if(value===null)return;
   const end=kind==='prior-annual'?`${y}-12-31`:endFor(y,code),start=row.sj_div==='BS'?undefined:kind==='quarter'?`${y}-${({'11013':'01-01','11012':'04-01','11014':'07-01'})[code]}`:`${y}-01-01`;
   const point={...(start?{start}:{}),end,val:value,filed,accn:row.rcept_no,form:code==='11011'?'DART-ANNUAL':'DART-INTERIM',...(code==='11011'?{frequency:'year'}:{}),source_url:sourceURL,source_concept:row.account_id||name,source_label:row.account_nm||name,source_field:field,statement:row.sj_div,consolidation:'CFS'};
   const id=[namespace,name,unit,start,end,row.rcept_no].join(':');
   if(!contexts.has(id))contexts.set(id,{storageName,fact,unit,name,points:[]});contexts.get(id).points.push(point);
  };
  if(code==='11011'){add('thstrm_amount',year,'annual');add('frmtrm_amount',year-1,'prior-annual');add('bfefrmtrm_amount',year-2,'prior-annual');}
  else if(row.sj_div==='BS'){add('thstrm_amount',year,'instant');add('frmtrm_amount',year-1,'prior-annual');}
  else if(row.sj_div==='CF'){add('thstrm_amount',year,'YTD');add(row.frmtrm_amount!==undefined?'frmtrm_amount':'frmtrm_q_amount',year-1,'YTD');}
  else{add('thstrm_amount',year,'quarter');add('frmtrm_q_amount',year-1,'quarter');if(code!=='11013'){add('thstrm_add_amount',year,'YTD');add('frmtrm_add_amount',year-1,'YTD');}}
 }
 let unresolved=0,resolved=0;
 for(const {storageName,fact,unit,name,points}of contexts.values()){
  const observations=points.map(p=>({statement:p.statement,source_field:p.source_field,source_label:p.source_label,source_concept:p.source_concept,val:p.val}));
  const values=[...new Set(points.map(p=>p.val))];
  if(values.length===1){(fact.units[unit]??=[]).push({...points[0],source_observations:observations});continue;}
  // In interim DART extracts the CF copy of ProfitLoss can repeat a quarter
  // amount while the IS/CIS explicitly supplies its cumulative amount. Keep
  // that explicit cumulative figure; never let an ambiguous CF copy replace it.
  const explicit=points.filter(p=>name==='ProfitLoss'&&['IS','CIS'].includes(p.statement)&&['thstrm_add_amount','frmtrm_add_amount'].includes(p.source_field));
  const explicitValues=[...new Set(explicit.map(p=>p.val))],canResolve=explicitValues.length===1&&points.every(p=>explicit.includes(p)||p.statement==='CF');
  const resolution=canResolve?'Explicit IS/CIS cumulative ProfitLoss preferred to conflicting CF extract':'Conflicting same-context observations; no value selected';
  const issue={concept:fact.source_account_id,storage_name:storageName,unit,start:points[0].start,end:points[0].end,accession:points[0].accn,source_url:points[0].source_url,resolution,status:canResolve?'resolved_with_source_precedence':'unresolved',observations};
  conflicts.push(issue);
  if(canResolve){
   resolved++;const selected=explicit[0];(fact.units[unit]??=[]).push({...selected,source_observations:observations,source_resolution:resolution});
   for(const p of points.filter(p=>p.val!==selected.val))(fact.units[unit]??=[]).push({...p,unresolved:true,excluded_from_mapping:true,unresolved_reason:'CF extract conflicts with explicit cumulative IS/CIS amount',source_observations:observations});
  }else{
   unresolved++;const unique=new Map(points.map(p=>[p.val,p]));for(const p of unique.values())(fact.units[unit]??=[]).push({...p,unresolved:true,excluded_from_mapping:true,unresolved_reason:resolution,source_observations:observations});
  }
 }
 for(const [name,fact]of Object.entries(facts))if(!Object.values(fact.units).some(points=>points.length))delete facts[name];
 return {facts,sources:[...sources.values()],status:Object.keys(facts).length?'available':'unavailable',excluded_contexts:excluded,conflicts,conflicting_contexts:conflicts.length,unresolved_contexts:unresolved,resolved_conflicts:resolved};
}
export function mergeDartStatements(statements){
 const facts={};for(const statement of statements)for(const [name,fact]of Object.entries(statement.facts)){
  const result=facts[name]??={...fact,source_labels:[...(fact.source_labels||[])],units:{}};
  if(result.namespace!==fact.namespace)throw Error('Conflicting OpenDART taxonomy names.');
  for(const [unit,points]of Object.entries(fact.units)){
   const list=result.units[unit]??=[],ids=new Set(list.map(p=>[p.start,p.end,p.accn,p.val,!!p.unresolved].join(':')));
   for(const p of points){const id=[p.start,p.end,p.accn,p.val,!!p.unresolved].join(':');if(!ids.has(id)){list.push(p);ids.add(id);}}
  }
  for(const label of fact.source_labels||[])if(!result.source_labels.includes(label))result.source_labels.push(label);
 }return facts;
}
