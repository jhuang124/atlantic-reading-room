import test from 'node:test';
import assert from 'node:assert/strict';
import { readerIssues } from '../app/reader/catalog.ts';
import {
  adjacentStory,
  contentsPages,
  coverStoryEntry,
  locate,
  locationTitle,
  locations,
  physicalPage,
  resumeLabel,
  storyIndex,
  storyUrl,
} from '../app/reader/story-model.ts';
import {
  defaultPreferences,
  loadPreferences,
  normalizePlace,
} from '../app/reader/place.ts';
import issues from '../app/issues.json' with { type: 'json' };

const september = readerIssues.find((issue) => issue.id === '202609');
const backStart = (issue) => issue.pageCount - (issue.backMatterPages ?? 2) + 1;
const sameLocation = (a, b) =>
  a.kind === b.kind &&
  a.start === b.start &&
  a.end === b.end &&
  a.index === b.index;

test('Every physical page of every issue belongs to exactly one location, and locations tile the issue', () => {
  for (const issue of readerIssues) {
    const tiles = locations(issue);
    assert.equal(tiles[0].start, 1, issue.id);
    assert.equal(tiles.at(-1).end, issue.pageCount, issue.id);
    for (let i = 1; i < tiles.length; i++)
      assert.equal(tiles[i].start, tiles[i - 1].end + 1, issue.id);
    for (let page = 1; page <= issue.pageCount; page++) {
      const at = locate(issue, page);
      assert.ok(at.start <= page && page <= at.end, `${issue.id} p${page}`);
      const owners = tiles.filter((t) => t.start <= page && page <= t.end);
      assert.equal(owners.length, 1, `${issue.id} p${page}`);
      assert.ok(sameLocation(owners[0], at), `${issue.id} p${page}`);
      assert.equal(at.pageInLocation, page - at.start + 1);
      assert.equal(at.pages, at.end - at.start + 1);
      assert.ok(at.pageInLocation >= 1 && at.pageInLocation <= at.pages);
    }
  }
});

test('The cover is page 1 and the back matter is the last backMatterPages pages', () => {
  for (const issue of readerIssues) {
    const cover = locate(issue, 1);
    assert.equal(cover.kind, 'cover');
    assert.deepEqual([cover.start, cover.end, cover.label], [1, 1, 'Cover']);
    const back = backStart(issue);
    for (let page = back; page <= issue.pageCount; page++) {
      const at = locate(issue, page);
      assert.equal(at.kind, 'back', `${issue.id} p${page}`);
      assert.deepEqual([at.start, at.end], [back, issue.pageCount]);
      assert.equal(at.label, 'Back cover');
      assert.equal(at.previous, issue.contents.at(-1));
      assert.equal(at.next, undefined);
    }
    assert.notEqual(locate(issue, back - 1).kind, 'back', issue.id);
  }
});

test('A story starts on its printed page and runs to the page before the next story', () => {
  for (const issue of readerIssues) {
    issue.contents.forEach((entry, i) => {
      const start = physicalPage(entry.printedPage, issue);
      const at = locate(issue, start);
      assert.equal(at.kind, 'story', `${issue.id} ${entry.title}`);
      assert.equal(at.start, start);
      assert.equal(at.index, i);
      assert.equal(at.story, entry);
      assert.equal(at.label, entry.title);
      assert.equal(at.pageInLocation, 1);
      const following = issue.contents[i + 1];
      assert.equal(
        at.end,
        following
          ? physicalPage(following.printedPage, issue) - 1
          : backStart(issue) - 1,
      );
      assert.equal(at.previous, issue.contents[i - 1]);
      assert.equal(at.next, following);
      // Every page inside the range, ads included, still belongs to it.
      for (let page = start; page <= at.end; page++) {
        assert.equal(storyIndex(issue, page), i);
        assert.equal(locate(issue, page).story, entry);
      }
      assert.equal(adjacentStory(issue, start, 1), following);
      assert.equal(adjacentStory(issue, start, -1), issue.contents[i - 1]);
    });
  }
});

test('Pages between the cover and the first story are front matter except the printed contents', () => {
  for (const issue of readerIssues) {
    if (!issue.contents.length) continue;
    const first = physicalPage(issue.contents[0].printedPage, issue);
    const contents = contentsPages(issue);
    assert.ok(contents.includes(issue.contentsPage), issue.id);
    for (let page = 2; page < first; page++) {
      const at = locate(issue, page);
      assert.equal(
        at.kind,
        contents.includes(page) ? 'contents' : 'front',
        `${issue.id} p${page}`,
      );
      assert.equal(
        at.label,
        at.kind === 'contents' ? 'Contents' : 'Front matter',
      );
      assert.equal(at.index, -1);
      assert.equal(at.story, undefined);
      assert.equal(at.previous, undefined);
      assert.equal(at.next, issue.contents[0]);
      assert.ok(at.start >= 2 && at.end < first);
    }
  }
  // The import records which contents page each entry came from, which
  // reveals a second contents page without any layout detection.
  const july = readerIssues.find((issue) => issue.id === '202607');
  assert.deepEqual(contentsPages(july), [7, 8]);
  assert.equal(locate(july, 8).kind, 'contents');
  assert.deepEqual([locate(july, 7).start, locate(july, 7).end], [7, 8]);
  assert.deepEqual(contentsPages(september), [7]);
});

test('Location labels and locationTitle agree on every page', () => {
  for (let page = 1; page <= september.pageCount; page++)
    assert.equal(locationTitle(september, page), locate(september, page).label);
  assert.equal(locationTitle(september, 1), 'Cover');
  assert.equal(locationTitle(september, 3), 'Front matter');
  assert.equal(locationTitle(september, 7), 'Contents');
  assert.equal(locationTitle(september, 26), 'Kevin Dowdell’s Boys');
  assert.equal(locationTitle(september, 112), 'Back cover');
  const at = locate(september, 26);
  assert.deepEqual(
    [at.start, at.end, at.pageInLocation, at.pages],
    [18, 27, 9, 10],
  );
  assert.equal(at.previous.title, 'You Call That a Pull-Up?');
  assert.equal(at.next.title, 'Did al-Qaeda Succeed?');
});

test('resumeLabel speaks in stories for story pages and in labels elsewhere', () => {
  assert.deepEqual(resumeLabel(september, 26), {
    title: 'Kevin Dowdell’s Boys',
    author: 'Sally Jenkins',
    pageLabel: '24',
  });
  assert.deepEqual(resumeLabel(september, 1), {
    title: 'Cover',
    author: undefined,
    pageLabel: 'Cover',
  });
  assert.equal(resumeLabel(september, 3).title, 'Front matter');
  assert.equal(resumeLabel(september, 7).title, 'Contents');
  assert.equal(resumeLabel(september, 112).title, 'Back cover');
  assert.equal(resumeLabel(september, 112).pageLabel, 'Back cover');
  // An entry without a byline yields no author rather than an empty string.
  const commons = physicalPage(september.contents[0].printedPage, september);
  assert.equal(resumeLabel(september, commons).author, 'Discussion & Debate');
  const july = readerIssues.find((issue) => issue.id === '202607');
  assert.equal(resumeLabel(july, 12).author, undefined);
});

test('storyUrl finds the September 2026 cover story although print and web titles differ', () => {
  const entry = september.contents.find(
    (e) => e.title === 'Confessions of a Token Black Professor',
  );
  const web = issues.find((issue) => issue.id === '202609').coverStories;
  // The printed contents title is not the web headline, so a title match
  // cannot work here; the cover-story page plus byline resolves it.
  assert.equal(web[0].title, 'Why I Quit the Tenure Track');
  assert.equal(
    physicalPage(entry.printedPage, september),
    september.coverStoryPage,
  );
  assert.equal(coverStoryEntry(september), entry);
  assert.equal(storyUrl(september, entry), web[0].url);
  assert.match(storyUrl(september, entry), /\/687969\/$/);
  for (const other of september.contents)
    if (other !== entry) assert.equal(storyUrl(september, other), undefined);
  // Ordinary title matches, markup in web headlines, and explicit data.
  const february = readerIssues.find((issue) => issue.id === '202502');
  const antiSocial = february.contents.find(
    (e) => e.title === 'The Anti-Social Century',
  );
  assert.match(storyUrl(february, antiSocial), /american-loneliness/);
  assert.equal(coverStoryEntry(february), antiSocial);
  assert.equal(
    storyUrl(september, entry, {
      coverStories: [
        { title: 'Confessions of a <em>Token</em> Black Professor', url: 'u' },
      ],
    }),
    'u',
  );
  assert.equal(storyUrl(september, entry, { coverStories: [] }), undefined);
  assert.equal(
    storyUrl(september, { ...entry, url: 'https://example.com/story' }),
    'https://example.com/story',
  );
});

test('The archive’s coverStoryPage is not trusted without corroboration', () => {
  // In imported issues the field points at the first contents entry
  // ("The Commons", "Editor’s Note"); a Cover story kicker there would lie.
  let kickers = 0;
  for (const issue of readerIssues) {
    const cover = coverStoryEntry(issue);
    if (!cover) continue;
    kickers++;
    assert.ok(
      cover.section === 'Cover story' || issue.contents.indexOf(cover) > 0,
      `${issue.id} ${cover.title}`,
    );
    assert.ok(storyUrl(issue, cover), `${issue.id} ${cover.title}`);
  }
  assert.ok(kickers >= 19);
  const july = readerIssues.find((issue) => issue.id === '202607');
  assert.equal(coverStoryEntry(july), undefined);
  assert.equal(storyUrl(july, july.contents[0]), undefined);
});

test('Saved places from the retired Page width and Column views migrate to Scroll and Spread', () => {
  const saved = { page: 14, zoom: 1.7, left: 1516, top: 630, column: 1 };
  const page = normalizePlace({ ...saved, mode: 'page' }, 112);
  assert.equal(page.mode, 'scroll');
  assert.equal(page.page, 14);
  assert.equal(page.pageOffset, 0);
  assert.deepEqual([page.zoom, page.left, page.top], [1, 0, 0]);
  const column = normalizePlace({ ...saved, mode: 'column' }, 112);
  assert.equal(column.mode, 'spread');
  assert.equal('pageOffset' in column, false);
  const scroll = normalizePlace(
    { ...saved, mode: 'scroll', pageOffset: 0.4 },
    112,
  );
  assert.equal(scroll.mode, 'scroll');
  assert.equal(scroll.pageOffset, 0.4);
  assert.equal(scroll.zoom, 1.7);
  assert.equal(
    normalizePlace({ ...saved, mode: 'spread' }, 112).mode,
    'spread',
  );
});

test('View preferences default per device class and reject unknown values', () => {
  const data = new Map();
  globalThis.localStorage = {
    getItem: (k) => data.get(k) || null,
    setItem: (k, v) => data.set(k, v),
  };
  assert.equal(defaultPreferences.viewDesktop, 'spread');
  assert.equal(defaultPreferences.viewPhone, 'scroll');
  assert.equal(loadPreferences().viewDesktop, 'spread');
  assert.equal(loadPreferences().viewPhone, 'scroll');
  data.set(
    'atlantic:reader-preferences',
    JSON.stringify({ viewDesktop: 'scroll', viewPhone: 'spread' }),
  );
  assert.equal(loadPreferences().viewDesktop, 'scroll');
  assert.equal(loadPreferences().viewPhone, 'spread');
  data.set(
    'atlantic:reader-preferences',
    JSON.stringify({ viewDesktop: 'page', viewPhone: 42 }),
  );
  assert.equal(loadPreferences().viewDesktop, 'spread');
  assert.equal(loadPreferences().viewPhone, 'scroll');
  delete globalThis.localStorage;
});
