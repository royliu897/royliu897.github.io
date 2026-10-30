const blocks=new Set(['p','div','h1','h2','h3','h4','h5','h6','td']);
const entities={amp:'&',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”',hellip:'…'};
const whitespace=text=>text.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|quot|apos|nbsp|ndash|mdash|lsquo|rsquo|ldquo|rdquo|hellip);/gi,(all,key)=>{if(key[0]!=='#')return entities[key.toLowerCase()]||all;const n=key[1]?.toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):all;}).replace(/\s+/gu,' ').trim();
const item=text=>/^item\s*\d+[a-z]?\s*[.\-–—:]?/i.test(text);
const business=text=>/^item\s*1\s*[.\-–—:]?\s*business\s*\.?$/i.test(text)||/^(description of (the )?business|business overview|business description)\s*\.?$/i.test(text);

function selector(){let previous='',remaining=0,section='';return entry=>{const text=whitespace(entry.text);if(!text)return null;
 if(business(text)||/^item\s*1\s*\.?$/i.test(previous)&&/^business\s*\.?$/i.test(text)){section=business(text)?text:'Item 1. Business';previous=text;remaining=24;return null;}
 previous=text;if(!remaining)return null;if(item(text)){remaining=0;return null;}remaining--;
 if(entry.inTable||text.length<120||text.length>2500||/table of contents|forward.looking statements|annual report on form|incorporated by reference/i.test(text)||! /\b(company|corporation|business|we|our|designs|manufactures|provides|operates)\b/i.test(text)||!/[.!?]$/.test(text))return null;
 return {text,section,method:'verbatim opening paragraph; whitespace normalized'};
};}
export function selectBusinessParagraph(entries){const accept=selector();for(const entry of [...entries].sort((a,b)=>a.order-b.order)){const result=accept(entry);if(result)return result;}return null;}

export async function extractBusinessDescription(response){
 const stack=[],accept=selector();let order=0,inTable=0,skipped=0,found=null;
 const rewritten=new HTMLRewriter().on('p,div,h1,h2,h3,h4,h5,h6,td,table,script,style,head,ix\\:header',{element(element){
  if(found)return;
  const tag=element.tagName.toLowerCase(),skip=['script','style','head','ix:header'].includes(tag)||element.hasAttribute('hidden')||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(element.getAttribute('style')||'');
  if(skip){skipped++;element.onEndTag(()=>skipped--);return;}
  if(skipped)return;
  if(tag==='table'){inTable++;element.onEndTag(()=>inTable--);}
  if(!blocks.has(tag))return;
  if(stack.length)stack.at(-1).hasBlockChild=true;
  const entry={text:'',order:order++,inTable:inTable>0,hasBlockChild:false};stack.push(entry);
  element.onEndTag(()=>{const index=stack.indexOf(entry);if(index>=0)stack.splice(index,1);if(!found&&!entry.hasBlockChild&&entry.text.length<=5000)found=accept(entry);});
 }}).onDocument({text(chunk){if(!found&&!skipped&&stack.length&&stack.at(-1).text.length<=5000)stack.at(-1).text+=chunk.text;}}).transform(response);
 // Drain the transformed stream; no filing HTML is executed or inserted in UI.
 const reader=rewritten.body.getReader();let bytes=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(found||bytes>4000000){await reader.cancel();break;}}}finally{reader.releaseLock();}
 return found;
}
