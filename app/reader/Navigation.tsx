import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bookmark, Search, X } from 'lucide-react';
import type { ReadableIssue } from './catalog';
import { pageLabel, searchPages, type IndexedPage } from './model';
import {
  articleForStory,
  physicalPage,
  storyIndex,
  locationTitle,
} from './story-model';
export type NavigationTab = 'contents' | 'pages' | 'search' | 'saved';
export default function Navigation({
  issue,
  tab,
  onTab,
  page,
  index,
  indexError,
  query,
  onQuery,
  marks,
  onRemoveMark,
  onNavigate,
  onStory,
  suspended,
  onPreview,
  onClose,
}: {
  issue: ReadableIssue;
  tab: NavigationTab;
  onTab: (tab: NavigationTab) => void;
  page: number;
  index: IndexedPage[];
  indexError: boolean;
  query: string;
  onQuery: (s: string) => void;
  marks: number[];
  onRemoveMark: (n: number) => void;
  onNavigate: (n: number) => void;
  onStory: (n: number) => void;
  suspended: boolean;
  onPreview: (n: number) => void;
  onClose: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [storyQuery, setStoryQuery] = useState('');
  const current = storyIndex(issue, page);
  const results = searchPages(index, query);
  useEffect(() => {
    if (tab === 'search') search.current?.focus();
    else
      root.current
        ?.querySelector<HTMLElement>('[aria-current="location"]')
        ?.scrollIntoView({ block: 'nearest' });
  }, [tab]);
  return (
    <>
      <button
        inert={suspended}
        className="navigation-scrim"
        aria-label="Close contents"
        onClick={onClose}
      />
      <aside
        inert={suspended}
        className="reader-navigation"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contents-heading"
        ref={root}
      >
        <header>
          <div>
            <p>{issue.issue}</p>
            <h2 id="contents-heading">Contents</h2>
          </div>
          <button onClick={onClose} aria-label="Close contents">
            <X size={20} />
          </button>
        </header>
        <div
          className="navigation-tabs"
          role="tablist"
          aria-label="Browse this issue"
        >
          {(['contents', 'pages', 'search', 'saved'] as const).map(
            (value, i) => (
              <button
                key={value}
                role="tab"
                id={`nav-${value}`}
                aria-selected={tab === value}
                aria-controls="navigation-results"
                tabIndex={tab === value ? 0 : -1}
                onClick={() => onTab(value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const tabs = [
                      'contents',
                      'pages',
                      'search',
                      'saved',
                    ] as const;
                    const next =
                      tabs[(i + (e.key === 'ArrowRight' ? 1 : 3)) % 4];
                    onTab(next);
                    requestAnimationFrame(() =>
                      document.getElementById(`nav-${next}`)?.focus(),
                    );
                  }
                }}
              >
                {value === 'contents'
                  ? 'Stories'
                  : value === 'saved'
                    ? 'Saved'
                    : value === 'pages'
                      ? 'Pages'
                      : 'Search'}
              </button>
            ),
          )}
        </div>
        <div
          className="navigation-results"
          id="navigation-results"
          role="tabpanel"
          aria-labelledby={`nav-${tab}`}
        >
          {tab === 'contents' && (
            <>
              <label className="navigation-search">
                <Search size={16} />
                <input
                  aria-label="Find a story or author"
                  placeholder="Find a story or author"
                  value={storyQuery}
                  onChange={(e) => setStoryQuery(e.target.value)}
                />
              </label>
              {!storyQuery && (
                <div className="contents-utility">
                  <button onClick={() => onNavigate(1)}>Cover</button>
                  <button onClick={() => onNavigate(issue.contentsPage)}>
                    Printed contents <ArrowRight size={14} />
                  </button>
                </div>
              )}
              {issue.contents
                .map((entry, i) => ({ entry, i }))
                .filter(({ entry }) =>
                  `${entry.title} ${entry.author} ${entry.section}`
                    .toLowerCase()
                    .includes(storyQuery.toLowerCase()),
                )
                .map(({ entry, i }) => (
                  <div className="contents-item" key={entry.printedPage}>
                    {(storyQuery ||
                      i === 0 ||
                      entry.section !== issue.contents[i - 1].section) && (
                      <h3>{entry.section}</h3>
                    )}
                    <button
                      className="story-destination"
                      aria-current={i === current ? 'location' : undefined}
                      onClick={() => onStory(physicalPage(entry.printedPage))}
                    >
                      <span>
                        <strong>{entry.title}</strong>
                        <small>{entry.author}</small>
                        {articleForStory(issue, entry.printedPage) && (
                          <em>Article view available</em>
                        )}
                      </span>
                      <span className="story-folio">{entry.printedPage}</span>
                    </button>
                  </div>
                ))}
              {storyQuery &&
                !issue.contents.some((e) =>
                  `${e.title} ${e.author} ${e.section}`
                    .toLowerCase()
                    .includes(storyQuery.toLowerCase()),
                ) && (
                  <p className="navigation-empty">
                    No matching stories. Try a different title or author.
                  </p>
                )}
            </>
          )}
          {tab === 'pages' && (
            <div className="navigation-pages">
              {Array.from({ length: issue.pageCount }, (_, i) => i + 1).map(
                (n) => (
                  <button
                    key={n}
                    aria-label={`Preview ${pageLabel(n, issue.pageCount)}`}
                    aria-current={n === page ? 'location' : undefined}
                    onClick={() => onPreview(n)}
                  >
                    <img
                      src={`reader-assets/${issue.id}/${n}.jpg`}
                      alt=""
                      loading="lazy"
                    />
                    <span>{pageLabel(n, issue.pageCount)}</span>
                    {marks.includes(n) && <Bookmark size={12} />}
                  </button>
                ),
              )}
            </div>
          )}
          {tab === 'search' && (
            <>
              <label className="navigation-search">
                <Search size={16} />
                <input
                  ref={search}
                  aria-label="Search this issue"
                  placeholder="Search this issue"
                  value={query}
                  onChange={(e) => onQuery(e.target.value)}
                />
                {query && (
                  <button aria-label="Clear search" onClick={() => onQuery('')}>
                    <X size={16} />
                  </button>
                )}
              </label>
              <p className="navigation-empty" role="status">
                {query.trim().length < 2
                  ? 'Search the text of every page.'
                  : !index.length
                    ? indexError
                      ? 'Search is unavailable. Use Stories or Pages to browse.'
                      : 'Preparing search…'
                    : `${results.length} matching pages`}
              </p>
              {results.map((result) => (
                <button
                  className="search-destination"
                  key={result.page}
                  onClick={() => onNavigate(result.page)}
                >
                  <small>
                    Page {pageLabel(result.page, issue.pageCount)} ·{' '}
                    {locationTitle(issue, result.page)}
                  </small>
                  <p>{result.snippet}</p>
                </button>
              ))}
            </>
          )}
          {tab === 'saved' && (
            <>
              {!marks.length && (
                <p className="navigation-empty">
                  No saved pages yet. Use Save in the reader to add one.
                </p>
              )}
              {marks.map((n) => (
                <div className="saved-destination" key={n}>
                  <button onClick={() => onNavigate(n)}>
                    <img src={`reader-assets/${issue.id}/${n}.jpg`} alt="" />
                    <span>
                      {locationTitle(issue, n)}
                      <small>Page {pageLabel(n, issue.pageCount)}</small>
                    </span>
                  </button>
                  <button
                    onClick={() => onRemoveMark(n)}
                    aria-label={`Remove bookmark at ${pageLabel(n, issue.pageCount)}`}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
