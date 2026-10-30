from pathlib import Path
import json,re,urllib.request,time,sys
from lxml import etree
root=Path('/home/royl/projects/sftsaf/coverage-pilot')
def get(url):
 req=urllib.request.Request(url,headers={'User-Agent':'Roy Liu Research Desk royrliu@utexas.edu'})
 return urllib.request.urlopen(req,timeout=25).read(10000000)
def qname(href):
 fragment=href.split('#')[-1];prefix,sep,name=fragment.partition('_');return prefix+':'+name if sep else fragment
for ticker in sys.argv[1:] or ['PG','CAT','JPM','TRV']:
 folder=root/ticker;m=json.loads((folder/'metadata.json').read_text());base=m['filing']['url'].rsplit('/',1)[0]+'/';source=(folder/'filing.htm').read_text();schemas=re.findall(r'<link:schemaRef\b[^>]*xlink:href="([^"/]+\.xsd)"',source,re.I)
 try:
  if not schemas:raise ValueError('No local schemaRef')
  xsd=get(base+schemas[0]);names=re.findall(rb'xlink:href="([^"/]+_cal\.xml)"',xsd)
  if not names:raise ValueError('No calculation linkbase')
  name=names[0].decode();raw=get(base+name);(folder/'calculation.xml').write_bytes(raw);tree=etree.fromstring(raw);groups=[]
  for link in tree:
   if not link.tag.endswith('calculationLink'):continue
   locs={n.get('{http://www.w3.org/1999/xlink}label'):qname(n.get('{http://www.w3.org/1999/xlink}href','')) for n in link if n.tag.endswith('loc')};parents={}
   for n in link:
    if not n.tag.endswith('calculationArc') or n.get('use')=='prohibited':continue
    parent=locs.get(n.get('{http://www.w3.org/1999/xlink}from'));child=locs.get(n.get('{http://www.w3.org/1999/xlink}to'))
    if parent and child:parents.setdefault(parent,[]).append({'concept':child,'weight':float(n.get('weight'))})
   for parent,children in parents.items():groups.append({'role':link.get('{http://www.w3.org/1999/xlink}role'),'parent':parent,'children':children})
  (folder/'calculations.json').write_text(json.dumps(groups));print(ticker,len(groups),flush=True)
 except Exception as e:print(ticker,'ERROR',str(e),flush=True)
 time.sleep(.2)
