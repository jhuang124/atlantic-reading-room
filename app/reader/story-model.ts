import type { ReadableIssue } from './catalog';
import { articleEditions } from './articles';
// Printed folios exclude the front cover and inside front cover.
export const physicalPage = (printed: number) => printed + 2;
export function storyIndex(issue: ReadableIssue, page: number) {
  if (page > issue.pageCount - 2) return -1;
  return issue.contents.findLastIndex(
    (entry) => physicalPage(entry.printedPage) <= page,
  );
}
export function adjacentStory(
  issue: ReadableIssue,
  page: number,
  direction: number,
) {
  const current = storyIndex(issue, page);
  if (current < 0)
    return page <= physicalPage(issue.contents[0].printedPage)
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
    (a) => a.issueId === issue.id && a.pages[0] === physicalPage(printedPage),
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
