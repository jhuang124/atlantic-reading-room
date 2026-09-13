import type { ContentsEntry, ReadableIssue } from './catalog';
import { pageLabel } from './model.ts';
// Special editions can have extra covers before printed folio 1.
export const physicalPage = (
  printed: number,
  issue?: Pick<ReadableIssue, 'printOffset'>,
) => printed + (issue?.printOffset ?? 2);
export function storyIndex(issue: ReadableIssue, page: number) {
  if (page > issue.pageCount - (issue.backMatterPages ?? 2)) return -1;
  return issue.contents.findLastIndex(
    (entry) => physicalPage(entry.printedPage, issue) <= page,
  );
}
export function adjacentStory(
  issue: ReadableIssue,
  page: number,
  direction: number,
) {
  if (!issue.contents.length) return undefined;
  const current = storyIndex(issue, page);
  if (current < 0)
    return page <= physicalPage(issue.contents[0].printedPage, issue)
      ? direction > 0
        ? issue.contents[0]
        : undefined
      : direction < 0
        ? issue.contents.at(-1)
        : undefined;
  return issue.contents[current + direction];
}
export function locationTitle(issue: ReadableIssue, page: number) {
  return locate(issue, page).label;
}

/** Where a page sits in the issue, in the reader's terms: the story is the
 * unit, the page is the medium. A story runs from its opening page to the page
 * before the next story opens (ads inside that range belong to the story). */
export type Location = {
  kind: 'cover' | 'front' | 'contents' | 'story' | 'back';
  label: string;
  index: number;
  story?: ContentsEntry;
  start: number;
  end: number;
  pageInLocation: number;
  pages: number;
  previous?: ContentsEntry;
  next?: ContentsEntry;
};
export function locate(issue: ReadableIssue, page: number): Location {
  const count = issue.pageCount,
    backStart = count - (issue.backMatterPages ?? 2) + 1,
    stories = issue.contents,
    firstStory = stories.length
      ? physicalPage(stories[0].printedPage, issue)
      : backStart;
  const span = (
    kind: Location['kind'],
    label: string,
    start: number,
    end: number,
    index = -1,
  ): Location => ({
    kind,
    label,
    index,
    story: index >= 0 ? stories[index] : undefined,
    start,
    end,
    pageInLocation: page - start + 1,
    pages: end - start + 1,
    previous: index >= 0 ? stories[index - 1] : undefined,
    next: index >= 0 ? stories[index + 1] : undefined,
  });
  if (page <= 1) return { ...span('cover', 'Cover', 1, 1), next: stories[0] };
  if (page >= backStart)
    return {
      ...span('back', 'Back cover', backStart, count),
      previous: stories.at(-1),
    };
  if (page === issue.contentsPage)
    return { ...span('contents', 'Contents', page, page), next: stories[0] };
  const index = storyIndex(issue, page);
  if (index < 0 || page < firstStory)
    return {
      ...span('front', 'Front matter', 2, Math.max(2, firstStory - 1)),
      next: stories[0],
    };
  const start = physicalPage(stories[index].printedPage, issue),
    following = stories[index + 1],
    end = following
      ? physicalPage(following.printedPage, issue) - 1
      : backStart - 1;
  return span('story', stories[index].title, start, Math.max(start, end), index);
}

const normalizeTitle = (title: string) =>
  title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** The theatlantic.com URL for a story, when one is known. Catalog entries may
 * carry a `url` (a later data job); otherwise the issue's cover stories are
 * matched by normalized title. */
export function storyUrl(
  issue: ReadableIssue,
  entry: ContentsEntry,
  issueData?: {
    coverStories: { title: string; url: string; authors?: string[] }[];
  },
): string | undefined {
  const direct = (entry as ContentsEntry & { url?: string }).url;
  if (direct) return direct;
  if (!issueData) return undefined;
  const title = normalizeTitle(entry.title);
  const byTitle = issueData.coverStories.find(
    (story) => story.url && normalizeTitle(story.title) === title,
  );
  if (byTitle) return byTitle.url;
  // Print headlines often differ from the web headline of the same cover
  // story; the byline settles it when the catalog marks the entry as one.
  if (entry.section === 'Cover story' && entry.author) {
    const byAuthor = issueData.coverStories.find(
      (story) =>
        story.url &&
        story.authors?.some(
          (author) => normalizeTitle(author) === normalizeTitle(entry.author!),
        ),
    );
    if (byAuthor) return byAuthor.url;
  }
  return undefined;
}

/** What the shelf says about a saved place: the story, not the page. */
export function resumeLabel(
  issue: ReadableIssue,
  page: number,
): { title: string; author?: string; pageLabel: string } {
  const location = locate(issue, page);
  return {
    title: location.label,
    author: location.story?.author,
    pageLabel: pageLabel(
      page,
      issue.pageCount,
      issue.printOffset,
      issue.backMatterPages,
    ),
  };
}
