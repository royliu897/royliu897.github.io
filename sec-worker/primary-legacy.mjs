import {Parser} from 'htmlparser2';
import {resources as readResources} from './primary-inline.mjs';

const local=s=>String(s).split(':').at(-1).toLowerCase(),plain=s=>String(s).replace(/\s+/g,' ').trim(),clean=s=>plain(s).toLowerCase().replace(/[^a-z]/g,'');
function parse(source,handler){const stack=[];new Parser({onopentag(name,a){const node={name,tag:local(name),a,text:''};stack.push(node);handler.open?.(node,stack);},ontext(s){if(stack.length)stack.at(-1).text=(stack.at(-1).text+s).slice(0,10000);},onclosetag(){const node=stack.pop();if(!node)return;handler.close?.(node,stack);if(stack.length)stack.at(-1).text=(stack.at(-1).text+node.text).slice(0,10000);}},{xmlMode:true,decodeEntities:true,lowerCaseTags:false,lowerCaseAttributeNames:true}).end(source);}
const qnameFromHref=href=>{const fragment=String(href||'').split('#')[1],at=fragment?.indexOf('_');return at>0?fragment.slice(0,at)+':'+fragment.slice(at+1):null;};
function key(qname){const [prefix,...parts]=String(qname||'').split(':');return (prefix==='us-gaap'?'us-gaap':prefix)+':'+parts.join(':');}
function parseLabels(source){
 const labels=new Map();let link=null;
 parse(source,{open(n){if(n.tag==='labellink')link={loc:new Map(),text:new Map(),arcs:[]};if(!link)return;
  if(n.tag==='loc')link.loc.set(n.a['xlink:label'],qnameFromHref(n.a['xlink:href']));if(n.tag==='labelarc')link.arcs.push([n.a['xlink:from'],n.a['xlink:to']]);
 },close(n){if(!link)return;if(n.tag==='label'){const id=n.a['xlink:label'];if(!link.text.has(id))link.text.set(id,[]);link.text.get(id).push({role:n.a['xlink:role'],text:plain(n.text),lang:n.a['xml:lang']});}
  if(n.tag==='labellink'){
   for(const[from,to]of link.arcs)for(const label of link.text.get(to)||[]){const q=link.loc.get(from);if(!q||label.lang&&!/^en(?:-|$)/i.test(label.lang))continue;const id=key(q)+'|'+label.role,old=labels.get(id);if(old!==undefined&&old!==label.text)labels.set(id,null);else labels.set(id,label.text);}
   link=null;
  }
 }});return labels;
}
function roleDefinitions(schema){const roles=new Map();let role=null;parse(schema||'',{open(n){if(n.tag==='roletype')role=n.a.roleuri;},close(n){if(n.tag==='definition'&&role)roles.set(role,plain(n.text));if(n.tag==='roletype')role=null;}});return roles;}
function presentation(source,definitions){
 const roles=[];let role=null;
 parse(source,{open(n){if(n.tag==='presentationlink')role={uri:n.a['xlink:role'],loc:new Map(),arcs:[]};if(!role)return;if(n.tag==='loc')role.loc.set(n.a['xlink:label'],qnameFromHref(n.a['xlink:href']));if(n.tag==='presentationarc')role.arcs.push(n.a);},close(n){if(n.tag!=='presentationlink'||!role)return;
  const title=definitions.get(role.uri)||String(role.uri||'').split('/').at(-1),normalized=clean(title);let kind;
  if(!/schedulei|condensedfinancialinformation|parentcompanyonly|parenthetical|detail|disclosure/.test(normalized)){
   if(/consolidatedbalancesheets?|consolidatedstatementsoffinancialposition/.test(normalized))kind='balance_sheet';
   else if(/consolidatedstatementsofcashflows?/.test(normalized))kind='cash_flow';
   else if(/consolidatedstatementsof(?:income|earnings|operations)|consolidatedresultsofoperations/.test(normalized))kind='income_statement';
  }
  if(kind){const nodes=new Map(),parents=new Map();for(const arc of role.arcs){const parent=role.loc.get(arc['xlink:from']),child=role.loc.get(arc['xlink:to']);if(!child||!parent)continue;nodes.set(key(child),{qname:child,labelRole:arc.preferredlabel||'http://www.xbrl.org/2003/role/label'});if(!parents.has(key(child)))parents.set(key(child),[]);parents.get(key(child)).push(key(parent));}
   roles.push({...role,title,kind,nodes,parents});}
  role=null;
 }});return roles;
}
function isCurrentLiability(qname,role,visited=new Set()){
 if(visited.has(qname))return false;visited.add(qname);
 if(/^us-gaap:(?:LiabilitiesCurrent|CurrentLiabilities)Abstract$/.test(qname))return true;
 return (role.parents.get(qname)||[]).some(parent=>isCurrentLiability(parent,role,visited));
}

// Legacy filings retain statement membership from the issuer's XBRL
// presentation roles and captions from its label linkbase, never fuzzy names.
export function extractPrimaryLegacy({instance,pre,lab,schema},metadata){
 const {record,filing}=metadata,{contexts,units}=readResources(instance,record.cik,filing.period),labels=parseLabels(lab),roles=presentation(pre,roleDefinitions(schema)),namespaces={},facts=[];
 parse(instance,{open(n){for(const[k,v]of Object.entries(n.a))if(k.startsWith('xmlns:'))namespaces[k.slice(6)]=v;},close(n){
  const a=n.a,ctx=contexts.get(a.contextref),unit=units.get(a.unitref);if(!ctx||!unit||!n.name.includes(':')||!/^[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/.test(plain(n.text))||['true','1'].includes(a['xsi:nil']))return;
  const value=Number(plain(n.text));if(!Number.isFinite(value)||!(/^[A-Z]{3}(?:\/shares)?$|^shares$/.test(unit)))return;
  const prefix=n.name.split(':')[0],originalName=n.name.slice(prefix.length+1),uri=namespaces[prefix.toLowerCase()],namespace=/^https?:\/\/(?:fasb\.org|xbrl\.us)\//.test(uri||'')?'us-gaap':prefix,qname=namespace+':'+originalName;
  facts.push({qname,namespace,namespace_uri:uri,name:originalName,unit,value,...ctx,context_ref:a.contextref,decimals:a.decimals,scale:0,filed:filing.date,accession:filing.accession,source_url:filing.url,source_kind:'XBRL-instance',fact_id:a.id});
  if(facts.length>40000)throw Error('Legacy filing fact count limit');
 }});
 const selected={},selectedRoles={};
 for(const kind of ['income_statement','balance_sheet','cash_flow']){
  const candidates=roles.filter(role=>role.kind===kind&&facts.some(p=>p.end===filing.period&&role.nodes.has(key(p.qname))));
  if(candidates.length===1){selected[kind]=roles.indexOf(candidates[0]);selectedRoles[kind]=candidates[0];}
 }
 const retained=[];
 for(const[kind,role]of Object.entries(selectedRoles))for(const p of facts){
  const node=role.nodes.get(key(p.qname));if(!node)continue;
  if(p.start){const days=(Date.parse(p.end)-Date.parse(p.start))/86400000,offset=(Date.parse(filing.period)-Date.parse(p.end))/86400000;if(/^(10-K|20-F|40-F)/.test(filing.form)&&(days<330||days>380))continue;if(filing.form.startsWith('10-Q')&&(days<70||days>330||!(offset===0||offset>=330&&offset<=400)))continue;}
  const label=labels.get(key(p.qname)+'|'+node.labelRole)??labels.get(key(p.qname)+'|http://www.xbrl.org/2003/role/label');
  // Cost tags reused for a narrower operating component require the actual
  // issuer caption; a taxonomy default cannot establish gross profit scope.
  if(!label&&['CostOfRevenue','CostOfGoodsAndServicesSold'].includes(p.name))continue;
  retained.push({...p,label:label||'',statement:kind,table:selected[kind],balance_classification:kind==='balance_sheet'&&isCurrentLiability(key(p.qname),role)?'current_liabilities':null});
 }
 return {schema_version:1,cik:String(Number(record.cik)),ticker:record.ticker,filing,facts:retained,selected_statements:selected,statement_evidence:Object.fromEntries(Object.entries(selectedRoles).map(([kind,role])=>[kind,{table:selected[kind],tables:[selected[kind]],caption:role.title,role:role.uri,method:'Issuer XBRL presentation role and label linkbase; dimensional or ambiguous rows withheld'}])),conflicts:[],exclusions:{},scope:'Legacy instance facts linked to unambiguous consolidated presentation roles.'};
}
