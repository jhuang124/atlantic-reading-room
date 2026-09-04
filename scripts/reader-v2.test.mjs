import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {registerHooks} from 'node:module';
import {readerIssues} from '../app/reader/catalog.ts';
registerHooks({resolve(specifier,context,next){if(specifier==='./articles'&&context.parentURL?.endsWith('/story-model.ts'))return next('./articles.ts',context);return next(specifier,context);}});
const {storyIndex,adjacentStory,physicalPage,articleForStory}=await import('../app/reader/story-model.ts');
test('Story navigation visits every editorial destination in order, with honest boundaries',()=>{
 for(const issue of readerIssues){
  assert.equal(adjacentStory(issue,1,-1),undefined);
  let page=1;const seen=[];
  while(true){const next=adjacentStory(issue,page,1);if(!next)break;seen.push(next.title);page=physicalPage(next.printedPage);}
  assert.deepEqual(seen,issue.contents.map(c=>c.title));
  assert.equal(adjacentStory(issue,issue.pageCount,1),undefined);
  assert.equal(adjacentStory(issue,issue.pageCount,-1).title,issue.contents.at(-1).title);
  for(let i=0;i<issue.contents.length;i++) assert.equal(storyIndex(issue,physicalPage(issue.contents[i].printedPage)),i);
 }
});
test('Every story destination is grounded in its actual opening spread, not a guessed folio',()=>{
 const norm=t=>t.toLowerCase().replace(/[^a-z]/g,'');
 for(const issue of readerIssues){const index=JSON.parse(fs.readFileSync(`public/reader-assets/${issue.id}/index.json`));
  for(const entry of issue.contents){const opening=norm(index.slice(entry.printedPage+1,entry.printedPage+3).map(p=>p.text).join(' '));
   assert.ok(opening.includes(norm(entry.title))||opening.includes(norm(entry.author)),`${issue.id} ${entry.title} opening spread`);
  }
 }
});
test('Article availability resolves to existing extracted content for the same print story',()=>{
 let count=0;
 for(const issue of readerIssues)for(const entry of issue.contents){const article=articleForStory(issue,entry.printedPage);if(!article)continue;count++;
  const data=JSON.parse(fs.readFileSync(`public/reader-assets/articles/${article.id}.json`));
  assert.equal(data.issueId,issue.id);assert.equal(data.pages[0],physicalPage(entry.printedPage));assert.ok(data.sections.every(s=>s.paragraphs.length));
 }
 assert.equal(count,3);
});
test('Published availability includes complete issues, thumbnails, indexes, and PDF dependencies',()=>{
 const ids=JSON.parse(fs.readFileSync('public/reader-assets/available.json'));
 for(const id of ids){const issue=readerIssues.find(i=>i.id===id);assert.ok(issue);assert.ok(fs.statSync(`public/reader-assets/${id}.pdf`).size>100000);
  assert.equal(JSON.parse(fs.readFileSync(`public/reader-assets/${id}/index.json`)).length,issue.pageCount);
 }
 for(const name of ['cmaps','wasm','standard_fonts'])assert.ok(fs.readdirSync(`public/reader-assets/pdfjs/${name}`).length);
});
