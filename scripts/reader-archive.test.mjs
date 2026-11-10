import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readerIssues } from '../app/reader/catalog.ts';
import {
  archive,
  buildArchive,
  daySeed,
  issueMonths,
  openerPages,
  openerSrc,
  thisMonthInHistory,
  writers,
} from '../app/archive.ts';

test('The archive indexes every story of every readable issue, newest first', () => {
  const total = readerIssues.reduce((n, issue) => n + issue.contents.length, 0);
  assert.equal(archive.length, total);
  assert.ok(archive.length > 1000);
  for (let i = 1; i < archive.length; i++)
    assert.ok(archive[i - 1].issue.id >= archive[i].issue.id);
  assert.equal(new Set(archive.map((entry) => entry.key)).size, archive.length);
  assert.equal(buildArchive(readerIssues, () => false).length, 0);
});

test('Features open as art: a spread from a left-hand page, one page otherwise', () => {
  const issue = readerIssues.find((i) => i.id === '202609');
  const feature = issue.contents.find((e) => e.title === 'Did al-Qaeda Succeed?');
  // Printed page 26 is physical page 28, a left-hand page: the spread.
  assert.deepEqual(openerPages(issue, feature), [28, 29]);
  const critic = issue.contents.find((e) => e.section === 'Culture & Critics');
  assert.deepEqual(openerPages(issue, critic), []);
  assert.deepEqual(
    openerPages(issue, { ...feature, printedPage: 27 }),
    [29],
    'a right-hand opener stands alone',
  );
});

test('Every piece of opening art the front page can ask for is on disk', () => {
  const missing = archive.flatMap((entry) =>
    entry.art
      .map((page) => `public/${openerSrc(entry.issue.id, page)}`)
      .filter((path) => !existsSync(path)),
  );
  assert.deepEqual(missing, []);
});

test('This month in history takes one feature a year and holds still for a day', () => {
  const picks = thisMonthInHistory(archive, 11, '202609', 3);
  assert.deepEqual(
    picks.map((entry) => entry.year),
    [2025, 2024, 2023, 2022, 2021, 2020],
  );
  for (const entry of picks) {
    assert.ok(entry.months.includes(11));
    assert.ok(entry.art.length > 0);
  }
  assert.deepEqual(thisMonthInHistory(archive, 11, '202609', 3), picks);
  // The issue on the front page never appears in its own history.
  assert.ok(
    thisMonthInHistory(archive, 9, '202609', 0).every(
      (entry) => entry.issue.id < '202609',
    ),
  );
  // A double issue answers to both of its months.
  assert.deepEqual(issueMonths('January/February 2023'), [1, 2]);
  assert.equal(
    daySeed(new Date(2026, 10, 10, 1)),
    daySeed(new Date(2026, 10, 10, 23)),
  );
  assert.notEqual(
    daySeed(new Date(2026, 10, 10, 12)),
    daySeed(new Date(2026, 10, 11, 12)),
  );
});

test('Writers are counted once per byline name, most published first', () => {
  const all = writers(archive);
  assert.equal(all[0].name, 'James Parker');
  assert.ok(all[0].count > all[1].count);
  for (let i = 1; i < all.length; i++)
    assert.ok(all[i - 1].count >= all[i].count);
  // A shared byline counts for each writer and never as one joined name.
  assert.ok(all.every((writer) => !/ and |,|&/.test(writer.name)));
});
