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
  Search,
  Sun,
  Moon,
  X,
} from 'lucide-react';
import { flushSync } from 'react-dom';
import data from './issues.json';
import availableIssues from '../public/reader-assets/available.json';
import { readerIssues, type ContentsEntry } from './reader/catalog';
import { loadPlace, type ReadingPlace } from './reader/place';
import { pageLabel } from './reader/model';
import {
  coverStoryEntry,
  locate,
  locationTitle,
  physicalPage,
} from './reader/story-model';
import { parseRoute, routeHash, type Lens, type Route } from './routes';
import { archive, type ArchiveStory } from './archive';
import { OpenerArt, Today, Writers } from './Front';
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
// The lead is the current issue's cover story, shown as the magazine opens
// it: the story's own first spread.
const leadStory = heroEntry ? coverStoryEntry(heroEntry) : undefined;
const leadEntry: ArchiveStory | undefined =
  heroEntry && leadStory
    ? archive.find(
        (entry) => entry.issue.id === heroEntry.id && entry.story === leadStory,
      )
    : undefined;
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
  // The archive's three lenses: the front page, writers, and the shelves.
  const [lens, setLens] = useState<Lens>('today');
  const lensRef = useRef<Lens>('today');
  lensRef.current = lens;
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
    // Every surface opens on the night stage (masthead, issue page, reader),
    // so the browser's own chrome matches it rather than the ivory below.
    if (surface && meta)
      meta.setAttribute(
        'content',
        getComputedStyle(surface).getPropertyValue('--night').trim(),
      );
  }, [theme]);
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
      const next = route.surface === 'archive' ? route.lens : undefined;
      apply(() => {
        setSelected(null);
        setOpening(false);
        setReadingId(null);
        setAbout(false);
        setLens(next ?? 'today');
      });
      requestAnimationFrame(() =>
        previousFocus.current?.focus({ preventScroll: true }),
      );
    }
  }, []);
  useEffect(() => {
    const route = parseRoute(location.hash);
    history.replaceState({ room: routeDepth() }, '', routeHash(route));
    // A lens in the fragment is part of the archive route and still applies.
    if (route.surface !== 'archive' || route.lens) applyRoute(route, false);
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
    // The page's scroller outlives the issue; a new issue starts at its cover.
    document.querySelector('.issue-splash-backdrop')?.scrollTo({ top: 0 });
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
      const home: Route = {
        surface: 'archive',
        ...(lensRef.current === 'today' ? {} : { lens: lensRef.current }),
      };
      history.replaceState({ room: 0 }, '', routeHash(home));
      applyRoute(home);
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
  // Search answers in stories first: a reader looking for a writer or a
  // headline wants that story, not a cover that happens to contain it. From
  // two letters on, matching stories are listed with a way straight in, and
  // the cover grid narrows to issues that match by name or cover story.
  const needle = query.trim().toLowerCase();
  const searching = needle.length >= 2;
  // Search answers over every lens; otherwise the shelves are the Issues lens.
  const showShelves = searching || lens === 'issues';
  const storyHits = useMemo(() => {
    if (!searching) return [];
    const hits = readerIssues.flatMap((entry) =>
      available.includes(entry.id)
        ? entry.contents
            .filter((story) =>
              `${story.title} ${story.author || ''}`
                .toLowerCase()
                .includes(needle),
            )
            .map((story) => ({ entry, story }))
        : [],
    );
    return hits.sort((a, b) =>
      sort === 'oldest'
        ? a.entry.id.localeCompare(b.entry.id)
        : b.entry.id.localeCompare(a.entry.id),
    );
  }, [searching, needle, sort]);
  /** Wrap the matched run of a result in <mark>. */
  const marked = (text: string) => {
    const at = searching ? text.toLowerCase().indexOf(needle) : -1;
    if (at < 0) return text;
    return (
      <>
        {text.slice(0, at)}
        <mark>{text.slice(at, at + needle.length)}</mark>
        {text.slice(at + needle.length)}
      </>
    );
  };
  const filtered = useMemo(
    () =>
      issues
        .filter(
          (i) =>
            (!readableOnly || available.includes(i.id)) &&
            `${i.issue} ${title(i)} ${i.coverStories.flatMap((s) => s.authors).join(' ')} ${searching ? '' : storySearch.get(i.id) || ''}`
              .toLowerCase()
              .includes(needle),
        )
        .sort((a, b) =>
          sort === 'oldest'
            ? a.id.localeCompare(b.id)
            : b.id.localeCompare(a.id),
        ),
    [readableOnly, available, needle, searching, sort],
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
  }, [shelves, showShelves]);
  // Keep the year in view visible in the rail when the rail itself scrolls.
  useEffect(() => {
    const rail = browseBar.current?.querySelector<HTMLElement>(
      '.archive-year-rail',
    );
    const current = rail?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!rail || !current || rail.scrollWidth <= rail.clientWidth) return;
    rail.scrollTo({
      left: current.offsetLeft - rail.offsetLeft - rail.clientWidth / 3,
      behavior: matchMedia('(prefers-reduced-motion:reduce)').matches
        ? 'auto'
        : 'smooth',
    });
  }, [yearInView]);
  // Results start under the browse bar. Each change to a search puts the
  // top of the results in view, whether the hero was still on screen or the
  // reader was deep in an earlier year.
  useEffect(() => {
    const shell = library.current,
      browser = shell?.querySelector<HTMLElement>('.archive-browser');
    if (!searching || !shell || !browser) return;
    shell.scrollTo({
      top:
        browser.getBoundingClientRect().top -
        shell.getBoundingClientRect().top +
        shell.scrollTop,
    });
  }, [searching, needle]);
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
  // The issue page is the issue's table of contents: stories by section,
  // each a way into the reader, with the saved place marked.
  const issueEntry = issue
    ? readerIssues.find((r) => r.id === issue.id)
    : undefined;
  const issueSections = useMemo(() => {
    const groups: { name: string; entries: ContentsEntry[] }[] = [];
    for (const entry of issueEntry?.contents ?? []) {
      const last = groups.at(-1);
      if (last?.name === entry.section) last.entries.push(entry);
      else groups.push({ name: entry.section, entries: [entry] });
    }
    return groups;
  }, [issueEntry]);
  const placeIndex =
    issueEntry && places[issueEntry.id] && places[issueEntry.id].page > 1
      ? locate(issueEntry, places[issueEntry.id].page).index
      : -1;
  const issuePosition = issue ? issues.indexOf(issue) : -1;
  const newerIssue = issuePosition > 0 ? issues[issuePosition - 1] : undefined;
  const olderIssue =
    issuePosition >= 0 ? issues[issuePosition + 1] : undefined;
  const readLead = () =>
    heroEntry &&
    startReading(heroEntry.id, false, leadEntry ? leadEntry.page : undefined);
  const openStory = (entry: ArchiveStory) =>
    startReading(entry.issue.id, false, entry.page);
  const chooseLens = (next: Lens) => {
    setQuery('');
    setLens(next);
    history.replaceState(
      history.state,
      '',
      routeHash({
        surface: 'archive',
        ...(next === 'today' ? {} : { lens: next }),
      }),
    );
    // A new lens starts at its top when the bar is already pinned.
    const shell = library.current,
      browser = shell?.querySelector<HTMLElement>('.archive-browser');
    if (!shell || !browser) return;
    const top =
      browser.getBoundingClientRect().top -
      shell.getBoundingClientRect().top +
      shell.scrollTop;
    if (shell.scrollTop > top) shell.scrollTo({ top });
  };
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
              className="archive-hero front-lead"
              aria-labelledby="archive-hero-title"
            >
              <div className="front-lead-inner">
                <button
                  className="front-lead-art"
                  aria-label={`Read ${title(heroIssue)}`}
                  onClick={readLead}
                >
                  {leadEntry && leadEntry.art.length > 0 ? (
                    <OpenerArt entry={leadEntry} eager />
                  ) : (
                    <img
                      className="front-lead-cover"
                      src={heroIssue.cover}
                      alt=""
                      width="300"
                      height="400"
                    />
                  )}
                </button>
                <div className="archive-hero-copy">
                  <p className="archive-hero-kicker">
                    Cover story <span>{heroIssue.issue}</span>
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
                      onClick={
                        heroStory ? () => startReading(heroIssue.id) : readLead
                      }
                    >
                      <span>
                        {heroStory ? `Continue · ${heroStory}` : 'Read the story'}
                      </span>
                      <ArrowRight size={16} />
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
                  <button
                    className="front-lead-issue"
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
                    <span>
                      <small>From the issue</small>
                      <strong>{heroIssue.issue}</strong>
                      <em>
                        {heroEntry.contents.length} stories{' '}
                        <ArrowRight size={13} />
                      </em>
                    </span>
                  </button>
                </div>
              </div>
            </section>
          )}
          <section
            className="archive-browser"
            aria-label="Atlantic cover index"
          >
            <div className="archive-filter-bar" ref={browseBar}>
              <div className="archive-filter-inner">
                <nav className="archive-lens" aria-label="Browse by">
                  {(
                    [
                      ['today', 'Today'],
                      ['writers', 'Writers'],
                      ['issues', 'Issues'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      aria-current={
                        !searching && lens === value ? 'page' : undefined
                      }
                      onClick={() => chooseLens(value)}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
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
                <nav
                  className="archive-year-rail"
                  aria-label="Jump to year"
                  hidden={!showShelves}
                >
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
                <div className="archive-compact-filters" hidden={!showShelves}>
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
                {searching
                  ? `${storyHits.length} stories, ${filtered.length} issues`
                  : `${filtered.length} issues`}
              </output>
            </div>
            {lastRead &&
              lastReadIssue &&
              !query &&
              lens !== 'writers' &&
              lastRead.id !== heroId && (
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
            {!searching && lens === 'today' && heroId && (
              <Today
                heroId={heroId}
                onOpen={openStory}
                onIssue={(id) => openIssue(id)}
                onWriter={setQuery}
                onWriters={() => chooseLens('writers')}
                recent={issues
                  .filter((i) => i.id !== heroId && available.includes(i.id))
                  .slice(0, 6)}
                issueCount={issues.length}
                onIssues={() => chooseLens('issues')}
              />
            )}
            {!searching && lens === 'writers' && <Writers onWriter={setQuery} />}
            {storyHits.length > 0 && (
              <section className="search-stories" aria-label="Matching stories">
                <header className="shelf-year-head">
                  <h2>Stories</h2>
                  <span>
                    {storyHits.length}{' '}
                    {storyHits.length === 1 ? 'story' : 'stories'}
                  </span>
                </header>
                <ol>
                  {storyHits.slice(0, 60).map(({ entry, story }) => (
                    <li key={`${entry.id}-${story.printedPage}`}>
                      <button
                        onClick={() =>
                          startReading(
                            entry.id,
                            false,
                            physicalPage(story.printedPage, entry),
                          )
                        }
                      >
                        <img
                          src={issues.find((i) => i.id === entry.id)?.cover}
                          alt=""
                          width="36"
                          height="48"
                          loading="lazy"
                        />
                        <span className="search-story-title">
                          <strong>{marked(story.title)}</strong>
                          {story.author && <span>{marked(story.author)}</span>}
                        </span>
                        <span className="search-story-where">
                          {entry.issue}
                          <span>p. {story.printedPage}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
                {storyHits.length > 60 && (
                  <p className="search-stories-more">
                    Showing the first 60. Add a word to narrow it.
                  </p>
                )}
              </section>
            )}
            {showShelves &&
              shelves.map(({ year: y, issues: group }) => (
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
            {!filtered.length && !storyHits.length && (
              <div className="archive-empty">
                <h2>Nothing matches “{query.trim()}”.</h2>
                <p>Try a headline, a writer, or a month.</p>
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
            <header className="issue-splash-bar">
              <button
                ref={modalClose}
                className="library-modal-close"
                onClick={closeOverlay}
                aria-label="Back to covers"
              >
                <ArrowLeft size={18} />{' '}
                <span className="splash-back-label">Archive</span>{' '}
                <kbd>Esc</kbd>
              </button>
              <img
                className="splash-wordmark"
                src="brand/atlantic-logo.svg"
                alt="The Atlantic"
              />
              {themeButton('splash-theme-toggle')}
            </header>
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
                <div className="issue-ways-in">
                  <div className="issue-reading-actions">
                    <button
                      className="archive-primary"
                      disabled={opening}
                      onClick={() => startReading(issue.id)}
                    >
                      <span>
                        {opening
                          ? 'Opening…'
                          : placeStory(issue.id)
                            ? `Continue · ${placeStory(issue.id)}`
                            : 'Read the issue'}
                      </span>
                      <ArrowRight size={17} />
                    </button>
                  </div>
                  <a
                    className="archive-external"
                    href={issue.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    On TheAtlantic.com <ArrowUpRight size={16} />
                  </a>
                </div>
              ) : (
                <>
                  <p className="splash-availability">
                    Cover preview · Read this issue at The Atlantic
                  </p>
                  <a
                    className="archive-external"
                    href={issue.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    On TheAtlantic.com <ArrowUpRight size={16} />
                  </a>
                </>
              )}
              {issueSections.length > 0 && issueEntry && (
                <nav
                  className="issue-contents"
                  aria-label={`In the ${issue.issue} issue`}
                >
                  <p className="issue-contents-head">
                    In this issue
                    <span>
                      {issueEntry.contents.length} stories ·{' '}
                      {issueEntry.pageCount} pages
                    </span>
                  </p>
                  {issueSections.map((section) => (
                    <section
                      key={`${section.name}-${section.entries[0].printedPage}`}
                    >
                      <h3>{section.name}</h3>
                      <ol>
                        {section.entries.map((entry) => {
                          const here =
                            issueEntry.contents.indexOf(entry) === placeIndex;
                          return (
                            <li key={entry.printedPage}>
                              <button
                                disabled={opening}
                                aria-current={here ? 'location' : undefined}
                                onClick={() =>
                                  // The story holding the saved place resumes
                                  // it; every other row opens at its start.
                                  here
                                    ? startReading(issue.id)
                                    : startReading(
                                        issue.id,
                                        false,
                                        physicalPage(
                                          entry.printedPage,
                                          issueEntry,
                                        ),
                                      )
                                }
                              >
                                <span className="issue-contents-title">
                                  <strong>{entry.title}</strong>
                                  {entry.author && <span>{entry.author}</span>}
                                </span>
                                {here && <em>Continue</em>}
                                <span className="issue-contents-folio">
                                  {entry.printedPage}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ol>
                    </section>
                  ))}
                </nav>
              )}
            </div>
            <nav className="issue-splash-navigation" aria-label="Browse issues">
              {newerIssue ? (
                <button
                  aria-label={`Newer issue: ${newerIssue.issue}`}
                  disabled={opening}
                  onClick={() => showIssue(newerIssue.id)}
                >
                  <ArrowLeft size={16} />
                  <span>{newerIssue.issue}</span>
                </button>
              ) : (
                <span />
              )}
              {olderIssue ? (
                <button
                  aria-label={`Older issue: ${olderIssue.issue}`}
                  disabled={opening}
                  onClick={() => showIssue(olderIssue.id)}
                >
                  <span>{olderIssue.issue}</span>
                  <ArrowRight size={16} />
                </button>
              ) : (
                <span />
              )}
            </nav>
          </section>
        </div>
      )}
    </main>
  );
}
