"""Prepare the MCD evidence prototype from one SEC filing. Requires beautifulsoup4.
The website loads these cached assets only when a document/evidence is opened.
"""
import argparse, copy, gzip, hashlib, html, json, re, time, urllib.request
from decimal import Decimal
from pathlib import Path
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup, Comment

URL='https://www.sec.gov/Archives/edgar/data/63908/000006390826000035/mcd-20251231.htm'
ACCESSION='0000063908-26-000035'
TARGETS={'us-gaap:Revenues','us-gaap:NetIncomeLoss','us-gaap:EarningsPerShareDiluted'}
ALLOWED=set('div span p br hr table thead tbody tfoot tr td th col colgroup a img b strong i em u s sup sub h1 h2 h3 h4 h5 h6 ul ol li pre blockquote'.split())
DROP={'script','style','iframe','object','embed','form','input','button','textarea','select','link','meta','base','svg','math','ix:header'}
CSS=set('color background-color font font-family font-size font-weight font-style font-variant text-align text-decoration text-indent text-transform vertical-align white-space line-height letter-spacing word-spacing width min-width max-width height min-height max-height margin margin-top margin-bottom margin-left margin-right padding padding-top padding-bottom padding-left padding-right border border-top border-bottom border-left border-right border-color border-width border-style border-collapse border-spacing table-layout display overflow overflow-wrap word-break page-break-before page-break-after break-before break-after float clear'.split())

def download(url):
    time.sleep(.25)
    req=urllib.request.Request(url,headers={'User-Agent':'RoyLiuResearchDesk royrliu@utexas.edu'})
    with urllib.request.urlopen(req,timeout=45) as response:
        if urlparse(response.url).hostname!='www.sec.gov':raise ValueError('Unexpected redirect')
        data=response.read(12_000_001)
    if len(data)>12_000_000:raise ValueError('Asset too large')
    return data

def safe_style(value):
    out=[]
    for part in value.split(';'):
        key,sep,val=part.partition(':');key=key.strip().lower();val=val.strip()
        if sep and key in CSS and not re.search(r'url|expression|@|\\|[<>]',val,re.I):out.append(key+':'+val)
    return ';'.join(out)

def sanitize(fragment,images):
    for comment in fragment.find_all(string=lambda n:isinstance(n,Comment)):comment.extract()
    for tag in list(fragment.find_all(True)):
        if tag.name is None:continue
        if tag.name in DROP or tag.name.startswith(('xbrli:','link:','xbrldi:')):tag.decompose();continue
        if tag.name.startswith('ix:'):tag.name='span'
        if tag.name not in ALLOWED:tag.unwrap();continue
        attrs={}
        for name in ['id','title','colspan','rowspan','scope','align','valign','width','height','alt']:
            if name in tag.attrs:attrs[name]=str(tag[name])[:500]
        if tag.get('style'):
            style=safe_style(tag['style'])
            if style:attrs['style']=style
        if tag.name=='a':
            href=tag.get('href','');absolute=urljoin(URL,href)
            if href.startswith('#'):attrs['href']=href
            elif urlparse(absolute).scheme in ('https','http'):attrs.update(href=absolute,target='_blank',rel='noopener noreferrer')
        if tag.name=='img':
            src=tag.get('src','')
            if src not in images:tag.decompose();continue
            attrs.update(src=images[src],loading='lazy',decoding='async')
        tag.attrs=attrs
    return fragment

def document(body,title):
    # No scripts, forms, remote resources or active content in cached copies.
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src \'self\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>'+html.escape(title)+'</title><style>html{color-scheme:light}body{margin:16px;background:white;color:#111;font:14px Arial,sans-serif}img{max-width:100%;height:auto}table{max-width:100%}a{color:#245a80}span:target{background:#ffdf77!important;outline:2px solid #c68d00;scroll-margin:100px}::selection{background:#b5d8ff}</style></head><body>'+body+'</body></html>'

def extract(soup):
    contexts={}
    for c in soup.find_all('xbrli:context'):
        if c.find(['xbrli:segment','xbrli:scenario','xbrldi:explicitmember','xbrldi:typedmember']):continue
        start=c.find('xbrli:startdate');end=c.find('xbrli:enddate')
        if start and end:contexts[c['id']]={'start':start.text.strip(),'end':end.text.strip()}
    units={}
    for unit in soup.find_all('xbrli:unit'):
        measures=[m.text.strip() for m in unit.find_all('xbrli:measure')]
        if measures==['iso4217:USD']:units[unit['id']]='USD'
        if measures==['iso4217:USD','xbrli:shares']:units[unit['id']]='USD/shares'
    matches=[]
    for tag in soup.find_all('ix:nonfraction'):
        if tag.get('name') not in TARGETS or tag.get('contextref') not in contexts or tag.get('unitref') not in units:continue
        if tag.get('format') not in (None,'ixt:num-dot-decimal'):continue
        if not tag.get('id') or not tag.find_parent('table'):continue
        try:value=Decimal(tag.get_text().replace(',','').strip())*(Decimal(10)**int(tag.get('scale','0')))
        except Exception:continue
        if tag.get('sign')=='-':value=-value
        matches.append({'concept':tag['name'].split(':')[1],**contexts[tag['contextref']],'unit':units[tag['unitref']],'value':float(value),'anchor':tag['id'],'table':tag.find_parent('table')})
    return matches

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--input',type=Path);args=parser.parse_args()
    root=Path(__file__).resolve().parents[1];out=root/'assets/research/filing-cache'/ACCESSION;out.mkdir(parents=True,exist_ok=True)
    raw=args.input.read_bytes() if args.input else download(URL);soup=BeautifulSoup(raw,'html.parser');facts=extract(soup);images={}
    for image in soup.find_all('img'):
        src=image.get('src','')
        if not re.fullmatch(r'[\w-]+\.(?:jpg|png|gif)',src):continue
        path=out/src
        if not path.exists():path.write_bytes(download(urljoin(URL,src)))
        images[src]=src
    tables={};records=[]
    for fact in facts:
        table=fact.pop('table');key=id(table)
        if key not in tables:
            clean=sanitize(BeautifulSoup(str(table),'html.parser'),images)
            content=document(str(clean),'MCD · Source table');digest=hashlib.sha256(content.encode()).hexdigest()[:12];name='table-'+digest+'.html';(out/name).write_text(content);tables[key]=name
        records.append({**fact,'excerpt':tables[key]})
    clean=sanitize(BeautifulSoup(str(soup.body),'html.parser'),images);content=document(str(clean),'MCD · 10-K · 2025');digest=hashlib.sha256(content.encode()).hexdigest()[:12];name='document-'+digest+'.html';(out/name).write_text(content)
    record={'accession':ACCESSION,'url':URL,'label':'MCD · 10-K · 2025','file':name,'sourceSHA256':hashlib.sha256(raw).hexdigest(),'changes':['Active content removed','Inline XBRL tags converted to spans','Images cached locally','Links resolved to original URLs'],'facts':records}
    (out/'index.json').write_text(json.dumps(record,separators=(',',':')))
    manifest={'version':1,'filings':[{'accession':ACCESSION,'url':URL,'label':record['label'],'base':f'assets/research/filing-cache/{ACCESSION}/','index':'index.json'}]}
    (out.parent/'manifest.json').write_text(json.dumps(manifest,separators=(',',':')))
    print(json.dumps({'originalBytes':len(raw),'documentBytes':len(content.encode()),'documentGzipBytes':len(gzip.compress(content.encode())),'facts':len(records),'tables':len(tables),'imageBytes':sum((out/x).stat().st_size for x in images.values())}))
if __name__=='__main__':main()
