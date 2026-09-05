"""Compress search data and navigation thumbnails; full-size print PDFs stay intact."""
from pathlib import Path
from PIL import Image
import concurrent.futures,gzip,io
root=Path(__file__).resolve().parents[1]/'public/reader-assets'

def thumbnail(path):
    out=io.BytesIO()
    with Image.open(path) as image:image.save(out,format='JPEG',quality=50,optimize=True,progressive=True)
    data=out.getvalue()
    if len(data)<path.stat().st_size*.85:path.write_bytes(data)

if __name__=='__main__':
    for path in root.glob('*/index.json'):
        path.with_suffix('.json.gz').write_bytes(gzip.compress(path.read_bytes(),compresslevel=9,mtime=0))
        path.unlink()
    with concurrent.futures.ThreadPoolExecutor(4) as pool:list(pool.map(thumbnail,root.glob('*/*.jpg')))
    print('Search indexes and page thumbnails optimized.')
