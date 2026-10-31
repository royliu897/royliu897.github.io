import {Parser} from 'htmlparser2';

// Streaming inline-XBRL extraction. Only bounded text prefixes and numeric
// observations are retained; the filing never becomes a browser DOM.
const local=name=>String(name).split(':').at(-1).toLowerCase();
const plain=text=>String(text).replace(/\s+/g,' ').trim();
const clean=text=>plain(text).toLowerCase().replace(/[^a-z]/g,'');
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&Number.isFinite(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const standard=uri=>/^https?:\/\/(?:fasb\.org|xbrl\.us)\//.test(uri||'')?'us-gaap':/^https?:\/\/xbrl\.(?:ifrs|iasb)\.org\/taxonomy\//.test(uri||'')?'ifrs-full':/^https?:\/\/xbrl\.sec\.gov\/dei\//.test(uri||'')?'dei':null;
const patterns={income_statement:/consolidated (?:statements? of (?:income|earnings|operations)|results of operations)/i,balance_sheet:/consolidated (?:balance sheets?|(?:statements? of )?financial position)/i,cash_flow:/consolidated statements? of cash flows?/i};
const captionNames={income_statement:new Set(['incomestatements','statementsofincome','statementsofoperations','statementsofearnings']),balance_sheet:new Set(['balancesheets','balancesheet','statementsoffinancialposition']),cash_flow:new Set(['cashflowsstatements','statementsofcashflows','statementofcashflows'])};
export function resources(source,cik,period){
 const contexts=new Map(),units=new Map(),definitions=new Map(),unitDefinitions=new Map(),frames=[];let resource=null;
 const parser=new Parser({
  onopentag(name,attrs){
   const tag=local(name);
   if(['context','unit'].includes(tag)){if(resource)throw Error('Nested XBRL resources');resource={tag,id:attrs.id,dimensions:[],measures:[],typed:false,divide:false};}
   if(!resource)return;
   if(frames.length>100)throw Error('XBRL resource nesting limit');
   frames.push({tag,attrs,text:''});if(tag==='typedmember')resource.typed=true;if(tag==='unitdenominator')resource.divide=true;
  },
  ontext(text){if(frames.length){const f=frames.at(-1);f.text=(f.text+text).slice(0,4096);}},
  onclosetag(name){
   if(!resource||!frames.length)return;
   const f=frames.pop(),text=plain(f.text),tag=local(name);if(f.tag!==tag)throw Error('Malformed XBRL resource');
   if(tag==='identifier'){resource.identifier=text;resource.scheme=f.attrs.scheme;}
   if(['startdate','enddate','instant'].includes(tag))resource[tag]=text;
   if(tag==='explicitmember')resource.dimensions.push({axis:f.attrs.dimension,member:text});
   if(tag==='measure')resource.measures.push(text.split(':').at(-1));
   if(frames.length){frames.at(-1).text=(frames.at(-1).text+' '+text).slice(0,4096);return;}
   const r=resource;resource=null;if(!r.id)return;
   if(r.tag==='context'){
    const signature=JSON.stringify([r.identifier,r.scheme,r.startdate,r.enddate,r.instant,[...r.dimensions].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),r.typed]);
    if(definitions.has(r.id)&&definitions.get(r.id)!==signature)throw Error('Conflicting duplicate XBRL context identifier');definitions.set(r.id,signature);
    const end=r.enddate||r.instant;
    if(/^\d+$/.test(r.identifier||'')&&String(Number(r.identifier))===String(Number(cik))&&['http://www.sec.gov/CIK','https://www.sec.gov/CIK'].includes(r.scheme)&&validDate(end)&&(!r.startdate||validDate(r.startdate)&&r.startdate<=end))contexts.set(r.id,{start:r.startdate||null,end,dimensions:r.dimensions,typed:r.typed});
   }else{
    const signature=JSON.stringify([r.measures,r.divide]);if(unitDefinitions.has(r.id)&&unitDefinitions.get(r.id)!==signature)throw Error('Conflicting duplicate XBRL unit identifier');unitDefinitions.set(r.id,signature);
    if(r.measures.length===1)units.set(r.id,r.measures[0]);else if(r.measures.length===2&&r.divide)units.set(r.id,r.measures.join('/'));
   }
   if(contexts.size>30000||definitions.size>60000||units.size>1000)throw Error('XBRL resource count limit');
  }
 },{xmlMode:true,decodeEntities:true,lowerCaseTags:true,lowerCaseAttributeNames:true,recognizeSelfClosing:true});
 parser.end(source);
 if(!contexts.size||![...contexts.values()].some(c=>c.end===period))throw Error('Requested issuer/period not found in filing contexts');
 return {contexts,units};
}
function numeric(raw,a){
 const fmt=(a.format||'').split(':').at(-1).toLowerCase();let value;
 if(/zerodash|fixed-zero/.test(fmt))value=0;
 else{
  if(fmt&&!/^num-?dot-?decimal$|^num-?comma-?decimal$/.test(fmt))return;
  const text=plain(raw),v=text.replace(/[()\s\u00a0]/g,'');if(!/^[+-]?[0-9.,]+$/.test(v))return;
  value=Number(fmt.includes('comma')?v.replaceAll('.','').replace(',','.'):v.replaceAll(',',''));
  if(text.startsWith('(')||a.sign==='-')value=-Math.abs(value);
 }
 const scale=a.scale===undefined?0:Number(a.scale);if(!Number.isInteger(scale)||Math.abs(scale)>12)return;
 value*=10**scale;if(Number.isFinite(value))return {value,scale};
}
export function extractPrimaryInline(source,metadata){
 if(typeof source!=='string'||source.length>16000000)throw Error('Filing source exceeds extraction limit');
 const {record,filing}=metadata,cik=String(Number(record.cik)),period=filing.period;
 if(!validDate(period)||!validDate(filing.date)||period>filing.date)throw Error('Invalid filing dates');
 const {contexts,units}=resources(source,cik,period),stack=[],tables=[],facts=[],conflicts=[],seen=new Map();
 function append(f,text){if(!text)return;f.length+=text.length;f.text=(f.text+text).slice(0,1501);}
 function nearest(tag){return stack.findLast(f=>f.tag===tag);}
 const parser=new Parser({
  onopentag(name,a){
   if(stack.length>300)throw Error('Filing nesting limit');
   const parent=stack.at(-1),tag=local(name),f={name,tag,a,text:'',length:0,children:[],previous:parent?.children.slice()||[],ns:parent?.ns||{},hasTable:tag==='table',hasFact:false};
   const declared=Object.entries(a).filter(([key])=>key.startsWith('xmlns:'));if(declared.length)f.ns={...f.ns,...Object.fromEntries(declared.map(([k,v])=>[k.slice(6),v]))};
   if(tag==='table'){
    if(tables.length>5000)throw Error('Filing table count limit');
    const before=[];for(const candidate of [f,...stack.slice(-3).reverse()])for(const prior of [...candidate.previous].reverse()){if(prior.hasTable)break;if(prior.length<1500)before.push(plain(prior.text));}
    f.table={index:tables.length,facts:[],scope:null,before};tables.push(f.table);
   }
   if(tag==='tr'){f.row={table:nearest('table')?.table,parts:[],facts:[]};}
   if(tag==='nonfraction'){
    const outer=stack.findLast(n=>n.fact);if(outer)outer.fact.nested=true;
    const prefix=name.split(':')[0].toLowerCase(),uri=f.ns[prefix];
    f.fact={table:nearest('table')?.table,row:nearest('tr')?.row,label:nearest('tr')?.row.parts.join(' ')||'',numericText:'',nested:false,inline:uri==='http://www.xbrl.org/2013/inlineXBRL'||uri==='http://www.xbrl.org/2008/inlineXBRL'};f.hasFact=true;
   }
   stack.push(f);
  },
  ontext(text){
   const f=stack.at(-1);if(!f)return;append(f,text);
   const fact=stack.findLast(n=>n.fact);if(fact&&!stack.some(n=>n.tag==='exclude'))fact.fact.numericText=(fact.fact.numericText+text).slice(0,4096);
  },
  onclosetag(name){
   const f=stack.pop();if(!f)return;if(f.name!==name)throw Error('Malformed filing markup');
   if(f.fact){
    const a=f.a,ctx=contexts.get(a.contextref),unit=units.get(a.unitref),qname=a.name||'',at=qname.indexOf(':'),prefix=qname.slice(0,at),uri=f.ns[prefix.toLowerCase()],n=numeric(f.fact.numericText,a);
    if(f.fact.inline&&!f.fact.nested&&ctx&&at>0&&/^[A-Z]{3}(?:\/shares)?$|^shares$|^pure$/.test(unit||'')&&!['true','1'].includes(a['xsi:nil'])&&!a.continuedat&&n){
     const p={qname,namespace:standard(uri)||prefix,namespace_uri:uri,name:qname.slice(at+1),unit,value:n.value,...ctx,context_ref:a.contextref,scale:n.scale,decimals:a.decimals,label:plain(f.fact.label),table:f.fact.table?.index??null,fact_id:a.id,filed:filing.date,accession:filing.accession,source_url:filing.url,source_kind:'inline-XBRL'};
     const key=JSON.stringify([uri,p.name,unit,ctx.start,ctx.end,ctx.dimensions,ctx.typed]),old=seen.get(key);if(old&&old.value!==p.value)conflicts.push({qname,context_ref:p.context_ref,values:[old.value,p.value]});else seen.set(key,p);
     facts.push(p);f.fact.table?.facts.push(p);f.fact.row?.facts.push(p);if(facts.length>40000)throw Error('Filing fact count limit');
    }
   }
   if(f.tag==='tr'&&f.row?.table){
    const t=f.row.table,label=clean(f.row.parts[0]||'');
    if(label==='currentliabilities')t.scope='current_liabilities';
    else if(label.startsWith('totalliabilities')||!f.hasFact&&/^(noncurrentliabilities|longtermliabilities|longtermdebt|stockholder|shareholder)/.test(label))t.scope=null;
    for(const p of f.row.facts)p.balance_classification=t.scope;
    if(label.startsWith('totalcurrentliabilities'))t.scope=null;
   }
   if(f.tag==='table'){f.table.captionChunks=[plain(f.text).slice(0,320),...f.table.before];f.table.caption=f.table.captionChunks.join(' ');delete f.table.before;}
   const parent=stack.at(-1);if(parent){
    if(['td','th'].includes(f.tag)){const row=nearest('tr')?.row;if(row&&/[A-Za-z]/.test(f.text)&&row.parts.length<100)row.parts.push(plain(f.text));}
    if(f.tag!=='exclude')append(parent,f.text);parent.hasTable||=f.hasTable;parent.hasFact||=f.hasFact;
    parent.children.push({tag:f.tag,text:f.text,length:f.length,hasTable:f.hasTable});if(parent.children.length>4)parent.children.shift();
   }
  }
 },{decodeEntities:true,lowerCaseTags:true,lowerCaseAttributeNames:true,recognizeSelfClosing:true});
 parser.end(source);
 for(const t of tables){
  const current=t.facts.filter(p=>p.end===period&&(!p.start||(Date.parse(p.end)-Date.parse(p.start))/86400000>=70&&(Date.parse(p.end)-Date.parse(p.start))/86400000<=380));
  const tags=new Set(current.filter(p=>standard(p.namespace_uri)).map(p=>p.name));t.tags=tags;t.score=current.filter(p=>!p.dimensions.length&&!p.typed).length;
  if(['NetCashProvidedByUsedInOperatingActivities','CashFlowsFromUsedInOperatingActivities'].some(k=>tags.has(k))&&['NetCashProvidedByUsedInFinancingActivities','NetCashProvidedByUsedInInvestingActivities','CashFlowsFromUsedInFinancingActivities','CashFlowsFromUsedInInvestingActivities'].some(k=>tags.has(k)))t.kind='cash_flow';
  else if(tags.has('Assets')&&['LiabilitiesAndStockholdersEquity','EquityAndLiabilities'].some(k=>tags.has(k)))t.kind='balance_sheet';
  else if(['EarningsPerShareBasic','EarningsPerShareDiluted','BasicEarningsLossPerShare','DilutedEarningsLossPerShare'].some(k=>tags.has(k))&&['NetIncomeLoss','ProfitLoss','NetIncomeLossAvailableToCommonStockholdersBasic'].some(k=>tags.has(k)))t.kind='income_statement';
  t.verified=!!t.kind&&!t.captionChunks.some(c=>/schedulei|condensedfinancialinformation|parentcompanyonly/.test(clean(c)))&&(patterns[t.kind].test(t.caption)||t.captionChunks.some(c=>captionNames[t.kind].has(clean(c))));
 }
 const pairs=[];
 for(let i=0;i<tables.length-1;i++){
  const left=tables[i],right=tables[i+1];if(left.kind||right.kind||!patterns.balance_sheet.test(left.caption)||!patterns.balance_sheet.test(right.caption)||!left.tags.has('Assets')||!right.tags.has('LiabilitiesAndStockholdersEquity')||left.tags.has('LiabilitiesAndStockholdersEquity')||right.tags.has('Assets')||Math.min(left.score,right.score)<3)continue;
  function totals(t,name){const map=new Map();for(const p of t.facts)if(p.name===name&&!p.start&&!p.dimensions.length&&!p.typed&&/^[A-Z]{3}$/.test(p.unit)&&/^https?:\/\/fasb\.org\/us-gaap\/\d{4}(?:-\d{2}-\d{2})?$/.test(p.namespace_uri||'')){const key=p.end+'|'+p.unit;if(map.has(key)&&map.get(key)!==p.value)return null;map.set(key,p.value);}return map;}
  const a=totals(left,'Assets'),b=totals(right,'LiabilitiesAndStockholdersEquity');if(!a?.size||!b||a.size!==b.size||![...a].every(([k,v])=>b.get(k)===v)||![...a.keys()].some(k=>k.startsWith(period+'|')))continue;
  const observations=new Map();let conflicting=false;for(const p of [...left.facts,...right.facts]){const key=JSON.stringify([p.namespace_uri||p.qname,p.name,p.unit,p.start,p.end,p.dimensions,p.typed]);if(observations.has(key)&&observations.get(key)!==p.value)conflicting=true;observations.set(key,p.value);}if(!conflicting)pairs.push([i,i+1]);
 }
 const selected={},selectedTables={};
 for(const kind of Object.keys(patterns)){const candidates=tables.filter(t=>t.kind===kind&&t.verified).map(t=>[t.index]);if(kind==='balance_sheet')candidates.push(...pairs);if(candidates.length===1){selected[kind]=candidates[0][0];selectedTables[kind]=candidates[0];}}
 for(const p of facts)p.statement=Object.entries(selectedTables).find(([,ids])=>ids.includes(p.table))?.[0]||null;
 return {...(metadata.debug?{table_diagnostics:tables.filter(t=>t.kind).map(t=>({index:t.index,kind:t.kind,verified:t.verified,chunks:t.captionChunks}))}:{}),schema_version:1,cik,ticker:record.ticker,filing,facts,selected_statements:selected,statement_evidence:Object.fromEntries(Object.entries(selected).map(([kind,id])=>[kind,{table:id,tables:selectedTables[kind],caption:selectedTables[kind].map(i=>tables[i].caption).join(' ').slice(0,1500),method:'Standard concept signatures and consolidated primary-statement captions; ambiguous tables withheld'}])),conflicts,exclusions:{},scope:'Tagged primary-statement observations; dimensional and ambiguous mappings remain excluded.'};
}
