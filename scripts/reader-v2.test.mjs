import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
const readIndex=id=>{const base=`public/reader-assets/${id}/index.json`;return JSON.parse(fs.existsSync(base)?fs.readFileSync(base):gunzipSync(fs.readFileSync(base+'.gz')));};
import {readerIssues} from '../app/reader/catalog.ts';
import {storyIndex,adjacentStory,physicalPage,locate,storyUrl,resumeLabel} from '../app/reader/story-model.ts';
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
test('Every page locates to one story or one named front/back location, in reading order',()=>{
 for(const issue of readerIssues){
  let previousKind='';
  for(let page=1;page<=issue.pageCount;page++){
   const where=locate(issue,page);
   assert.ok(where.start<=page&&page<=where.end,`${issue.id} p${page} inside its location`);
   assert.equal(where.pageInLocation,page-where.start+1);
   assert.equal(where.pages,where.end-where.start+1);
   if(where.kind==='story'){assert.equal(where.story,issue.contents[where.index]);assert.equal(where.label,where.story.title);assert.equal(where.previous,issue.contents[where.index-1]);assert.equal(where.next,issue.contents[where.index+1]);}
   else{assert.equal(where.index,-1);assert.ok(['Cover','Front matter','Contents','Back cover'].includes(where.label));}
   previousKind=where.kind;
  }
  assert.equal(previousKind,'back');
  assert.equal(locate(issue,1).kind,'cover');
  assert.equal(locate(issue,1).next,issue.contents[0]);
  assert.equal(locate(issue,issue.contentsPage).kind,'contents');
  assert.equal(locate(issue,issue.pageCount).previous,issue.contents.at(-1));
  // Stories tile the editorial pages: each ends where the next begins.
  for(let i=1;i<issue.contents.length;i++){const opening=physicalPage(issue.contents[i].printedPage,issue);assert.equal(locate(issue,opening-1).end,opening-1);assert.equal(locate(issue,opening).start,opening);}
 }
});
test('Story URLs come from cover-story data, by web headline or by cover-story byline; resume speaks in stories',()=>{
 const issue=readerIssues.find(i=>i.id==='202609');
 const data={coverStories:[{title:'Why I Quit the Tenure Track',url:'https://example.test/tenure',authors:['Tyler Austin Harper']}]};
 const cover=issue.contents.find(c=>c.section==='Cover story');
 assert.equal(storyUrl(issue,cover,data),'https://example.test/tenure');
 assert.equal(storyUrl(issue,issue.contents[3],data),undefined);
 assert.equal(storyUrl(issue,{...issue.contents[3],url:'https://example.test/direct'},data),'https://example.test/direct');
 assert.equal(storyUrl(issue,{title:'why i quit the tenure track!',printedPage:1,section:'Features'},data),'https://example.test/tenure');
 assert.equal(storyUrl(issue,cover),undefined);
 const resume=resumeLabel(issue,physicalPage(26,issue)+2);
 assert.equal(resume.title,'Did al-Qaeda Succeed?');
 assert.equal(resume.author,'Graeme Wood');
 assert.equal(resume.pageLabel,'28');
 assert.deepEqual(resumeLabel(issue,1),{title:'Cover',author:undefined,pageLabel:'Cover'});
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
