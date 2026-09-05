import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, Search, X } from 'lucide-react';
import type { ReadableIssue } from './catalog';
import { pageLabel, searchPages, type IndexedPage } from './model';
import {
  adjacentStory,
  physicalPage,
  storyIndex,
  locationTitle,
} from './story-model';
export type NavigationTab = 'contents' | 'pages' | 'search' | 'saved';
const tabs = ['contents', 'pages', 'saved'] as const;
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
  onClose: () => void;
}) {
  const root = useRef<HTMLElement>(null),
    search = useRef<HTMLInputElement>(null);
  const current = storyIndex(issue, page),
    results = searchPages(index, query);
  const previous = adjacentStory(issue, page, -1),
    next = adjacentStory(issue, page, 1);
  const matching = issue.contents.filter((e) =>
    `${e.title} ${e.author || ''}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const label = (n: number) =>
    pageLabel(n, issue.pageCount, issue.printOffset, issue.backMatterPages);
  useEffect(() => {
    if (tab === 'search') search.current?.focus();
    else
      root.current
        ?.querySelector<HTMLElement>('[aria-current="location"]')
        ?.scrollIntoView({ block: 'nearest' });
  }, [tab]);
  useEffect(() => {
    if (tab === 'search')
      root.current?.querySelector('.navigation-results')?.scrollTo({ top: 0 });
  }, [query, tab]);
  const selectTab = (value: (typeof tabs)[number]) => {
    onQuery('');
    onTab(value);
  };
  const storyButton = (entry: ReadableIssue['contents'][number]) => (
    <button
      className="story-destination"
      key={entry.printedPage}
      aria-current={
        issue.contents.indexOf(entry) === current ? 'location' : undefined
      }
      onClick={() => onStory(physicalPage(entry.printedPage, issue))}
    >
      <span>
        <strong>{entry.title}</strong>
        {entry.author && <small>{entry.author}</small>}
      </span>
      <span className="story-folio">{entry.printedPage}</span>
    </button>
  );
  return (
    <>
      <button
        className="navigation-scrim"
        aria-label="Close contents"
        onClick={onClose}
      />
      <aside
        className="reader-navigation"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contents-heading"
        ref={root}
      >
        <header>
          <img
            className="contents-cover"
            src={`reader-assets/${issue.id}/1.jpg`}
            alt=""
          />
          <div>
            <p>{issue.issue}</p>
            <h2 id="contents-heading">Contents</h2>
          </div>
          <button onClick={onClose} aria-label="Close contents">
            <X size={20} />
          </button>
        </header>
        <label className="navigation-search">
          <Search size={17} />
          <input
            ref={search}
            type="search"
            aria-label="Search this issue"
            placeholder="Search this issue"
            value={query}
            onChange={(e) => {
              onQuery(e.target.value);
              onTab(e.target.value ? 'search' : 'contents');
            }}
          />
          {query && (
            <button
              aria-label="Clear search"
              onClick={() => {
                onQuery('');
                onTab('contents');
                search.current?.focus();
              }}
            >
              <X size={16} />
            </button>
          )}
        </label>
        <div
          className="navigation-tabs"
          role="tablist"
          aria-label="Browse this issue"
        >
          {tabs.map((value, i) => (
            <button
              key={value}
              role="tab"
              id={`nav-${value}`}
              aria-selected={tab === value}
              aria-controls="navigation-results"
              tabIndex={tab === value || (tab === 'search' && i === 0) ? 0 : -1}
              onClick={() => selectTab(value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  e.preventDefault();
                  const nextTab =
                    tabs[(i + (e.key === 'ArrowRight' ? 1 : 2)) % 3];
                  selectTab(nextTab);
                  requestAnimationFrame(() =>
                    document.getElementById(`nav-${nextTab}`)?.focus(),
                  );
                }
              }}
            >
              {value === 'contents'
                ? 'Stories'
                : value === 'pages'
                  ? 'Pages'
                  : 'Saved'}
            </button>
          ))}
        </div>
        <div
          className="navigation-results"
          id="navigation-results"
          role={tab === 'search' ? 'region' : 'tabpanel'}
          aria-label={tab === 'search' ? 'Search results' : undefined}
          aria-labelledby={tab === 'search' ? undefined : `nav-${tab}`}
        >
          {tab === 'contents' && (
            <>
              <div className="contents-utility">
                <button onClick={() => onNavigate(1)}>Cover</button>
                <button onClick={() => onNavigate(issue.contentsPage)}>
                  Printed contents <ArrowRight size={14} />
                </button>
              </div>
              {issue.contents.map((entry, i) => (
                <div className="contents-item" key={entry.printedPage}>
                  {(i === 0 ||
                    entry.section !== issue.contents[i - 1].section) && (
                    <h3>{entry.section}</h3>
                  )}
                  {storyButton(entry)}
                </div>
              ))}
            </>
          )}
          {tab === 'pages' && (
            <div className="navigation-pages">
              {Array.from({ length: issue.pageCount }, (_, i) => i + 1).map(
                (n) => (
                  <button
                    key={n}
                    aria-label={`Read ${label(n)}`}
                    aria-current={n === page ? 'location' : undefined}
                    onClick={() => onNavigate(n)}
                  >
                    <img
                      src={`reader-assets/${issue.id}/${n}.jpg`}
                      alt=""
                      loading="lazy"
                    />
                    <span>{label(n)}</span>
                    {marks.includes(n) && <Bookmark size={12} />}
                  </button>
                ),
              )}
            </div>
          )}
          {tab === 'search' && (
            <>
              {matching.length > 0 && (
                <div className="contents-item">
                  <h3>Stories</h3>
                  {matching.map(storyButton)}
                </div>
              )}
              <p className="navigation-empty" role="status">
                {query.trim().length < 2
                  ? 'Type at least two letters to search every page.'
                  : !index.length
                    ? indexError
                      ? 'Page search is unavailable. Browse Stories or Pages.'
                      : 'Searching…'
                    : `${results.length} matching pages`}
              </p>
              {results.map((result) => (
                <button
                  className="search-destination"
                  key={result.page}
                  onClick={() => onNavigate(result.page)}
                >
                  <small>
                    {label(result.page)}
                    {label(result.page) !== locationTitle(issue, result.page) &&
                      ` · ${locationTitle(issue, result.page)}`}
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
                  Save a page while reading to find it here.
                </p>
              )}
              {marks.map((n) => (
                <div className="saved-destination" key={n}>
                  <button onClick={() => onNavigate(n)}>
                    <img src={`reader-assets/${issue.id}/${n}.jpg`} alt="" />
                    <span>
                      {locationTitle(issue, n)}
                      <small>Page {label(n)}</small>
                    </span>
                  </button>
                  <button
                    onClick={() => onRemoveMark(n)}
                    aria-label={`Remove bookmark at ${label(n)}`}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
        <footer className="contents-story-nav">
          <button
            aria-label="Previous story"
            disabled={!previous}
            title={previous?.title}
            onClick={() =>
              previous && onStory(physicalPage(previous.printedPage, issue))
            }
          >
            <ArrowLeft size={15} />
            <span>Previous story</span>
          </button>
          <button
            aria-label="Next story"
            disabled={!next}
            title={next?.title}
            onClick={() =>
              next && onStory(physicalPage(next.printedPage, issue))
            }
          >
            <span>Next story</span>
            <ArrowRight size={15} />
          </button>
        </footer>
      </aside>
    </>
  );
}
