import importlib.util
from pathlib import Path
from bs4 import BeautifulSoup
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('cache',root/'scripts/cache-filing.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
dirty=BeautifulSoup('<div onclick="alert(1)" style="color:red;background:url(https://evil.test);position:fixed"><script>alert(1)</script><iframe src="https://evil.test"></iframe><a href="javascript:alert(1)">bad</a><img src="https://evil.test/x"><span style="width:expression(alert(1))">text</span></div>','html.parser')
clean=m.sanitize(dirty,{})
assert not clean.find(['script','iframe','img'])
assert not clean.div.has_attr('onclick')
assert clean.div['style']=='color:red'
assert not clean.a.has_attr('href')
for file in (root/'assets/research/filing-cache').rglob('*.html'):
 soup=BeautifulSoup(file.read_text(),'html.parser')
 assert not soup.find(['script','iframe','object','embed','form','base'])
 for tag in soup.find_all(True):
  assert not any(k.lower().startswith('on') for k in tag.attrs)
  if tag.name=='img':assert not tag['src'].startswith(('http','data:','//'))
 assert "default-src 'none'" in soup.find('meta',attrs={'http-equiv':'Content-Security-Policy'})['content']
print('Cached documents: active-content removal, local images and CSP checks passed.')
