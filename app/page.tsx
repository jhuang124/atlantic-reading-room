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
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  Maximize2,
  Minimize2,
  Search,
  Sun,
  Moon,
  X,
} from 'lucide-react';
import { flushSync } from 'react-dom';
import data from './issues.json';
import availableIssues from '../public/reader-assets/available.json';
import { readerIssues } from './reader/catalog';
import { loadPlace, type ReadingPlace } from './reader/place';
import { pageLabel } from './reader/model';
import { locationTitle, physicalPage } from './reader/story-model';
import { parseRoute, routeHash, type Route } from './routes';
import About from './About';
const loadReader = () => import('./reader/Reader');
const Reader = lazy(loadReader);
function transition(update: () => void) {
  // A hidden page has no rendering opportunities, so startViewTransition
  // would hold the update until the tab is fronted; apply it directly.
  if (
    document.startViewTransition &&
    !document.hidden &&
    !matchMedia('(prefers-reduced-motion:reduce)').matches
  ) {
    const t = document.startViewTransition(() => flushSync(update));
    void t.finished.catch(() => {});
  } else update();
}
type Issue = (typeof data)[number];
const issues: Issue[] = data;
const available = availableIssues.filter((id) =>
  readerIssues.some((issue) => issue.id === id),
);
const years = [...new Set(issues.map((issue) => issue.year))].sort(
  (a, b) => b - a,
);
const storySearch = new Map(
  readerIssues.map((issue) => [
    issue.id,
    issue.contents
      .map((story) => `${story.title} ${story.author || ''}`)
      .join(' '),
  ]),
);
const title = (issue: Issue) =>
  (
    issue.coverStories[0]?.title ||
    issue.issueTheme ||
    `The ${issue.issue} issue`
  ).replace(/<[^>]*>/g, '');
// The shelf opens on the newest readable issue; `available` is newest first.
const heroId = available[0];
const heroIssue = issues.find((i) => i.id === heroId);
const heroEntry = readerIssues.find((i) => i.id === heroId);
// The hero's "In this issue" list: the features after the cover story.
const heroFeatures = (() => {
  if (!heroEntry || !heroIssue) return [];
  const cover = title(heroIssue).toLowerCase();
  const rest = heroEntry.contents.filter(
    (e) => e.section !== 'Cover story' && e.title.toLowerCase() !== cover,
  );
  const features = rest.filter((e) => e.section === 'Features');
  return (features.length >= 3 ? features : rest).slice(0, 4);
})();
export default function Home() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useLayoutEffect(() => {
    try {
      if (localStorage.getItem('atlantic:theme') === 'dark') setTheme('dark');
    } catch {}
  }, []);
  const chooseTheme = (next: 'light' | 'dark') => {
    setTheme(next);
    try {
      localStorage.setItem('atlantic:theme', next);
    } catch {}
  };
  const themeButton = (className: string) => (
    <button
      className={className}
      onClick={() => chooseTheme(theme === 'light' ? 'dark' : 'light')}
      aria-label={
        theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'
      }
      title={theme === 'light' ? 'Dark mode' : 'Light mode'}
    >
      {theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
    </button>
  );
  // The year rail jumps through the shelf and follows the year in view.
  const [yearInView, setYearInView] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [readableOnly, setReadableOnly] = useState(false);
  const [sort, setSort] = useState('newest');
  const [selected, setSelected] = useState<string | null>(null);
  const [transitionCover, setTransitionCover] = useState<string | null>(null);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [about, setAbout] = useState(false);
  const [places, setPlaces] = useState<Record<string, ReadingPlace>>({});
  const [readerEntry, setReaderEntry] = useState<{
    contents: boolean;
    page?: number;
  }>({ contents: false });
  const [opening, setOpening] = useState(false);
  const [full, setFull] = useState(false);
  const library = useRef<HTMLDivElement>(null);
  // Which cover the splash transition grows from and returns to.
  const heroTransition = useRef(false);
  const previousFocus = useRef<HTMLElement | null>(null);
  const modalClose = useRef<HTMLButtonElement>(null);
  const issue = issues.find((i) => i.id === selected);
  const readingIssue = readerIssues.find((i) => i.id === readingId);
  // Focus rings follow the input method: programmatic focus after a click or
  // on entry draws nothing; keyboard travel draws the ring.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.input = 'pointer';
    const pointer = () => {
      root.dataset.input = 'pointer';
    };
    const key = (event: KeyboardEvent) => {
      if (
        event.key === 'Tab' ||
        event.key === 'Enter' ||
        event.key === ' ' ||
        event.key.startsWith('Arrow')
      )
        root.dataset.input = 'keyboard';
    };
    window.addEventListener('pointerdown', pointer, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', pointer, true);
      window.removeEventListener('keydown', key, true);
    };
  }, []);
  useEffect(() => {
    const native = (
      window as Window & {
        ReactNativeWebView?: { postMessage: (message: string) => void };
      }
    ).ReactNativeWebView;
    document.documentElement.dataset.nativeReader = native ? 'true' : 'false';
    native?.postMessage(
      JSON.stringify({
        type: 'reader-state',
        theme,
        canGoBack: !!(selected || readingId || about),
      }),
    );
  }, [theme, selected, readingId, about]);
  useEffect(() => {
    const surface = document.querySelector('.archive-app');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (surface && meta)
      meta.setAttribute(
        'content',
        getComputedStyle(surface)
          .getPropertyValue(readingId ? '--edition-desk' : '--edition-surface')
          .trim(),
      );
  }, [theme, readingId]);
  // One owner controls background interactivity for both details and the reader.
  useLayoutEffect(() => {
    if (library.current)
      library.current.inert = !!(selected || readingId || about);
  }, [selected, readingId, about]);
  useEffect(() => {
    const next: Record<string, ReadingPlace> = {};
    readerIssues.forEach((i) => {
      const p = loadPlace(i.id, i.pageCount);
      if (p) next[i.id] = p;
    });
    setPlaces(next);
  }, [readingId]);
  useEffect(() => {
    const base = 'The Print Edition — The Atlantic';
    const current = readingIssue?.issue || issue?.issue;
    document.title = current
      ? `${current} · ${base}`
      : about
        ? `About · ${base}`
        : base;
  }, [issue, readingIssue, about]);
  const lastRead = useMemo(() => {
    let best: { id: string; place: ReadingPlace } | null = null;
    for (const [id, place] of Object.entries(places))
      if (
        available.includes(id) &&
        place.page > 1 &&
        (!best || place.updated > best.place.updated)
      )
        best = { id, place };
    return best;
  }, [places]);
  const lastReadIssue = lastRead
    ? issues.find((i) => i.id === lastRead.id)
    : undefined;
  const lastReadCount = lastRead
    ? readerIssues.find((i) => i.id === lastRead.id)?.pageCount
    : undefined;
  // The hash mirrors the open surface so places are shareable and the
  // browser's Back button retraces archive → splash → reader. `room` counts
  // the history entries this app pushed above the archive.
  const routeDepth = () =>
    typeof history.state?.room === 'number' ? history.state.room : 0;
  const setHash = (route: Route, push: boolean) => {
    const url = routeHash(route);
    if (push) history.pushState({ room: routeDepth() + 1 }, '', url);
    else history.replaceState(history.state ?? { room: 0 }, '', url);
  };
  // The first route of a page load applies directly: there is nothing on
  // screen to transition from, and a view transition would hold the update
  // until the browser next paints.
  const applyRoute = useCallback((route: Route, animate = true) => {
    const apply = animate ? transition : (update: () => void) => update();
    if (route.surface === 'reader' && available.includes(route.id)) {
      setReaderEntry({ contents: false, page: route.page });
      void loadReader();
      apply(() => {
        setSelected(null);
        setOpening(false);
        setAbout(false);
        setReadingId(route.id);
      });
    } else if (
      route.surface === 'issue' &&
      issues.some((item) => item.id === route.id)
    ) {
      void loadReader();
      apply(() => {
        setReadingId(null);
        setOpening(false);
        setAbout(false);
        setSelected(route.id);
      });
    } else if (route.surface === 'about') {
      apply(() => {
        setSelected(null);
        setOpening(false);
        setReadingId(null);
        setAbout(true);
      });
    } else {
      apply(() => {
        setSelected(null);
        setOpening(false);
        setReadingId(null);
        setAbout(false);
      });
      requestAnimationFrame(() =>
        previousFocus.current?.focus({ preventScroll: true }),
      );
    }
  }, []);
  useEffect(() => {
    const route = parseRoute(location.hash);
    history.replaceState({ room: routeDepth() }, '', routeHash(route));
    if (route.surface !== 'archive') applyRoute(route, false);
    const onPop = () => applyRoute(parseRoute(location.hash));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [applyRoute]);
  const openIssue = (id: string, fromHero = false) => {
    previousFocus.current = document.activeElement as HTMLElement;
    heroTransition.current = fromHero;
    flushSync(() => setTransitionCover(id));
    transition(() => setSelected(id));
    setHash({ surface: 'issue', id }, true);
    void loadReader();
  };
  // Browsing covers from the splash replaces the entry, so Back still returns
  // to the archive instead of retracing every viewed cover.
  const showIssue = (id: string) => {
    transition(() => setSelected(id));
    setHash({ surface: 'issue', id }, false);
  };
  const startReading = (id: string, contents = false, page?: number) => {
    if (!available.includes(id) || opening) return;
    if (!selected)
      previousFocus.current = document.activeElement as HTMLElement;
    setReaderEntry({ contents, page });
    setOpening(!!selected);
    setReadingId(id);
    setHash({ surface: 'reader', id, page }, true);
  };
  const readerPage = useCallback(
    (page: number) => {
      if (!readingId) return;
      history.replaceState(
        history.state,
        '',
        routeHash({ surface: 'reader', id: readingId, page }),
      );
    },
    [readingId],
  );
  const readerReady = useCallback(() => {
    transition(() => {
      setSelected(null);
      setOpening(false);
    });
  }, []);
  // V4: the reader's End-of-issue card offers the next older issue on the
  // shelf. Opening it swaps the issue in place at page 1 and replaces the
  // hash, so Back still returns to the shelf rather than the finished issue.
  const nextIssue = useMemo(() => {
    if (!readingId) return undefined;
    const nextId = available[available.indexOf(readingId) + 1];
    const next = nextId ? issues.find((i) => i.id === nextId) : undefined;
    return next
      ? { id: next.id, issue: next.issue, cover: next.cover }
      : undefined;
  }, [readingId]);
  const onOpenIssue = useCallback((id: string) => {
    if (!available.includes(id)) return;
    setReaderEntry({ contents: false, page: 1 });
    setReadingId(id);
    history.replaceState(
      history.state,
      '',
      routeHash({ surface: 'reader', id }),
    );
  }, []);
  const openAbout = () => {
    previousFocus.current = document.activeElement as HTMLElement;
    transition(() => setAbout(true));
    setHash({ surface: 'about' }, true);
  };
  const closeOverlay = useCallback(() => {
    if (selected) flushSync(() => setTransitionCover(selected));
    const depth = routeDepth();
    if (depth > 0) history.go(-depth);
    else {
      history.replaceState({ room: 0 }, '', routeHash({ surface: 'archive' }));
      applyRoute({ surface: 'archive' });
    }
  }, [selected, applyRoute]);
  const returnToLibrary = closeOverlay;
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
        if (next) showIssue(next.id);
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
    if (!selected && !readingId && !about) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [selected, readingId, about]);
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
            (!readableOnly || available.includes(i.id)) &&
            `${i.issue} ${title(i)} ${i.coverStories.flatMap((s) => s.authors).join(' ')} ${storySearch.get(i.id) || ''}`
              .toLowerCase()
              .includes(query.trim().toLowerCase()),
        )
        .sort((a, b) =>
          sort === 'oldest'
            ? a.id.localeCompare(b.id)
            : b.id.localeCompare(a.id),
        ),
    [readableOnly, available, query, sort],
  );
  const shelves = useMemo(() => {
    const groups: { year: number; issues: Issue[] }[] = [];
    for (const i of filtered) {
      const last = groups.at(-1);
      if (last?.year === i.year) last.issues.push(i);
      else groups.push({ year: i.year, issues: [i] });
    }
    return groups;
  }, [filtered]);
  const browseBar = useRef<HTMLDivElement>(null);
  const jumpToYear = (y: number | null) => {
    const shell = library.current;
    if (!shell) return;
    const target =
      y === null
        ? shell.querySelector<HTMLElement>('.archive-browser')
        : shell.querySelector<HTMLElement>(`#shelf-${y}`);
    if (!target) return;
    const offset = y === null ? 0 : (browseBar.current?.offsetHeight ?? 0);
    shell.scrollTo({
      top:
        target.getBoundingClientRect().top -
        shell.getBoundingClientRect().top +
        shell.scrollTop -
        offset -
        (y === null ? 0 : 8),
      behavior: matchMedia('(prefers-reduced-motion:reduce)').matches
        ? 'auto'
        : 'smooth',
    });
  };
  useEffect(() => {
    const shell = library.current;
    if (!shell) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      // A year is "in view" once its heading reaches the upper third.
      const line =
        (browseBar.current?.getBoundingClientRect().bottom ?? 0) +
        shell.clientHeight / 3;
      let current: number | null = null;
      for (const section of shell.querySelectorAll<HTMLElement>(
        '.shelf-year',
      ))
        if (section.getBoundingClientRect().top <= line)
          current = Number(section.dataset.year);
      setYearInView(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    shell.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      shell.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [shelves]);
  const reset = () => {
    setQuery('');
    setReadableOnly(false);
  };
  const placeText = (id: string) => {
    const entry = readerIssues.find((i) => i.id === id),
      place = places[id];
    if (!entry || !place) return '';
    const label = pageLabel(
      place.page,
      entry.pageCount,
      entry.printOffset,
      entry.backMatterPages,
    );
    return /^\d+$/.test(label) ? `Page ${label}` : label;
  };
  // The story a saved place sits in, or nothing when the place is the cover.
  const placeStory = (id: string) => {
    const entry = readerIssues.find((i) => i.id === id),
      place = places[id];
    return entry && place && place.page > 1
      ? locationTitle(entry, place.page)
      : undefined;
  };
  const heroStory = heroId ? placeStory(heroId) : undefined;
  const masthead = (
    <header className="archive-masthead">
          <span className="archive-masthead-title">The Print Edition</span>
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
            {themeButton('archive-icon theme-toggle')}
            <button
              className="archive-icon archive-fullscreen"
              onClick={toggleFullscreen}
              aria-label={full ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {full ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          </div>
        </header>
  );
  return (
    <main className="archive-app" data-theme={theme}>
      <div className="library-shell" ref={library}>
        {masthead}
        <div className="archive-content">
          <h1 className="archive-visually-hidden">Magazine archive</h1>
          {heroIssue && heroEntry && (
            <section
              className="archive-hero"
              aria-labelledby="archive-hero-title"
            >
              <div className="archive-hero-inner">
                <button
                  className="archive-hero-cover"
                  aria-label={`View ${heroIssue.issue}`}
                  onClick={() => openIssue(heroIssue.id, true)}
                >
                  <img
                    style={{
                      viewTransitionName:
                        heroTransition.current &&
                        selected !== heroIssue.id &&
                        transitionCover === heroIssue.id
                          ? `cover-${heroIssue.id}`
                          : 'none',
                    }}
                    src={heroIssue.cover}
                    alt={`The Atlantic, ${heroIssue.issue}`}
                    width="300"
                    height="400"
                  />
                </button>
                <div className="archive-hero-copy">
                  <p className="archive-hero-kicker">
                    Current issue <span>{heroIssue.issue}</span>
                  </p>
                  <h2 id="archive-hero-title">{title(heroIssue)}</h2>
                  {heroIssue.coverStories[0]?.authors.length > 0 && (
                    <p className="archive-hero-byline">
                      By {heroIssue.coverStories[0].authors.join(' and ')}
                    </p>
                  )}
                  {heroIssue.coverStories[0]?.dek && (
                    <p className="archive-hero-dek">
                      {heroIssue.coverStories[0].dek.replace(/<[^>]*>/g, '')}
                    </p>
                  )}
                  <div className="archive-hero-actions">
                    <button
                      className="archive-hero-primary"
                      onClick={() => startReading(heroIssue.id)}
                    >
                      <span>
                        {heroStory
                          ? `Continue · ${heroStory}`
                          : 'Read the issue'}
                      </span>
                      <ArrowRight size={16} />
                    </button>
                    <button
                      className="archive-hero-secondary"
                      onClick={() => startReading(heroIssue.id, true)}
                    >
                      Contents
                    </button>
                    <a
                      className="archive-hero-secondary"
                      href={heroIssue.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      On TheAtlantic.com <ArrowUpRight size={14} />
                    </a>
                  </div>
                </div>
                {heroFeatures.length > 0 && (
                  <nav className="archive-hero-inside" aria-label="In this issue">
                    <p>In this issue</p>
                    <ol>
                      {heroFeatures.map((entry) => (
                        <li key={entry.printedPage}>
                          <button
                            onClick={() =>
                              startReading(
                                heroEntry.id,
                                false,
                                physicalPage(entry.printedPage, heroEntry),
                              )
                            }
                          >
                            <strong>{entry.title}</strong>
                            {entry.author && <span>{entry.author}</span>}
                          </button>
                        </li>
                      ))}
                    </ol>
                  </nav>
                )}
              </div>
            </section>
          )}
          <section
            className="archive-browser"
            aria-label="Atlantic cover index"
          >
            <div className="archive-filter-bar" ref={browseBar}>
              <div className="archive-filter-inner">
                <label className="archive-search">
                  <Search size={16} />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search issues, stories, authors"
                    aria-label="Search issues, stories, and authors"
                  />
                  {query && (
                    <button
                      aria-label="Clear search"
                      onClick={() => setQuery('')}
                    >
                      <X size={15} />
                    </button>
                  )}
                </label>
                <nav className="archive-year-rail" aria-label="Jump to year">
                  {shelves.map(({ year: y }) => (
                    <button
                      key={y}
                      aria-current={yearInView === y ? 'true' : undefined}
                      onClick={() => jumpToYear(y)}
                    >
                      {y}
                    </button>
                  ))}
                </nav>
                <div className="archive-compact-filters">
                  <button
                    className="archive-sort"
                    aria-label={
                      sort === 'newest'
                        ? 'Sorted newest first. Sort oldest first'
                        : 'Sorted oldest first. Sort newest first'
                    }
                    onClick={() =>
                      setSort(sort === 'newest' ? 'oldest' : 'newest')
                    }
                  >
                    <ArrowDownUp size={14} />
                    {sort === 'newest' ? 'Newest' : 'Oldest'}
                  </button>
                  {available.length > 0 && available.length < issues.length && (
                    <label className="archive-available-filter">
                      <input
                        type="checkbox"
                        checked={readableOnly}
                        onChange={(e) => setReadableOnly(e.target.checked)}
                      />
                      Readable
                    </label>
                  )}
                </div>
              </div>
              <output className="archive-visually-hidden" aria-live="polite">
                {filtered.length} issues
              </output>
            </div>
            {lastRead && lastReadIssue && !query && lastRead.id !== heroId && (
              <button
                className="archive-continue"
                onClick={() => startReading(lastRead.id)}
              >
                <img
                  src={lastReadIssue.cover}
                  alt=""
                  width="34"
                  height="45"
                  loading="lazy"
                />
                <span className="archive-continue-copy">
                  <small>Continue reading</small>
                  <strong>
                    {(() => {
                      const entry = readerIssues.find(
                        (r) => r.id === lastRead.id,
                      );
                      return entry
                        ? locationTitle(entry, lastRead.place.page)
                        : lastReadIssue.issue;
                    })()}
                  </strong>
                  <span className="archive-continue-where">
                    {lastReadIssue.issue} · {placeText(lastRead.id)}
                  </span>
                  {lastReadCount && (
                    <span className="archive-continue-bar" aria-hidden="true">
                      <span
                        style={{
                          width: `${Math.min(100, Math.round((lastRead.place.page / lastReadCount) * 100))}%`,
                        }}
                      />
                    </span>
                  )}
                </span>
                <ArrowRight size={16} />
              </button>
            )}
            {shelves.map(({ year: y, issues: group }) => (
              <section
                className="shelf-year"
                id={`shelf-${y}`}
                data-year={y}
                key={y}
                aria-labelledby={`shelf-${y}-title`}
              >
                <header className="shelf-year-head">
                  <h2 id={`shelf-${y}-title`}>{y}</h2>
                  <span>
                    {group.length} {group.length === 1 ? 'issue' : 'issues'}
                  </span>
                </header>
                <div className="archive-grid">
                  {group.map((i) => {
                    const canRead = available.includes(i.id),
                      saved = places[i.id],
                      entry = readerIssues.find((r) => r.id === i.id),
                      story = canRead ? placeStory(i.id) : undefined,
                      eager = filtered.indexOf(i) < 6;
                    return (
                      <article
                        className={`archive-card${canRead ? '' : ' is-cover-only'}`}
                        key={i.id}
                      >
                        <button
                          className="archive-cover-button"
                          aria-label={`View ${i.issue}`}
                          onClick={() => openIssue(i.id)}
                        >
                          <img
                            style={{
                              viewTransitionName:
                                selected !== i.id &&
                                transitionCover === i.id &&
                                !(heroTransition.current && i.id === heroId)
                                  ? `cover-${i.id}`
                                  : 'none',
                            }}
                            className="archive-cover-image"
                            src={i.cover}
                            alt={`The Atlantic, ${i.issue}`}
                            loading={eager ? 'eager' : 'lazy'}
                            decoding="async"
                            onLoad={(e) =>
                              e.currentTarget.classList.add('is-loaded')
                            }
                            ref={(img) => {
                              if (img?.complete) img.classList.add('is-loaded');
                            }}
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
                          <h3>
                            <button onClick={() => openIssue(i.id)}>
                              {i.issue.replace(/\s\d{4}$/, '')}
                            </button>
                          </h3>
                          {story ? (
                            <button
                              className="archive-read-link"
                              onClick={() => startReading(i.id)}
                            >
                              <span>Continue · {story}</span>
                              <ArrowRight size={13} />
                            </button>
                          ) : (
                            !canRead && (
                              <span className="archive-cover-only">
                                Cover only
                              </span>
                            )
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
            {!filtered.length && (
              <div className="archive-empty">
                <h2>No issues found.</h2>
                <p>Try another title, author, or month.</p>
                <button className="archive-primary" onClick={reset}>
                  See all issues <ArrowRight size={16} />
                </button>
              </div>
            )}
          </section>
          <footer className="archive-footer">
            <nav className="archive-footer-links" aria-label="About">
              <button onClick={openAbout}>About this edition</button>
              <a
                href="https://www.theatlantic.com/magazine/backissues/"
                target="_blank"
                rel="noreferrer"
              >
                Explore the complete archive <ArrowUpRight size={14} />
              </a>
            </nav>
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
            theme={theme}
            onTheme={chooseTheme}
            onClose={returnToLibrary}
            initialPanel={readerEntry.contents}
            initialPage={readerEntry.page}
            arriving={opening}
            onReady={readerReady}
            onPage={readerPage}
            nextIssue={nextIssue}
            onOpenIssue={onOpenIssue}
          />
        </Suspense>
      )}
      {about && (
        <div className="about-shell">
          {masthead}
          <About onBack={closeOverlay} />
        </div>
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
              <ArrowLeft size={18} />{' '}
              <span className="splash-back-label">Archive</span> <kbd>Esc</kbd>
            </button>
            {themeButton('splash-theme-toggle')}
            <img
              className="splash-wordmark"
              src="brand/atlantic-logo.svg"
              alt="The Atlantic"
            />
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
                  {issue.coverStories[0].dek.replace(/<[^>]*>/g, '')}
                </p>
              )}
              {available.includes(issue.id) ? (
                <div className="issue-reading-actions">
                  <button
                    className="archive-primary"
                    disabled={opening}
                    onClick={() => startReading(issue.id)}
                  >
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
                On TheAtlantic.com <ArrowUpRight size={16} />
              </a>
              <nav
                className="issue-splash-navigation"
                aria-label="Browse issues"
              >
                <button
                  aria-label="Previous issue"
                  disabled={opening || issues[0].id === issue.id}
                  onClick={() => showIssue(issues[issues.indexOf(issue) - 1].id)}
                >
                  <ArrowLeft size={18} />
                </button>
                <span>
                  {issues.indexOf(issue) + 1} / {issues.length}
                </span>
                <button
                  aria-label="Next issue"
                  disabled={opening || issues.at(-1)?.id === issue.id}
                  onClick={() => showIssue(issues[issues.indexOf(issue) + 1].id)}
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
