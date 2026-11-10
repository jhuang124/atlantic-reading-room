'use client';
import { useMemo, useState } from 'react';
import { ArrowRight, Shuffle } from 'lucide-react';
import {
  archive,
  daySeed,
  openerSrc,
  thisMonthInHistory,
  writers,
  type ArchiveStory,
} from './archive';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** A story's opening pages as the magazine prints them: a spread when the
 * story opens across two pages, a single page otherwise. */
export function OpenerArt({
  entry,
  eager = false,
}: {
  entry: ArchiveStory;
  eager?: boolean;
}) {
  return (
    <span
      className={`opener-art ${entry.art.length === 2 ? 'spread' : 'single'}`}
      aria-hidden="true"
    >
      {entry.art.map((page) => (
        <img
          key={page}
          src={openerSrc(entry.issue.id, page)}
          alt=""
          width={520}
          height={693}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
        />
      ))}
    </span>
  );
}

function StoryCard({
  entry,
  onOpen,
  year,
}: {
  entry: ArchiveStory;
  onOpen: (entry: ArchiveStory) => void;
  /** Set on the time rail, where the year is the wayfinding. */
  year?: number;
}) {
  return (
    <button className="story-card" onClick={() => onOpen(entry)}>
      {year !== undefined && <span className="story-card-year">{year}</span>}
      <OpenerArt entry={entry} />
      <span className="story-card-copy">
        <strong>{entry.story.title}</strong>
        <span>
          {entry.story.author}
          {year === undefined && entry.story.author && ' · '}
          {year === undefined && entry.issue.issue}
        </span>
      </span>
    </button>
  );
}

function TypeList({
  heading,
  entries,
  onOpen,
}: {
  heading: string;
  entries: ArchiveStory[];
  onOpen: (entry: ArchiveStory) => void;
}) {
  return (
    <section className="front-type" aria-label={heading}>
      <h3 className="front-label">{heading}</h3>
      <ol>
        {entries.map((entry) => (
          <li key={entry.key}>
            <button onClick={() => onOpen(entry)}>
              <strong>{entry.story.title}</strong>
              <span>
                {entry.story.author}
                {entry.story.author && ' · '}
                {entry.issue.issue}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The archive's front page: the current issue's features, this calendar
 * month in earlier years, the criticism and dispatches set in type, and the
 * writers who fill the most pages. */
export function Today({
  heroId,
  onOpen,
  onIssue,
  onWriter,
  onWriters,
  recent,
  issueCount,
  onIssues,
}: {
  /** The newest covers, for the strip that leads into the Issues lens. */
  recent: { id: string; issue: string; cover: string }[];
  issueCount: number;
  onIssues: () => void;
  heroId: string;
  onOpen: (entry: ArchiveStory) => void;
  onIssue: (id: string) => void;
  onWriter: (name: string) => void;
  onWriters: () => void;
}) {
  const [now] = useState(() => new Date());
  const month = now.getMonth() + 1;
  const inIssue = useMemo(
    () =>
      archive.filter(
        (entry) =>
          entry.issue.id === heroId &&
          entry.art.length > 0 &&
          entry.story.section !== 'Cover story',
      ),
    [heroId],
  );
  const past = useMemo(
    () => thisMonthInHistory(archive, month, heroId, daySeed(now)),
    [month, heroId, now],
  );
  const critics = useMemo(
    () =>
      archive
        .filter((entry) => entry.story.section === 'Culture & Critics')
        .slice(0, 5),
    [],
  );
  const dispatches = useMemo(
    () =>
      archive
        .filter((entry) => entry.story.section === 'Dispatches')
        .slice(0, 5),
    [],
  );
  const features = useMemo(
    () => archive.filter((entry) => entry.art.length > 0),
    [],
  );
  const leading = useMemo(() => writers(archive).slice(0, 10), []);
  const heroIssue = inIssue[0]?.issue;
  return (
    <div className="front">
      {inIssue.length > 0 && heroIssue && (
        <section className="front-section" aria-labelledby="front-issue">
          <header className="front-head">
            <h2 id="front-issue">Also in {heroIssue.issue}</h2>
            <button onClick={() => onIssue(heroId)}>
              All {heroIssue.contents.length} stories <ArrowRight size={14} />
            </button>
          </header>
          <div className="story-rail">
            {inIssue.slice(0, 4).map((entry) => (
              <StoryCard key={entry.key} entry={entry} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}
      {past.length > 1 && (
        <section
          className="front-section front-time"
          aria-labelledby="front-time"
        >
          <header className="front-head">
            <h2 id="front-time">{MONTH_NAMES[month - 1]}s past</h2>
            <span>This month in the archive</span>
          </header>
          <div className="story-rail time-rail">
            {past.map((entry) => (
              <StoryCard
                key={entry.key}
                entry={entry}
                onOpen={onOpen}
                year={entry.year}
              />
            ))}
          </div>
        </section>
      )}
      <section className="front-section front-columns">
        <TypeList
          heading="Culture & Critics"
          entries={critics}
          onOpen={onOpen}
        />
        <TypeList heading="Dispatches" entries={dispatches} onOpen={onOpen} />
        <section className="front-type front-writers" aria-label="Writers">
          <h3 className="front-label">Most published</h3>
          <ol>
            {leading.map((writer) => (
              <li key={writer.name}>
                <button onClick={() => onWriter(writer.name)}>
                  <strong>{writer.name}</strong>
                  <span>{writer.count}</span>
                </button>
              </li>
            ))}
          </ol>
          <button className="front-more" onClick={onWriters}>
            All writers <ArrowRight size={14} />
          </button>
        </section>
      </section>
      {recent.length > 0 && (
        <section className="front-section" aria-labelledby="front-issues">
          <header className="front-head">
            <h2 id="front-issues">Recent issues</h2>
            <button onClick={onIssues}>
              All {issueCount} issues <ArrowRight size={14} />
            </button>
          </header>
          <div className="cover-rail">
            {recent.map((issue) => (
              <button
                key={issue.id}
                aria-label={`View ${issue.issue}`}
                onClick={() => onIssue(issue.id)}
              >
                <img
                  src={issue.cover}
                  alt=""
                  width="300"
                  height="400"
                  loading="lazy"
                  decoding="async"
                />
                <span>{issue.issue}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <section className="front-stacks" aria-label="A story at random">
        <p>
          {features.length} features across {new Set(archive.map((e) => e.issue.id)).size}{' '}
          issues.
        </p>
        <button
          onClick={() =>
            onOpen(features[Math.floor(Math.random() * features.length)])
          }
        >
          <Shuffle size={16} /> Pull one from the stacks
        </button>
      </section>
    </div>
  );
}

const surname = (name: string) =>
  name
    .split(' ')
    .filter((part) => !/^(II|III|IV|Jr\.?|Sr\.?)$/.test(part))
    .at(-1) ?? name;

/** Everyone with two or more pieces in the archive, by surname, under the
 * dozen who have written the most. */
export function Writers({ onWriter }: { onWriter: (name: string) => void }) {
  const all = useMemo(() => writers(archive), []);
  const groups = useMemo(() => {
    const byLetter = new Map<string, { name: string; count: number }[]>();
    for (const writer of all.filter((w) => w.count >= 2)) {
      const letter = surname(writer.name)[0].toUpperCase();
      byLetter.set(letter, [...(byLetter.get(letter) ?? []), writer]);
    }
    return [...byLetter.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([letter, names]) => ({
        letter,
        names: names.sort((a, b) =>
          surname(a.name).localeCompare(surname(b.name)),
        ),
      }));
  }, [all]);
  return (
    <div className="front writers-page">
      <section className="front-section" aria-labelledby="writers-title">
        <header className="shelf-year-head">
          <h2 id="writers-title">Writers</h2>
          <span>
            {all.length} writers · {archive.length} stories
          </span>
        </header>
        <ol className="writers-leading">
          {all.slice(0, 12).map((writer) => (
            <li key={writer.name}>
              <button onClick={() => onWriter(writer.name)}>
                <span>{writer.count}</span>
                <strong>{writer.name}</strong>
              </button>
            </li>
          ))}
        </ol>
        <div className="writers-index">
          {groups.map(({ letter, names }) => (
            <section key={letter} aria-label={letter}>
              <h3>{letter}</h3>
              <ul>
                {names.map((writer) => (
                  <li key={writer.name}>
                    <button onClick={() => onWriter(writer.name)}>
                      {writer.name}
                      <span>{writer.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="writers-note">
          Writers with one piece are a search away.
        </p>
      </section>
    </div>
  );
}
