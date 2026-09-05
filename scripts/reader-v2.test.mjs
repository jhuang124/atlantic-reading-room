import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
const readIndex=id=>{const base=`public/reader-assets/${id}/index.json`;return JSON.parse(fs.existsSync(base)?fs.readFileSync(base):gunzipSync(fs.readFileSync(base+'.gz')));};
import {registerHooks} from 'node:module';
import {readerIssues} from '../app/reader/catalog.ts';
registerHooks({resolve(specifier,context,next){if(specifier==='./articles'&&context.parentURL?.endsWith('/story-model.ts'))return next('./articles.ts',context);return next(specifier,context);}});
const {storyIndex,adjacentStory,physicalPage,articleForStory}=await import('../app/reader/story-model.ts');
test('Story navigation visits every editorial destination in order, with honest boundaries',()=>{
 for(const issue of readerIssues){
  assert.equal(adjacentStory(issue,1,-1),undefined);
  let page=1;const seen=[];
  while(true){const next=adjacentStory(issue,page,1);if(!next)break;seen.push(next.title);page=physicalPage(next.printedPage,issue);}
  assert.deepEqual(seen,issue.contents.map(c=>c.title));
  assert.equal(adjacentStory(issue,issue.pageCount,1),undefined);
  assert.equal(adjacentStory(issue,issue.pageCount,-1).title,issue.contents.at(-1).title);
  for(let i=0;i<issue.contents.length;i++) assert.equal(storyIndex(issue,physicalPage(issue.contents[i].printedPage,issue)),i);
 }
});
test('Every story destination is grounded in its actual opening spread, not a guessed folio',()=>{
 const norm=t=>t.toLowerCase().replace(/[^a-z]/g,'');
 for(const issue of readerIssues){const index=readIndex(issue.id);
  for(const entry of issue.contents){const physical=physicalPage(entry.printedPage,issue);const opening=norm(index.slice(physical-1,physical+(entry.sourceContentsPage?3:1)).map(p=>p.text).join(' '));
   if(entry.sourceContentsPage){const toc=norm(index[entry.sourceContentsPage-1].text);assert.ok(toc.includes(norm(entry.title)),`${issue.id} ${entry.title} is transcribed from printed contents`);if(entry.visualCheckPage){assert.equal(issue.id,'202601');assert.equal(entry.title,'Postcolonial Chicken');assert.equal(entry.visualCheckPage,physical);continue;}if(entry.pdfLinkPage){assert.ok([physical,physical+1].includes(entry.pdfLinkPage));continue;}}
   assert.ok(opening.includes(norm(entry.title))||(entry.author&&opening.includes(norm(entry.author))),`${issue.id} ${entry.title} opening spread`);
  }
 }
});
test('Article availability resolves to existing extracted content for the same print story',()=>{
 let count=0;
 for(const issue of readerIssues)for(const entry of issue.contents){const article=articleForStory(issue,entry.printedPage);if(!article)continue;count++;
  const data=JSON.parse(fs.readFileSync(`public/reader-assets/articles/${article.id}.json`));
  assert.equal(data.issueId,issue.id);assert.equal(data.pages[0],physicalPage(entry.printedPage,issue));assert.ok(data.sections.every(s=>s.paragraphs.length));
 }
 assert.equal(count,3);
});
test('Published availability includes complete issues, thumbnails, indexes, and PDF dependencies',()=>{
 const ids=JSON.parse(fs.readFileSync('public/reader-assets/available.json'));
 for(const id of ids){const issue=readerIssues.find(i=>i.id===id);assert.ok(issue);assert.ok(fs.statSync(`public/reader-assets/${id}.pdf`).size>100000);
  assert.equal(readIndex(id).length,issue.pageCount);
 }
 for(const name of ['cmaps','wasm','standard_fonts'])assert.ok(fs.readdirSync(`public/reader-assets/pdfjs/${name}`).length);
});

test('Every library issue from January 2020 through September 2026 is readable',()=>{
 const expected=[];
 for(let year=2020;year<=2026;year++)for(let month=1;month<=12;month++){
  if(year<2025&&[2,8].includes(month))continue;
  if(year===2026&&month>9)continue;
  expected.push(`${year}${String(month).padStart(2,'0')}`);
 }
 const available=JSON.parse(fs.readFileSync('public/reader-assets/available.json'));
 const covers=JSON.parse(fs.readFileSync('app/issues.json'));
 assert.equal(expected.length,71);
 assert.deepEqual([...available].sort(),expected);
 assert.deepEqual(readerIssues.map(i=>i.id).sort(),expected);
 for(const id of expected){const cover=covers.find(c=>c.id===id);assert.ok(cover);assert.ok(fs.statSync('public/'+cover.cover).size>10000);}
 const special=readerIssues.find(i=>i.id==='202511');
 assert.equal(special.printOffset,6);
 assert.equal(physicalPage(10,special),16);
 assert.equal(storyIndex(special,16),0);
 assert.equal(adjacentStory({...special,contents:[]},1,1),undefined);
});
