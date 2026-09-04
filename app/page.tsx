'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Grid2X2,
  Maximize2,
  Minimize2,
  Moon,
  Pause,
  Play,
  Search,
  Sun,
  X,
} from 'lucide-react';
import data from './issues.json';
import type { Issue, RoomAPI } from './room';
const issues: Issue[] = data;
const years = [2021, 2022, 2023, 2024, 2025, 2026];
const title = (i: Issue) =>
  i.coverStories[0]?.title || i.issueTheme || `The ${i.issue} issue`;
export default function Home() {
  const host = useRef<HTMLDivElement>(null),
    api = useRef<RoomAPI | null>(null),
    app = useRef<HTMLElement>(null),
    closeButton = useRef<HTMLButtonElement>(null),
    previousFocus = useRef<HTMLElement | null>(null);
  const [mode, setMode] = useState<'room' | 'index'>('room'),
    [year, setYear] = useState<number | null>(2025),
    [selected, setSelected] = useState<string | null>(null),
    [hovered, setHovered] = useState<string | null>(null),
    [night, setNight] = useState(false),
    [tour, setTour] = useState(false),
    [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false),
    [query, setQuery] = useState(''),
    [about, setAbout] = useState(false),
    [full, setFull] = useState(false);
  const issue = issues.find((i) => i.id === selected),
    hover = issues.find((i) => i.id === hovered);
  const openIssue = useCallback((id: string) => {
    previousFocus.current = document.activeElement as HTMLElement;
    setSelected(id);
    setTour(false);
  }, []);
  const closeIssue = useCallback(() => {
    setSelected(null);
    requestAnimationFrame(() => previousFocus.current?.focus());
  }, []);
  const chooseYear = useCallback((value: number | null) => {
    setYear(value);
    setSelected(null);
    setQuery('');
    setTour(false);
  }, []);
  const step = useCallback((direction: number) => {
    setSelected((id) => {
      const p = issues.findIndex((i) => i.id === id);
      return issues[(p + direction + issues.length) % issues.length].id;
    });
  }, []);
  useEffect(() => {
    let cancelled = false;
    let room: RoomAPI | undefined;
    import('./room')
      .then(({ createRoom }) => {
        if (cancelled || !host.current) return;
        try {
          room = createRoom(host.current, issues, openIssue, setHovered, () =>
            setReady(true),
          );
          api.current = room;
        } catch (error) {
          console.error('The room could not open', error);
          setFailed(true);
          setMode('index');
        }
      })
      .catch(() => {
        setFailed(true);
        setMode('index');
      });
    return () => {
      cancelled = true;
      room?.dispose();
      api.current = null;
    };
  }, [openIssue]);
  useEffect(() => {
    api.current?.focusYear(year);
  }, [year, ready]);
  useEffect(() => {
    api.current?.select(selected);
    if (selected) setTimeout(() => closeButton.current?.focus(), 100);
  }, [selected, ready]);
  useEffect(() => api.current?.setLight(night), [night, ready]);
  useEffect(() => api.current?.setTour(tour), [tour, ready]);
  useEffect(() => {
    if (!tour) return;
    const t = setInterval(
      () =>
        setYear((y) => years[(years.indexOf(y || 2021) + 1) % years.length]),
      7000,
    );
    return () => clearInterval(t);
  }, [tour, ready]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'Escape') {
        closeIssue();
        setAbout(false);
        setTour(false);
      }
      if (issue) {
        if (e.key === 'ArrowRight') step(1);
        if (e.key === 'ArrowLeft') step(-1);
      }
      if (issue || about) {
        if (e.key === 'Tab') {
          const panel = document.querySelector(
            about ? '.about-card' : '.issue-dialog',
          );
          const controls = Array.from(
            panel?.querySelectorAll<HTMLElement>('button,a[href]') || [],
          ).filter((el) => el.offsetParent !== null);
          if (controls.length) {
            const first = controls[0],
              last = controls[controls.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [issue, about, step, closeIssue]);
  useEffect(() => {
    const fn = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', fn);
    return () => document.removeEventListener('fullscreenchange', fn);
  }, []);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (t: unknown, o: unknown) => Promise<void>;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: 'explore_atlantic_library',
            title: 'Explore the Atlantic library',
            description:
              'Show a year or open an issue in the visible Atlantic cover collection.',
            inputSchema: {
              type: 'object',
              properties: {
                year: { type: 'integer', enum: years },
                issueId: { type: 'string', enum: issues.map((i) => i.id) },
              },
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute: async (input: unknown) => {
              if (!input || typeof input !== 'object')
                throw Error('Expected year or issueId.');
              const v = input as { year?: number; issueId?: string };
              if (v.year !== undefined && !years.includes(v.year))
                throw Error('Year is outside the collection.');
              if (
                v.issueId !== undefined &&
                !issues.some((i) => i.id === v.issueId)
              )
                throw Error('Unknown issue.');
              if (v.year === undefined && v.issueId === undefined)
                throw Error('Provide year or issueId.');
              if (v.year !== undefined) chooseYear(v.year);
              if (v.issueId) openIssue(v.issueId);
              await new Promise<void>((resolve) =>
                requestAnimationFrame(() => resolve()),
              );
              return { year: v.year ?? null, issueId: v.issueId ?? null };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, [chooseYear, openIssue]);
  const filtered = issues.filter(
    (i) =>
      (!year || i.year === year) &&
      `${i.issue} ${title(i)} ${i.coverStories.flatMap((s) => s.authors).join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const switchMode = (next: 'room' | 'index') => {
    setMode(next);
    setTour(false);
    setSelected(null);
    if (next === 'room') setTimeout(() => api.current?.resize(), 50);
  };
  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await app.current?.requestFullscreen();
    } catch {}
  };
  return (
    <main
      ref={app}
      className={`app ${mode} ${issue ? 'reading' : ''} ${night ? 'night' : ''}`}
    >
      <header className="masthead" inert={Boolean(issue || about)}>
        <a
          className="wordmark"
          href="https://www.theatlantic.com/"
          target="_blank"
          rel="noreferrer"
          aria-label="The Atlantic website"
        >
          The Atlantic
        </a>
        <div className="identity">
          <span className="edition">THE READING ROOM</span>
          <span className="identity-line" />
          <span className="since">EST. 1857</span>
        </div>
        <button className="about-button" onClick={() => setAbout(true)}>
          About the collection <ArrowUpRight size={14} />
        </button>
      </header>
      <div className="room-stage" ref={host} aria-hidden={mode !== 'room'} />
      <div className="room-vignette" aria-hidden="true" />
      <div className="top-controls" inert={Boolean(issue || about)}>
        <div className="room-heading">
          <p className="eyebrow">AN ATLANTIC COVER LIBRARY</p>
          <h1>
            The world, <em>in print.</em>
          </h1>
          <p className="date-range">September 2021 — September 2026</p>
        </div>
        <div className="view-controls">
          <div className="view-toggle" aria-label="Collection view">
            <button
              disabled={failed}
              className={mode === 'room' ? 'active' : ''}
              onClick={() => switchMode('room')}
              aria-pressed={mode === 'room'}
            >
              <BookOpen size={16} /> Reading room
            </button>
            <button
              className={mode === 'index' ? 'active' : ''}
              onClick={() => switchMode('index')}
              aria-pressed={mode === 'index'}
            >
              <Grid2X2 size={15} /> Cover index
            </button>
          </div>
          {mode === 'room' && (
            <div className="utility-controls">
              <button
                className="icon-button"
                title={night ? 'Afternoon light' : 'Evening light'}
                aria-label={
                  night
                    ? 'Switch to afternoon light'
                    : 'Switch to evening light'
                }
                onClick={() => setNight((v) => !v)}
              >
                {night ? <Moon size={18} /> : <Sun size={19} />}
              </button>
              <button
                className="icon-button fullscreen-button"
                title={full ? 'Exit fullscreen' : 'Enter fullscreen'}
                aria-label={full ? 'Exit fullscreen' : 'Enter fullscreen'}
                onClick={toggleFull}
              >
                {full ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
              </button>
            </div>
          )}
        </div>
      </div>
      {mode === 'room' && (
        <>
          <div className="room-caption">
            <span className="caption-rule" />
            <p>{year ? `THE ${year} COLLECTION` : 'THE COMPLETE COLLECTION'}</p>
            <span>
              {year
                ? issues.filter((i) => i.year === year).length
                : issues.length}{' '}
              issues. A moment in time.
            </span>
          </div>
          <div className="room-actions">
            <button
              className={`tour-button ${tour ? 'running' : ''}`}
              onClick={() => {
                setTour((v) => !v);
                if (!tour) {
                  setYear(2021);
                  setSelected(null);
                }
              }}
            >
              {tour ? <Pause size={14} /> : <Play size={14} />}{' '}
              {tour ? 'Pause the tour' : 'Take a slow tour'}
            </button>
            <span className="interaction-hint">
              Drag to look · Scroll to approach · Select a cover
            </span>
          </div>
          {!ready && (
            <div className="loading-notice" role="status">
              <span /> Bringing the covers into the room…
            </div>
          )}
          {hover && !issue && (
            <div className="hover-card">
              <span>{hover.issue}</span>
              <strong>{title(hover)}</strong>
              <small>
                Open issue <ArrowUpRight size={12} />
              </small>
            </div>
          )}
        </>
      )}
      {mode === 'index' && (
        <section className="index-content" aria-label="Atlantic cover index">
          {failed && (
            <p className="fallback-notice">
              Your browser couldn’t open the 3D room. Every cover is available
              here.
            </p>
          )}
          <div className="index-toolbar">
            <span>
              {filtered.length} {filtered.length === 1 ? 'issue' : 'issues'}
              {year ? ` from ${year}` : ' in the collection'}
            </span>
            <label className="search">
              <Search size={16} />
              <input
                aria-label="Search issues, stories, and authors"
                value={query}
                placeholder="Find an issue, idea, or author"
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (e.target.value) setYear(null);
                }}
              />
              {query && (
                <button onClick={() => setQuery('')} aria-label="Clear search">
                  <X size={14} />
                </button>
              )}
            </label>
          </div>
          <div className="cover-grid">
            {filtered.map((i) => (
              <button
                className="index-cover"
                onClick={() => openIssue(i.id)}
                key={i.id}
              >
                <div className="cover-image">
                  <img
                    src={i.cover}
                    alt={`The Atlantic cover, ${i.issue}`}
                    loading="lazy"
                  />
                  <span className="cover-open">
                    <ArrowUpRight size={24} />
                  </span>
                </div>
                <span className="cover-date">{i.issue}</span>
                <strong>{title(i)}</strong>
              </button>
            ))}
          </div>
          {!filtered.length && (
            <div className="empty">
              <h2>No matching issues.</h2>
              <p>Try a year, author, or another word.</p>
              <button
                onClick={() => {
                  setQuery('');
                  setYear(null);
                }}
              >
                See every cover <ArrowRight size={15} />
              </button>
            </div>
          )}
        </section>
      )}
      <footer className="collection-footer" inert={Boolean(issue || about)}>
        <div className="collection-count">
          <strong>55</strong>
          <span>
            COVERS
            <br />
            FIVE YEARS
          </span>
        </div>
        <nav className="years" aria-label="Browse by year">
          <button
            onClick={() => chooseYear(null)}
            className={year === null ? 'active' : ''}
            aria-pressed={year === null}
          >
            All years
          </button>
          {years.map((y) => (
            <button
              key={y}
              onClick={() => chooseYear(y)}
              className={year === y ? 'active' : ''}
              aria-pressed={year === y}
            >
              {y}
              {year === y && <span className="year-dot" />}
            </button>
          ))}
        </nav>
        <span className="footer-note">
          An ongoing conversation.
          <br />
          <em>Since 1857.</em>
        </span>
      </footer>
      {issue && (
        <div
          className={`issue-dialog ${mode === 'index' ? 'flat' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="issue-title"
        >
          <div className="detail-shade" onClick={closeIssue} />
          <button
            ref={closeButton}
            className="close-issue"
            onClick={closeIssue}
          >
            <X size={18} />
            <span>Return to the shelves</span>
            <kbd>ESC</kbd>
          </button>
          <img
            className="detail-cover"
            src={issue.cover}
            alt={`The Atlantic cover, ${issue.issue}`}
          />
          <article className="issue-information">
            <p className="eyebrow">FROM THE COLLECTION</p>
            <p className="issue-date">{issue.issue}</p>
            <div className="small-rule" />
            <p className="story-label">
              {issue.coverStories.length ? 'COVER STORY' : 'IN THIS ISSUE'}
            </p>
            <h2 id="issue-title">{title(issue)}</h2>
            {issue.coverStories[0]?.authors.length > 0 && (
              <p className="byline">
                By {issue.coverStories[0].authors.join(' and ')}
              </p>
            )}
            {issue.coverStories[0]?.dek && (
              <p className="dek">{issue.coverStories[0].dek}</p>
            )}
            <a
              className="read-link"
              href={issue.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Explore this issue <ArrowUpRight size={18} />
            </a>
            <p className="source-note">
              At TheAtlantic.com · Subscriber access may apply
            </p>
            <div className="issue-pagination">
              <button aria-label="Newer issue" onClick={() => step(-1)}>
                <ArrowLeft size={20} />
              </button>
              <span>
                {String(
                  issues.findIndex((i) => i.id === issue.id) + 1,
                ).padStart(2, '0')}{' '}
                <span>/ 55</span>
              </span>
              <button aria-label="Older issue" onClick={() => step(1)}>
                <ArrowRight size={20} />
              </button>
            </div>
          </article>
          <p className="cover-credit">Cover artwork © The Atlantic</p>
        </div>
      )}
      {about && (
        <div
          className="about-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="about-title"
          onClick={() => setAbout(false)}
        >
          <article className="about-card" onClick={(e) => e.stopPropagation()}>
            <button
              autoFocus
              className="about-close icon-button"
              aria-label="Close about the collection"
              onClick={() => setAbout(false)}
            >
              <X size={22} />
            </button>
            <p className="eyebrow">BOSTON, 1857 — AND ONWARD</p>
            <h2 id="about-title">
              A place for
              <br />
              <em>restless minds.</em>
            </h2>
            <p>
              The Atlantic began in 1857 as a magazine of literature, art, and
              politics. This room brings a recent chapter of that history into
              view, one cover at a time.
            </p>
            <p>
              Explore all 55 published issues from September 2021 through
              September 2026. Combined issues occupy a single place on the
              shelves.
            </p>
            <div className="about-facts">
              <div>
                <strong>55</strong>
                <span>Original covers</span>
              </div>
              <div>
                <strong>5</strong>
                <span>Years in view</span>
              </div>
              <div>
                <strong>1857</strong>
                <span>The first chapter</span>
              </div>
            </div>
            <a
              href="https://www.theatlantic.com/magazine/backissues/"
              target="_blank"
              rel="noreferrer"
            >
              Visit the complete Atlantic archive <ArrowUpRight size={17} />
            </a>
            <p className="about-credit">
              An independent interactive concept. Covers and editorial material
              belong to The Atlantic. Cover-story titles follow the online issue
              archive and may differ from printed cover lines.
            </p>
          </article>
        </div>
      )}
    </main>
  );
}
