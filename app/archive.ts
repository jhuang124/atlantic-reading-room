// The archive as stories rather than covers: one flat index of every story
// in every readable issue, and the selections the front page is built from.
import {
  readerIssues,
  type ContentsEntry,
  type ReadableIssue,
} from './reader/catalog.ts';

export type ArchiveStory = {
  /** `${issue id}-${printed page}`: stable across sessions. */
  key: string;
  issue: ReadableIssue;
  story: ContentsEntry;
  year: number;
  /** 1–12; a double issue (January/February) answers to both months. */
  months: number[];
  /** Physical page the story opens on. */
  page: number;
  /** Pages with opening art on disk, or none for sections set in type. */
  art: number[];
};

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/** Sections whose stories open on designed pages worth showing as art. */
const ART_SECTIONS = new Set(['Features', 'Cover story', 'Fiction']);

/** A story's opening art: its first page, plus the facing page when the
 * story opens on a left-hand (even) page, which is how features open. */
export function openerPages(issue: ReadableIssue, story: ContentsEntry) {
  if (!ART_SECTIONS.has(story.section)) return [];
  const page = story.printedPage + (issue.printOffset ?? 2);
  if (page < 1 || page > issue.pageCount) return [];
  return page % 2 === 0 && page < issue.pageCount ? [page, page + 1] : [page];
}

export const openerSrc = (id: string, page: number) =>
  `reader-assets/${id}/o${page}.webp`;

export function issueMonths(label: string) {
  const text = label.toLowerCase();
  return MONTHS.flatMap((name, i) => (text.includes(name) ? [i + 1] : []));
}

export function buildArchive(
  issues: ReadableIssue[],
  available: (id: string) => boolean = () => true,
): ArchiveStory[] {
  return issues
    .filter((issue) => available(issue.id))
    .flatMap((issue) =>
      issue.contents.map((story) => ({
        key: `${issue.id}-${story.printedPage}`,
        issue,
        story,
        year: Number(issue.id.slice(0, 4)),
        months: issueMonths(issue.issue),
        page: story.printedPage + (issue.printOffset ?? 2),
        art: openerPages(issue, story),
      })),
    )
    .sort((a, b) => b.issue.id.localeCompare(a.issue.id) || a.page - b.page);
}

const isFeature = (entry: ArchiveStory) => entry.art.length > 0;

/** "This month, years ago": one feature from this calendar month in each
 * earlier year, newest first. `seed` varies the pick within a year so the
 * rail changes from day to day but holds still within one. */
export function thisMonthInHistory(
  archive: ArchiveStory[],
  month: number,
  beforeId: string,
  seed: number,
) {
  const byYear = new Map<number, ArchiveStory[]>();
  for (const entry of archive) {
    if (!isFeature(entry) || !entry.months.includes(month)) continue;
    if (entry.issue.id >= beforeId) continue;
    byYear.set(entry.year, [...(byYear.get(entry.year) ?? []), entry]);
  }
  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, entries]) => entries[seed % entries.length]);
}

/** Writers by how much of the archive is theirs. Bylines with two names
 * count once for each. */
export function writers(archive: ArchiveStory[]) {
  const counts = new Map<string, number>();
  for (const { story } of archive)
    for (const name of (story.author ?? '')
      .split(/,|\band\b|&/)
      .map((part) => part.trim())
      .filter((part) => /^[A-Z]/.test(part) && part.includes(' ')))
      counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** A day number that changes at local midnight. */
export const daySeed = (date: Date) =>
  Math.floor(
    (date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000,
  );

export const archive = buildArchive(readerIssues);
