import type { ContentsEntry, ReadableIssue } from './catalog';
import { articleEditions } from './articles.ts';
import { normalize, pageLabel } from './model.ts';
import issuesJson from '../issues.json' with { type: 'json' };

/** The web-side facts about an issue that the print catalog does not carry. */
export type IssueData = {
  coverStories: { title: string; url: string; authors?: string[] }[];
};
const issueDataById = new Map<string, IssueData>(
  issuesJson.map((entry) => [entry.id, entry as IssueData]),
);

// Special editions can have extra covers before printed folio 1.
export const physicalPage = (
  printed: number,
  issue?: Pick<ReadableIssue, 'printOffset'>,
) => printed + (issue?.printOffset ?? 2);

/** First physical page of the back matter; pageCount + 1 when there is none. */
const backStart = (issue: ReadableIssue) =>
  issue.pageCount - (issue.backMatterPages ?? 2) + 1;
const storyStart = (issue: ReadableIssue, index: number) =>
  physicalPage(issue.contents[index].printedPage, issue);
/** First physical page that belongs to a story (or the back matter). */
const firstStoryStart = (issue: ReadableIssue) =>
  issue.contents.length ? storyStart(issue, 0) : backStart(issue);

export function storyIndex(issue: ReadableIssue, page: number) {
  if (page >= backStart(issue)) return -1;
  return issue.contents.findLastIndex(
    (entry) => physicalPage(entry.printedPage, issue) <= page,
  );
}

/**
 * Physical pages of the printed table of contents. `contentsPage` is the
 * first; the import records which contents page each entry came from
 * (`sourceContentsPage`), which cheaply reveals a second page when the
 * listing continues. Anything at or past the first story is ignored.
 */
export function contentsPages(issue: ReadableIssue) {
  const limit = firstStoryStart(issue);
  const pages = new Set<number>();
  for (const page of [
    issue.contentsPage,
    ...issue.contents.map((entry) => entry.sourceContentsPage),
  ])
    if (Number.isInteger(page) && page! > 1 && page! < limit) pages.add(page!);
  return [...pages].sort((a, b) => a - b);
}

export type LocationKind = 'cover' | 'front' | 'contents' | 'story' | 'back';
export type Location = {
  kind: LocationKind;
  /** "Kevin Dowdell’s Boys" | "Cover" | "Front matter" | "Contents" | "Back cover" */
  label: string;
  /** Index into issue.contents, or -1. */
  index: number;
  story?: ContentsEntry;
  /** First physical page of this location. */
  start: number;
  /** Last physical page of this location. */
  end: number;
  /** 1-based. */
  pageInLocation: number;
  /** end - start + 1 */
  pages: number;
  /** Neighbor stories by reading order. */
  previous?: ContentsEntry;
  next?: ContentsEntry;
};

const kindLabels: Record<Exclude<LocationKind, 'story'>, string> = {
  cover: 'Cover',
  front: 'Front matter',
  contents: 'Contents',
  back: 'Back cover',
};

/**
 * Where a physical page sits in the issue. A story runs from its start page
 * to the page before the next story's start (or the last page before the
 * back matter); ads inside that range belong to the story. Pages after the
 * cover and before the first story are front matter, except the printed
 * contents page(s).
 */
export function locate(issue: ReadableIssue, page: number): Location {
  const count = issue.pageCount;
  const back = backStart(issue);
  const finish = (
    kind: LocationKind,
    start: number,
    end: number,
    index = -1,
  ): Location => {
    const story = index >= 0 ? issue.contents[index] : undefined;
    const beforeStories = kind !== 'story' && kind !== 'back';
    return {
      kind,
      label: story?.title ?? kindLabels[kind as Exclude<LocationKind, 'story'>],
      index,
      story,
      start,
      end,
      pageInLocation: page - start + 1,
      pages: end - start + 1,
      previous: story
        ? issue.contents[index - 1]
        : beforeStories
          ? undefined
          : issue.contents.at(-1),
      next: story
        ? issue.contents[index + 1]
        : beforeStories
          ? issue.contents[0]
          : undefined,
    };
  };
  if (page <= 1) return finish('cover', 1, 1);
  if (page >= back) return finish('back', Math.min(back, count), count);
  const index = storyIndex(issue, page);
  if (index >= 0) {
    const start = storyStart(issue, index);
    const end =
      index + 1 < issue.contents.length
        ? storyStart(issue, index + 1) - 1
        : back - 1;
    return finish('story', start, Math.max(start, end), index);
  }
  // Front matter and printed contents tile the pages between the cover and
  // the first story; each location is a maximal run of one kind.
  const contents = new Set(contentsPages(issue));
  const kindAt = (n: number): LocationKind =>
    contents.has(n) ? 'contents' : 'front';
  const kind = kindAt(page);
  let start = page,
    end = page;
  const limit = firstStoryStart(issue);
  while (start > 2 && kindAt(start - 1) === kind) start--;
  while (end + 1 < limit && kindAt(end + 1) === kind) end++;
  return finish(kind, start, end);
}

/** Every location of the issue in reading order; they tile 1..pageCount. */
export function locations(issue: ReadableIssue) {
  const result: Location[] = [];
  for (let page = 1; page <= issue.pageCount;) {
    const at = locate(issue, page);
    result.push(at);
    page = at.end + 1;
  }
  return result;
}

export function adjacentStory(
  issue: ReadableIssue,
  page: number,
  direction: number,
) {
  return locate(issue, page)[direction > 0 ? 'next' : 'previous'];
}

export function articleForStory(issue: ReadableIssue, printedPage: number) {
  return articleEditions.find(
    (a) =>
      a.issueId === issue.id && a.pages[0] === physicalPage(printedPage, issue),
  );
}

export function locationTitle(issue: ReadableIssue, page: number) {
  return locate(issue, page).label;
}

/** What "Continue reading" should say for a saved page. */
export function resumeLabel(
  issue: ReadableIssue,
  page: number,
): { title: string; author?: string; pageLabel: string } {
  const at = locate(issue, page);
  return {
    title: at.story?.title ?? at.label,
    author: at.story?.author || undefined,
    pageLabel: pageLabel(
      page,
      issue.pageCount,
      issue.printOffset,
      issue.backMatterPages,
    ),
  };
}

// Web headlines carry markup ("Post-<em>Roe</em>") and print titles carry
// typographic quotes; compare letters and digits only.
const titleKey = (title: string) =>
  normalize(title.replace(/<[^>]+>/g, ''))
    .replace(/[^\p{L}\p{N} ]+/gu, '')
    .trim();
const sameTitle = (a: string, b: string) =>
  titleKey(a).length > 0 && titleKey(a) === titleKey(b);
const byline = (
  cover: IssueData['coverStories'][number],
  entry: ContentsEntry,
) =>
  Boolean(entry.author) &&
  (cover.authors ?? []).some(
    (author) =>
      author.trim() && normalize(entry.author!).includes(normalize(author)),
  );
const sameEntry = (a: ContentsEntry, b: ContentsEntry) =>
  a === b || a.printedPage === b.printedPage;

/**
 * The contents entry that is the issue's cover story, if we can say so with
 * confidence. Order of trust:
 *
 * 1. an entry filed under the `Cover story` section (hand-curated issues);
 * 2. an entry whose title matches one of the web `coverStories`;
 * 3. the entry at `coverStoryPage`, but only when a web cover story shares
 *    its byline. In every imported archive issue `coverStoryPage` points at
 *    the first contents entry ("The Commons", "Editor’s Note"), so on its
 *    own the field is not evidence.
 */
export function coverStoryEntry(
  issue: ReadableIssue,
  issueData: IssueData | undefined = issueDataById.get(issue.id),
): ContentsEntry | undefined {
  const flagged = issue.contents.find((e) => e.section === 'Cover story');
  if (flagged) return flagged;
  const covers = issueData?.coverStories ?? [];
  for (const cover of covers) {
    const hit = issue.contents.find((e) => sameTitle(e.title, cover.title));
    if (hit) return hit;
  }
  const at = issue.contents.find(
    (e) => physicalPage(e.printedPage, issue) === issue.coverStoryPage,
  );
  return at && covers.some((cover) => byline(cover, at)) ? at : undefined;
}

/**
 * The theatlantic.com URL for a story, when known. A `url` on the catalog
 * entry (a later data job) wins; otherwise the issue's web `coverStories`
 * are matched by title. The printed title can differ from the web headline
 * (September 2026 prints "Confessions of a Token Black Professor" for the
 * story published as "Why I Quit the Tenure Track"), so for the issue's
 * cover story we fall back to the web cover story with the same byline, or
 * the only web cover story when the entry is filed as `Cover story`.
 */
export function storyUrl(
  issue: ReadableIssue,
  entry: ContentsEntry,
  issueData: IssueData | undefined = issueDataById.get(issue.id),
): string | undefined {
  const own = (entry as ContentsEntry & { url?: unknown }).url;
  if (typeof own === 'string' && own) return own;
  const covers = issueData?.coverStories ?? [];
  const byTitle = covers.find((cover) => sameTitle(cover.title, entry.title));
  if (byTitle) return byTitle.url;
  const cover = coverStoryEntry(issue, issueData);
  if (!cover || !sameEntry(cover, entry)) return undefined;
  const byByline = covers.find((c) => byline(c, entry));
  if (byByline) return byByline.url;
  return covers.length === 1 && entry.section === 'Cover story'
    ? covers[0].url
    : undefined;
}
