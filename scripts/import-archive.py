"""Prepare authorized library downloads for the static reader.

Requires PyMuPDF and Poppler. Original PDFs stay in work/archive-originals.
Catalog destinations are extracted from printed contents and verified against
opening-page text; uncertain entries remain accessible via Printed contents.
"""
import argparse, calendar, collections, concurrent.futures, gzip, hashlib, json, pathlib, re, subprocess, unicodedata, xml.etree.ElementTree as ET
import pymupdf as fitz

ROOT = pathlib.Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'public/reader-assets'
ORIGINALS = ROOT / 'work/archive-originals'
CURATED = {'202609', '202608', '202512'}
CATALOG_ONLY = '--catalog-only' in __import__('sys').argv
NS = '{http://www.w3.org/1999/xhtml}'

def normalize(s):
    return re.sub('[^a-z]', '', unicodedata.normalize('NFKD', s).lower())

def issue_name(id):
    y, m = int(id[:4]), int(id[4:])
    month = 'January/February' if y < 2025 and m == 1 else 'July/August' if y < 2025 and m == 7 else calendar.month_name[m]
    return f'{month} {y}'

def page_index(path):
    xml = subprocess.check_output(['pdftotext', '-bbox', str(path), '-'], stderr=subprocess.DEVNULL).decode()
    doc = ET.fromstring(re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', xml))
    pages = []
    for n, p in enumerate(doc.findall('.//' + NS + 'page'), 1):
        w, h = float(p.attrib['width']), float(p.attrib['height'])
        words = []
        for word in p.findall(NS + 'word'):
            a = word.attrib
            words.append(dict(t=word.text or '', x=round(float(a['xMin'])/w, 5), y=round(float(a['yMin'])/h, 5), w=round((float(a['xMax'])-float(a['xMin']))/w, 5), h=round((float(a['yMax'])-float(a['yMin']))/h, 5)))
        pages.append(dict(page=n, width=w, height=h, text=' '.join(x['t'] for x in words), words=words))
    return pages

def spans_on(page):
    seen = set(); spans = []
    for block in page.get_text('dict', flags=fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES)['blocks']:
        for line in block.get('lines', []):
            for s in line['spans']:
                key = (round(s['bbox'][0], 1), round(s['bbox'][1], 1), s['text'])
                if key not in seen:
                    seen.add(key); spans.append(s)
    return spans

def in_rect(span, rect):
    b = fitz.Rect(span['bbox'])
    return rect.y0-3 <= (b.y0+b.y1)/2 <= rect.y1+3 and b.x0 < rect.x1+3 and b.x1 > rect.x0-3

def accurate_text(spans, indexed):
    # Poppler honors the PDFs' ActualText ligatures; use font spans only to
    # identify title/byline regions, never as the source of displayed letters.
    selected = []
    for word in indexed['words']:
        cx=(word['x']+word['w']/2)*indexed['width'];cy=(word['y']+word['h']/2)*indexed['height']
        if any(fitz.Rect(s['bbox']).contains(fitz.Point(cx,cy)) for s in spans):
            selected.append(word)
    selected.sort(key=lambda w:(round(w['y']*indexed['height']/3),w['x']))
    return re.sub(r'\s+', ' ', ' '.join(w['t'] for w in selected)).strip()

def print_offset(index):
    votes=collections.Counter()
    for p in index:
        candidates=[w for w in p['words'] if w['y']>.91 and re.fullmatch(r'\d{1,3}',w['t'])]
        for w in candidates:
            offset=p['page']-int(w['t'])
            if 0<=offset<=12:votes[offset]+=1
    offset,count=votes.most_common(1)[0] if votes else (2,0)
    return offset if count>=5 else 2

def back_matter(index, offset):
    printed=[p['page'] for p in index if any(w['y']>.91 and w['t']==str(p['page']-offset) for w in p['words'])]
    return min(2,len(index)-max(printed)) if printed else 2

def contents(doc, index):
    entries=[]; toc_pages=[]; rejected=[]; offset=print_offset(index)
    for page in list(doc)[:18]:
        pindex=index[page.number]; text=normalize(pindex['text'])
        links=[l for l in page.get_links() if l['kind']==fitz.LINK_GOTO]
        spans=spans_on(page)
        follows_toc=page.number in toc_pages and sum(s['size']>=17 and s['text'].strip().isdigit() for s in spans)>=4
        if not (any(normalize(s['text'])=='contents' for s in spans) or follows_toc or (len(links)>=4 and ('features' in text or 'dispatches' in text or 'culturecritics' in text))):continue
        toc_pages.append(page.number+1); spans=spans_on(page)
        anchors=[]
        for span in spans:
            if (span['size'] < 17 and not ('Mono' in span['font'] and span['size']>=9.5)) or not re.fullmatch(r'\d+',span['text'].strip()):continue
            number=accurate_text([span],pindex)
            if not re.fullmatch(r'\d{1,3}',number) or not 1<=int(number)<=len(doc)-offset:continue
            if any(abs(span['bbox'][0]-a['bbox'][0])<3 and abs(span['bbox'][1]-a['bbox'][1])<3 for a in anchors):continue
            anchors.append({**span,'number':int(number)})
        for anchor in anchors:
            x,y,x2,y2=anchor['bbox'];printed=anchor['number'];cx=(x+x2)/2
            centered=anchor['size']>40 or 'AtlanticCondensed' in anchor['font']
            lower=[a['bbox'][1] for a in anchors if (abs((a['bbox'][0]+a['bbox'][2])/2-cx)<35 if centered else abs(a['bbox'][0]-x)<20) and a['bbox'][1]>y+5]
            right=[a['bbox'][0] for a in anchors if a['bbox'][0]>x+40]
            rect=fitz.Rect(x-3,y,min(right,default=page.rect.width-18)-8,min(lower,default=page.rect.height-30)-3)
            inside=[s for s in spans if in_rect(s,rect)]
            headings=[s for s in inside if (anchor['size']>40 or (abs((s['bbox'][0]+s['bbox'][2])/2-cx)<70 if centered else abs(s['bbox'][0]-x)<25)) and 'Garamond' in s['font'] and (('Bold' in s['font'] and 'Semibold' not in s['font']) or ('Regular' in s['font'] and s['size']>=(12 if anchor['size']>40 else 14))) and not ('Regular' in s['font'] and s['text'].strip().startswith('By ')) and ('Italic' not in s['font'] or 'BoldItalic' in s['font'])]
            # Italic words can be separate spans within a bold headline.
            baselines=[h['origin'][1] for h in headings]
            headings += [s for s in inside if 'Bold' in s['font'] and 'Semibold' not in s['font'] and any(abs(s['origin'][1]-h['origin'][1])<1 and min(abs(s['bbox'][0]-h['bbox'][2]),abs(s['bbox'][2]-h['bbox'][0]))<12 for h in headings) and s not in headings]
            title=accurate_text(headings,pindex)
            bylines=[s for s in inside if (anchor['size']>40 or (abs((s['bbox'][0]+s['bbox'][2])/2-cx)<70 if centered else abs(s['bbox'][0]-x)<25)) and 'Garamond' in s['font'] and 'Regular' in s['font'] and (s['text'].strip().startswith('By ') or s['text'].strip().startswith('A poem by '))]
            if bylines:
                by_start=min(s['bbox'][1] for s in bylines)
                by_size=bylines[0]['size']
                bylines += [s for s in inside if 'Regular' in s['font'] and abs(s['size']-by_size)<.5 and s['bbox'][1]>=by_start-1 and (abs((s['bbox'][0]+s['bbox'][2])/2-(bylines[0]['bbox'][0]+bylines[0]['bbox'][2])/2)<30 if centered else abs(s['bbox'][0]-bylines[0]['bbox'][0])<15) and s not in bylines and s not in headings]
            author=re.sub(r'^(By |A poem by )','',accurate_text(bylines,pindex))
            opening=normalize(' '.join(p['text'] for p in index[printed+offset-1:printed+offset+3]))
            matching_link=next((l for l in links if l['page']+1 in (printed+offset,printed+offset+1) and in_rect(anchor,l['from'])),None)
            if not title or (not matching_link and normalize(title) not in opening and (not author or normalize(author) not in opening)):
                rejected.append(dict(title=title,printedPage=printed,author=author));continue
            # Section headers above each column are editorial labels, separate
            # from the smaller all-caps story category.
            sections=[s for s in spans if s['text'].strip() in ['Front','Dispatches','Culture & Critics','Back','Features'] and s['bbox'][1]<anchor['bbox'][1]]
            section=min(sections,key=lambda s:abs(s['bbox'][0]-anchor['bbox'][0]))['text'].strip() if sections else 'Features'
            entry=dict(title=title,author=author,printedPage=printed,section=section,sourceContentsPage=page.number+1,pdfLinkPage=matching_link['page']+1 if matching_link else None)
            if not any(e['printedPage']==printed for e in entries):entries.append(entry)
    return sorted(entries,key=lambda e:e['printedPage']),min(toc_pages,default=3),rejected

def compact_pdf(source, dest):
    stamp=ROOT/'work/archive-originals'/f'{source.stem}.optimized'
    if dest.exists() and stamp.exists():return
    doc=fitz.open(source);seen=set()
    for page in doc:
        for image in page.get_images(full=True):
            x,mask,w,h,bpc,cs,*_=image
            if x in seen:continue
            seen.add(x);old=doc.xref_stream_raw(x)
            if mask or bpc!=8 or min(w,h)<100 or not old or len(old)<20000:continue
            try:
                pix=fitz.Pixmap(doc,x)
                if pix.alpha:continue
                if pix.colorspace.n!=3:pix=fitz.Pixmap(fitz.csRGB,pix)
                if max(w,h)>1200:
                    scale=1200/max(w,h);pix=fitz.Pixmap(pix,int(w*scale),int(h*scale),None)
                data=pix.tobytes('jpeg',jpg_quality=60)
                if len(data)<len(old)*.85:page.replace_image(x,stream=data)
            except Exception:continue
    tmp=dest.with_suffix('.tmp.pdf')
    doc.save(tmp,garbage=4,deflate=True,deflate_images=True,deflate_fonts=True,use_objstms=1,compression_effort=100)
    doc.close();tmp.replace(dest);stamp.write_text('1200px / JPEG 60 / vector text preserved')

def build(id):
    source=ORIGINALS/f'{id}.pdf';doc=fitz.open(source);folder=ASSETS/id;folder.mkdir(exist_ok=True)
    index_path=folder/'index.json'
    compressed=folder/'index.json.gz'
    index=json.loads(index_path.read_text()) if index_path.exists() else json.loads(gzip.decompress(compressed.read_bytes())) if compressed.exists() else page_index(source)
    assert len(index)==len(doc),(id,'page count')
    entries,toc,rejected=contents(doc,index)
    overrides=json.loads((ROOT/'app/reader/archive-overrides.json').read_text()).get(id,[])
    if overrides:
        replaced={e['printedPage'] for e in overrides}
        entries=sorted([e for e in entries if e['printedPage'] not in replaced]+overrides,key=lambda e:e['printedPage'])
        rejected=[e for e in rejected if e['printedPage'] not in replaced]
    if id not in CURATED and not CATALOG_ONLY:
        compact_pdf(source,ASSETS/f'{id}.pdf')
        compressed.write_bytes(gzip.compress(json.dumps(index,separators=(',',':')).encode(),compresslevel=9,mtime=0))
        if index_path.exists():index_path.unlink()
        for p in doc:
            path=folder/f'{p.number+1}.jpg'
            if not path.exists():
                p.get_pixmap(matrix=fitz.Matrix(240/max(p.rect.width,p.rect.height),240/max(p.rect.width,p.rect.height)),alpha=False,colorspace=fitz.csRGB).save(path,jpg_quality=76)
    cover=ROOT/'public/covers'/f'{id}.jpg'
    if id<'202109' and not cover.exists():
        p=doc[0];p.get_pixmap(matrix=fitz.Matrix(1000/p.rect.height,1000/p.rect.height),alpha=False,colorspace=fitz.csRGB).save(cover,jpg_quality=88)
    result=dict(id=id,issue=issue_name(id),pageCount=len(doc),indexEncoding='gzip',printOffset=print_offset(index),backMatterPages=min(back_matter(index,print_offset(index)), len(doc)-max((e['printedPage']+print_offset(index) for e in entries),default=1)),contentsPage=toc,coverStoryPage=entries[0]['printedPage']+print_offset(index) if entries else toc,contents=entries)
    report=dict(id=id,pages=len(doc),stories=len(entries),unresolved=rejected,originalBytes=source.stat().st_size,webBytes=(ASSETS/f'{id}.pdf').stat().st_size,sha256=hashlib.sha256(source.read_bytes()).hexdigest())
    print(id,len(doc),'pages,',len(entries),'verified stories,',len(rejected),'unresolved',flush=True)
    return result,report

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--ids',nargs='*');parser.add_argument('--catalog-only',action='store_true');parser.add_argument('--workers',type=int,default=3);args=parser.parse_args()
    ids=args.ids or sorted((p.stem for p in ORIGINALS.glob('*.pdf')),reverse=True)
    if not ids:raise SystemExit('Place the original library PDFs in work/archive-originals before importing.')
    with concurrent.futures.ProcessPoolExecutor(args.workers) as pool:results=list(pool.map(build,ids))
    (ROOT/'work/archive-import-report.json').write_text(json.dumps([r for _,r in results],indent=2))
    if not args.ids:
        (ROOT/'app/reader/archive-catalog.json').write_text(json.dumps([r for r,_ in results if r['id'] not in CURATED],ensure_ascii=False,indent=2)+'\n')
        (ASSETS/'available.json').write_text(json.dumps(ids))
        issues=json.loads((ROOT/'app/issues.json').read_text());existing={i['id'] for i in issues}
        for r,_ in results:
            id=r['id']
            if id in existing:continue
            issues.append(dict(id=id,year=int(id[:4]),month=int(id[4:]),issue=r['issue'],datePublished=f'{id[:4]}-{id[4:]}-01T00:00:00Z',sourceUrl='https://accounts.theatlantic.com/accounts/library/magazine-issues/',imageUrl='',smallImageUrl='',largeImageUrl='',imageWidth=750,imageHeight=1000,imageFormat='JPEG',imageBytes=(ROOT/'public/covers'/f'{id}.jpg').stat().st_size,coverStories=[],issueTheme=None,cover=f'covers/{id}.jpg'))
        (ROOT/'app/issues.json').write_text(json.dumps(sorted(issues,key=lambda i:i['id'],reverse=True),ensure_ascii=False,indent=2)+'\n')
