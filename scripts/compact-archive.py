"""Remove redundant PDF objects, checking sampled rendering before replacement."""
import concurrent.futures,json,pathlib
import pymupdf as fitz
from PIL import Image,ImageChops,ImageStat
ROOT=pathlib.Path(__file__).resolve().parents[1]

def compact(path):
    try:
        fitz.TOOLS.mupdf_display_errors(False)
        source=fitz.open(path);tmp=ROOT/'work'/f'{path.stem}-clean.pdf'
        source.save(tmp,clean=True,garbage=4,deflate=True,use_objstms=1,compression_effort=100)
        cleaned=fitz.open(tmp);assert len(source)==len(cleaned)
        differences=[]
        for n in sorted({0,len(source)//3,2*len(source)//3,len(source)-1}):
            a=source[n].get_pixmap(matrix=fitz.Matrix(.5,.5),alpha=False,colorspace=fitz.csRGB)
            b=cleaned[n].get_pixmap(matrix=fitz.Matrix(.5,.5),alpha=False,colorspace=fitz.csRGB)
            assert (a.width,a.height)==(b.width,b.height)
            diff=max(ImageStat.Stat(ImageChops.difference(Image.frombytes('RGB',(a.width,a.height),a.samples),Image.frombytes('RGB',(b.width,b.height),b.samples))).mean)
            assert diff<.5,(path.name,n,diff)
            differences.append(round(diff,5))
        before=path.stat().st_size;after=tmp.stat().st_size
        source.close();cleaned.close()
        if after<before:tmp.replace(path)
        else:tmp.unlink()
        print(path.stem,round(before/1e6,1),'→',round(min(before,after)/1e6,1),'MB',flush=True)
        return dict(id=path.stem,before=before,after=min(before,after),samplePixelDifferences=differences)
    except Exception as e:raise RuntimeError(f'{path.name}: {e}') from None

if __name__=='__main__':
    paths=[p for p in (ROOT/'public/reader-assets').glob('*.pdf') if p.stem not in {'202609','202608','202512'}]
    with concurrent.futures.ProcessPoolExecutor(3) as pool:report=list(pool.map(compact,paths))
    (ROOT/'work/archive-compact-report.json').write_text(json.dumps(report,indent=2))
