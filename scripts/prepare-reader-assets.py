"""Prepare local-only thumbnails, page text and word positions from authorized PDFs."""
import pathlib,subprocess,xml.etree.ElementTree as ET,json,concurrent.futures,re,shutil
root=pathlib.Path(__file__).resolve().parents[1]/'public/reader-assets'
issues={'202609':112,'202608':104,'202512':108}
def build(item):
 id,count=item;folder=root/id;folder.mkdir(exist_ok=True)
 if len(list(folder.glob('*.jpg')))<count:subprocess.run(['pdftoppm','-scale-to','240','-jpeg','-jpegopt','quality=76',str(root/(id+'.pdf')),str(folder/'page')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 xml=subprocess.check_output(['pdftotext','-bbox',str(root/(id+'.pdf')),'-']).decode()
 doc=ET.fromstring(re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', xml));out=[]
 for n,page in enumerate(doc.findall('.//{http://www.w3.org/1999/xhtml}page'),1):
  w,h=float(page.attrib['width']),float(page.attrib['height']);words=[]
  for word in page.findall('{http://www.w3.org/1999/xhtml}word'):
   a=word.attrib;words.append({'t':word.text or '', 'x':round(float(a['xMin'])/w,5),'y':round(float(a['yMin'])/h,5),'w':round((float(a['xMax'])-float(a['xMin']))/w,5),'h':round((float(a['yMax'])-float(a['yMin']))/h,5)})
  src=folder/('page-'+str(n).zfill(len(str(count)))+'.jpg');dest=folder/(str(n)+'.jpg')
  if src.exists():src.rename(dest)
  out.append({'page':n,'width':w,'height':h,'text':' '.join(x['t'] for x in words),'words':words})
 assert len(out)==count
 (folder/'index.json').write_text(json.dumps(out,separators=(',',':')))
 print(id, len(out),'pages;',sum(len(p['words']) for p in out),'searchable words',flush=True)
with concurrent.futures.ThreadPoolExecutor(3) as ex:list(ex.map(build,issues.items()))

for name in ('cmaps','standard_fonts','wasm'):
 shutil.copytree(root.parents[1]/'node_modules/pdfjs-dist'/name,root/'pdfjs'/name,dirs_exist_ok=True)

(root/'available.json').write_text(json.dumps(list(issues)))
