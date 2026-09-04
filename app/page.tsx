'use client';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Maximize2,
  Minimize2,
  Search,
  X,
} from 'lucide-react';
import { flushSync } from 'react-dom';
import data from './issues.json';
import { readerIssues } from './reader/catalog';
import { loadPlace, type ReadingPlace } from './reader/place';
import { pageLabel } from './reader/model';
const loadReader = () => import('./reader/Reader');
const Reader = lazy(loadReader);
function transition(update: () => void) {
  if (
    document.startViewTransition &&
    !matchMedia('(prefers-reduced-motion:reduce)').matches
  ) {
    const t = document.startViewTransition(() => flushSync(update));
    void t.finished.catch(() => {});
  } else update();
}
type Issue = (typeof data)[number];
const issues: Issue[] = data;
const years = [2026, 2025, 2024, 2023, 2022, 2021];
const title = (issue: Issue) =>
  (
    issue.coverStories[0]?.title ||
    issue.issueTheme ||
    `The ${issue.issue} issue`
  ).replace(/<[^>]*>/g, '');
export default function Home() {
  const [year, setYear] = useState('all');
  const [query, setQuery] = useState('');
  const [readableOnly, setReadableOnly] = useState(false);
  const [sort, setSort] = useState('newest');
  const [selected, setSelected] = useState<string | null>(null);
  const [transitionCover, setTransitionCover] = useState<string | null>(null);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [available, setAvailable] = useState<string[]>([]);
  const [places, setPlaces] = useState<Record<string, ReadingPlace>>({});
  const [readerEntry, setReaderEntry] = useState<{
    contents: boolean;
    page?: number;
  }>({ contents: false });
  const [opening, setOpening] = useState(false);
  const [full, setFull] = useState(false);
  const library = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const modalClose = useRef<HTMLButtonElement>(null);
  const issue = issues.find((i) => i.id === selected);
  const readingIssue = readerIssues.find((i) => i.id === readingId);
  // One owner controls background interactivity for both details and the reader.
  useLayoutEffect(() => {
    if (library.current) library.current.inert = !!(selected || readingId);
  }, [selected, readingId]);
  useEffect(() => {
    const abort = new AbortController();
    fetch('reader-assets/available.json', { signal: abort.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((ids) =>
        setAvailable(
          Array.isArray(ids)
            ? ids.filter((id) => readerIssues.some((i) => i.id === id))
            : [],
        ),
      )
      .catch(() => {});
    return () => abort.abort();
  }, []);
  useEffect(() => {
    const next: Record<string, ReadingPlace> = {};
    readerIssues.forEach((i) => {
      const p = loadPlace(i.id, i.pageCount);
      if (p) next[i.id] = p;
    });
    setPlaces(next);
  }, [readingId]);
  const openIssue = (id: string) => {
    previousFocus.current = document.activeElement as HTMLElement;
    flushSync(() => setTransitionCover(id));
    transition(() => setSelected(id));
    void loadReader();
  };
  const startReading = (id: string, contents = false) => {
    if (!available.includes(id) || opening) return;
    if (!selected)
      previousFocus.current = document.activeElement as HTMLElement;
    setReaderEntry({ contents });
    setOpening(!!selected);
    setReadingId(id);
  };
  const readerReady = useCallback(() => {
    transition(() => {
      setSelected(null);
      setOpening(false);
    });
  }, []);
  const closeOverlay = useCallback(() => {
    if (selected) flushSync(() => setTransitionCover(selected));
    transition(() => {
      setSelected(null);
      setOpening(false);
      setReadingId(null);
    });
    requestAnimationFrame(() =>
      previousFocus.current?.focus({ preventScroll: true }),
    );
  }, [selected]);
  const returnToLibrary = useCallback(() => {
    transition(() => {
      setReadingId(null);
      setSelected(null);
      setOpening(false);
    });
    requestAnimationFrame(() =>
      previousFocus.current?.focus({ preventScroll: true }),
    );
  }, []);
  useEffect(() => {
    if (issue) modalClose.current?.focus({ preventScroll: true });
    const handler = (event: KeyboardEvent) => {
      if (!issue) return;
      if (opening) {
        if (event.key === 'Escape') closeOverlay();
        return;
      }
      if (event.key === 'Escape') closeOverlay();
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const index = issues.findIndex((item) => item.id === issue.id);
        const next = issues[index + (event.key === 'ArrowRight' ? 1 : -1)];
        if (next) transition(() => setSelected(next.id));
      }
      if (event.key === 'Tab') {
        const nodes = Array.from(
          document.querySelectorAll<HTMLElement>(
            '.library-modal button:not(:disabled), .library-modal a[href]',
          ),
        );
        const first = nodes[0],
          last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [issue, opening, closeOverlay]);
  useEffect(() => {
    if (!selected && !readingId) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [selected, readingId]);
  useEffect(() => {
    const update = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {}
  };
  const filtered = useMemo(
    () =>
      issues
        .filter(
          (i) =>
            (year === 'all' || i.year === Number(year)) &&
            (!readableOnly || available.includes(i.id)) &&
            `${i.issue} ${title(i)} ${i.coverStories.flatMap((s) => s.authors).join(' ')}`
              .toLowerCase()
              .includes(query.trim().toLowerCase()),
        )
        .sort((a, b) =>
          sort === 'oldest'
            ? a.id.localeCompare(b.id)
            : b.id.localeCompare(a.id),
        ),
    [year, readableOnly, available, query, sort],
  );
  const reset = () => {
    setQuery('');
    setYear('all');
    setReadableOnly(false);
  };
  const placeText = (id: string) => {
    const entry = readerIssues.find((i) => i.id === id),
      place = places[id];
    if (!entry || !place) return '';
    const label = pageLabel(place.page, entry.pageCount);
    return /^\d+$/.test(label) ? `Page ${label}` : label;
  };
  return (
    <main className="archive-app">
      <div className="library-shell" ref={library}>
        <header className="archive-masthead">
          <a
            className="atlantic-wordmark"
            href="https://www.theatlantic.com/"
            target="_blank"
            rel="noreferrer"
            aria-label="The Atlantic"
          >
            <img
              src="brand/atlantic-logo.svg"
              alt="The Atlantic"
              width="214"
              height="33"
            />
          </a>
          <div className="archive-masthead-tools">
            <button
              className="archive-icon"
              onClick={toggleFullscreen}
              aria-label={full ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {full ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          </div>
        </header>
        <div className="archive-content">
          <h1 className="archive-visually-hidden">Magazine archive</h1>
          <section
            className="archive-browser"
            aria-label="Atlantic cover index"
          >
            <div className="archive-filter-bar">
              <label className="archive-search">
                <Search size={17} />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search covers and authors"
                  aria-label="Search covers, issues, and authors"
                />
                {query && (
                  <button
                    aria-label="Clear search"
                    onClick={() => setQuery('')}
                  >
                    <X size={16} />
                  </button>
                )}
              </label>
              <div className="archive-compact-filters">
                <select
                  aria-label="Filter by year"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                >
                  <option value="all">All years</option>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Sort issues"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
                {available.length > 0 && (
                  <label className="archive-available-filter">
                    <input
                      type="checkbox"
                      checked={readableOnly}
                      onChange={(e) => setReadableOnly(e.target.checked)}
                    />
                    Available to read
                  </label>
                )}
              </div>
              <output className="archive-visually-hidden" aria-live="polite">
                {filtered.length} issues
              </output>
            </div>
            <div className="archive-grid">
              {filtered.map((i, index) => {
                const canRead = available.includes(i.id),
                  saved = places[i.id],
                  entry = readerIssues.find((r) => r.id === i.id);
                return (
                  <article className="archive-card" key={i.id}>
                    <button
                      className="archive-cover-button"
                      aria-label={`View ${i.issue}`}
                      onClick={() => openIssue(i.id)}
                    >
                      <img
                        style={{
                          viewTransitionName:
                            selected !== i.id && transitionCover === i.id
                              ? `cover-${i.id}`
                              : 'none',
                        }}
                        className="archive-cover-image"
                        src={i.cover}
                        alt={`The Atlantic, ${i.issue}`}
                        loading={index < 4 ? 'eager' : 'lazy'}
                        width="300"
                        height="400"
                      />
                      {saved && entry && canRead && (
                        <span
                          className="archive-reading-progress"
                          aria-hidden="true"
                        >
                          <span
                            style={{
                              width: `${(saved.page / entry.pageCount) * 100}%`,
                            }}
                          />
                        </span>
                      )}
                    </button>
                    <div className="archive-card-meta">
                      <h2>
                        <button onClick={() => openIssue(i.id)}>
                          {i.issue}
                        </button>
                      </h2>
                    </div>
                    {canRead ? (
                      <button
                        className="archive-read-link"
                        onClick={() => startReading(i.id)}
                      >
                        {saved ? `Continue · ${placeText(i.id)}` : 'Read issue'}
                        <ArrowRight size={14} />
                      </button>
                    ) : (
                      <span className="archive-cover-only">
                        Cover & details
                      </span>
                    )}
                  </article>
                );
              })}
            </div>
            {!filtered.length && (
              <div className="archive-empty">
                <h2>No issues found.</h2>
                <p>Try another word or widen the year filter.</p>
                <button className="archive-primary" onClick={reset}>
                  See all issues <ArrowRight size={16} />
                </button>
              </div>
            )}
          </section>
          <footer className="archive-footer">
            <a
              href="https://www.theatlantic.com/magazine/backissues/"
              target="_blank"
              rel="noreferrer"
            >
              Explore the complete archive <ArrowUpRight size={14} />
            </a>
            <small>
              Independent concept · Covers and editorial material © The Atlantic
            </small>
          </footer>
        </div>
      </div>
      {readingIssue && (
        <Suspense
          fallback={
            <div className="reader-loading-shell">
              <button onClick={returnToLibrary}>
                <ArrowLeft size={18} />
                Back to covers
              </button>
              <p>Opening {readingIssue.issue}…</p>
            </div>
          }
        >
          <Reader
            key={readingIssue.id}
            issue={readingIssue}
            onClose={returnToLibrary}
            initialPanel={readerEntry.contents}
            initialPage={readerEntry.page}
            arriving={opening}
            onReady={readerReady}
          />
        </Suspense>
      )}
      {issue && (
        <div
          className={`library-modal-backdrop issue-splash-backdrop ${opening ? 'issue-opening' : ''}`}
        >
          <section
            className="library-modal issue-splash"
            role="dialog"
            aria-modal="true"
            aria-labelledby="library-modal-title"
          >
            <button
              ref={modalClose}
              className="library-modal-close"
              onClick={closeOverlay}
              aria-label="Back to covers"
            >
              <ArrowLeft size={18} /> Back to covers <kbd>Esc</kbd>
            </button>
            <div className="issue-splash-art" key={`cover-${issue.id}`}>
              <img
                className="library-detail-cover"
                style={{ viewTransitionName: `cover-${issue.id}` }}
                src={issue.cover}
                alt={`The Atlantic, ${issue.issue}`}
              />
            </div>
            <div className="library-detail-copy" key={issue.id}>
              <p className="archive-kicker">{issue.issue}</p>
              <h2 id="library-modal-title">{title(issue)}</h2>
              {issue.coverStories[0]?.authors.length > 0 && (
                <p className="archive-byline">
                  By {issue.coverStories[0].authors.join(' and ')}
                </p>
              )}
              {issue.coverStories[0]?.dek && (
                <p className="library-detail-dek">
                  {issue.coverStories[0].dek}
                </p>
              )}
              {available.includes(issue.id) ? (
                <div className="issue-reading-actions">
                  <button
                    className="archive-primary"
                    disabled={opening}
                    onClick={() => startReading(issue.id)}
                  >
                    <BookOpen size={18} />
                    {opening
                      ? 'Opening…'
                      : places[issue.id]
                        ? 'Continue reading'
                        : 'Read issue'}
                    <ArrowRight size={17} />
                  </button>
                  <button
                    className="splash-contents"
                    disabled={opening}
                    onClick={() => startReading(issue.id, true)}
                  >
                    Contents
                  </button>
                </div>
              ) : (
                <p className="splash-availability">
                  Cover preview · Read this issue at The Atlantic
                </p>
              )}
              <a
                className="archive-external"
                href={issue.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                View issue at The Atlantic <ArrowUpRight size={16} />
              </a>
              <nav
                className="issue-splash-navigation"
                aria-label="Browse issues"
              >
                <button
                  aria-label="Previous issue"
                  disabled={opening || issues[0].id === issue.id}
                  onClick={() =>
                    transition(() =>
                      setSelected(issues[issues.indexOf(issue) - 1].id),
                    )
                  }
                >
                  <ArrowLeft size={18} />
                </button>
                <span>
                  {issues.indexOf(issue) + 1} / {issues.length}
                </span>
                <button
                  aria-label="Next issue"
                  disabled={opening || issues.at(-1)?.id === issue.id}
                  onClick={() =>
                    transition(() =>
                      setSelected(issues[issues.indexOf(issue) + 1].id),
                    )
                  }
                >
                  <ArrowRight size={18} />
                </button>
              </nav>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
