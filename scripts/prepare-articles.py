"""Build a small, explicitly selected reading collection from local print pages.
Paragraph starts come from print indentation; every block retains its PDF page.
"""
import pathlib,subprocess,xml.etree.ElementTree as E,re,json
root=pathlib.Path(__file__).resolve().parents[1]
ns={'h':'http://www.w3.org/1999/xhtml'}
articles=[('202609','blue-book','The Blue Book Is Back','Walt Hunter',[13,14,15]),('202609','look-closer-september','Contrejour in the French Style','Susan Tallman',[110]),('202608','look-closer-august','Interior With Women Beside a Linen Cupboard','Susan Tallman',[102])]
for issue,key,title,author,pages in articles:
 sections=[]
 for page in pages:
  xml=subprocess.check_output(['pdftotext','-f',str(page),'-l',str(page),'-bbox-layout',str(root/'public/reader-assets'/f'{issue}.pdf'),'-']).decode()
  doc=E.fromstring(re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]','',xml))
  blocks=[]
  for b in doc.findall('.//h:block',ns):
   lines=[]
   for l in b.findall('h:line',ns):
    text=' '.join(w.text or '' for w in l.findall('h:word',ns))
    lines.append((float(l.attrib['xMin']),float(l.attrib['yMin']),text))
   full=' '.join(l[2] for l in lines)
   if key=='blue-book':
    if page==13 and not full.startswith(('Across','Ac ross')):continue
    if page!=13 and (float(b.attrib['yMin'])<40 or float(b.attrib['yMin'])>715):continue
    if full.startswith('Walt Hunter') or full.startswith('ILLUSTRATION'):continue
   else:
    if len(full)<220 or full.startswith('Susan Tallman'):continue
   blocks.append((float(b.attrib['xMin']),float(b.attrib['yMin']),lines))
  blocks.sort(key=lambda b:(round(b[0]/20),b[1]))
  paragraphs=[]; current=''
  for x,y,lines in blocks:
   for lx,ly,line in lines:
    if line.startswith('Walt Hunter is a contributing') or line.startswith('Susan Tallman, an art historian'):break
    # Indented first lines mark paragraphs in the print composition.
    if current and lx>x+3: paragraphs.append(current);current=''
    current += (' ' if current else '')+line
   # Columns can continue a sentence; keep it until the next indented line.
  if current:paragraphs.append(current)
  cleaned=[]
  keep={'blue','in','AI','pen','take','college','five','test','human','sky','pale','wide','single','sharp','20th','red','red-and'}
  for para in paragraphs:
   def hyphen(m):
    return m[1]+('-' if m[1].lower() in keep or '-' in m[1] else '')+m[2]
   para=re.sub(r'([\w-]+)- ([a-z][\w]*)',hyphen,para)
   para=para.replace('Ac ross','Across').replace('hand written','handwritten').replace('under graduates','undergraduates').replace('an tiquated','antiquated').replace('un certainty','uncertainty').replace('re directed','redirected').replace('un predictable','unpredictable').replace('Americanliterature','American-literature')
   para=para.replace('T h e b l u e b o o k','The blue book').replace('S t u d e n t s , o f c o u r s e ,','Students, of course,')
   para=re.sub(r'\s*—\s*','—',para)
   cleaned.append(para)
  # Poppler's normal text pass preserves the opener's custom kerning;
  # bbox words incorrectly divide received, Abstraction and Neurobiology.
  if key=='blue-book' and page==13:
   plain=subprocess.check_output(['pdftotext','-f','13','-l','13',str(root/'public/reader-assets'/f'{issue}.pdf'),'-']).decode()
   body='Across'+plain.split('Across',1)[1]
   body=re.sub(r'\s+11\s*\f?\s*$','',body)
   cleaned=[re.sub(r'\s+',' ',p.replace('-\n','')).strip() for p in re.split(r'\n(?=The coronavirus)',body)]
  if key=='blue-book':
   cleaned=[piece for para in cleaned for piece in re.split(r' (?=The blue book hasn’t changed|Students, of course, know)',para)]
  sections.append({'page':page,'paragraphs':cleaned})
 for previous,current in zip(sections,sections[1:]):
  if current['paragraphs'] and previous['paragraphs'] and current['paragraphs'][0][0].islower():
   previous['paragraphs'][-1]+=' '+current['paragraphs'].pop(0)
 out={'id':key,'issueId':issue,'title':title,'author':author,'pages':pages,'sections':sections}
 dest=root/'public/reader-assets/articles';dest.mkdir(exist_ok=True)
 (dest/f'{key}.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
 print(key,[(s['page'],len(s['paragraphs']),sum(len(p.split()) for p in s['paragraphs'])) for s in sections])
