import type { ReadableIssue } from './catalog';
import { articleEditions } from './articles';
// Special editions can have extra covers before printed folio 1.
export const physicalPage = (printed: number, issue?: Pick<ReadableIssue, 'printOffset'>) => printed + (issue?.printOffset ?? 2);
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
export function articleForStory(issue: ReadableIssue, printedPage: number) {
  return articleEditions.find(
    (a) => a.issueId === issue.id && a.pages[0] === physicalPage(printedPage, issue),
  );
}
export function locationTitle(issue: ReadableIssue, page: number) {
  const story = issue.contents[storyIndex(issue, page)];
  return (
    story?.title ||
    (page === 1
      ? 'Cover'
      : page >= issue.pageCount - 1
        ? 'Back cover'
        : 'Front matter')
  );
}
