'use client';
import { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
// A quiet page: what this is, how it thinks, what it leaves out, and whose
// work it rests on. It renders inside the archive shell under the masthead.
const principles = [
  {
    lead: 'Views are named for what they are for.',
    body:
      'Spread on a desk, Pages on a phone, is the magazine as an object: fitted pages and turns. Scroll is for reading: continuous, page-wide, pinchable. There is nothing else, and the switch sits in the bar where you can see it.',
  },
  {
    lead: 'The story is the unit; the page is the medium.',
    body:
      'Where you are is a story. How far along you are is a page within it. The big step is the next story. Resume, captions, and this shelf all speak in stories, not page numbers.',
  },
  {
    lead: 'Chrome never blocks reading.',
    body:
      'Controls live in the margins and the bars, never over the page you are reading. Hidden controls return only when you ask for them, with an edge dwell or a deliberate tap.',
  },
  {
    lead: 'The first page is instant.',
    body:
      'The cover should be on screen in under a second on any connection that can load the site. The issue arrives behind it, page by page, while you are already looking.',
  },
];
const removed = [
  'Article view, which reflowed three stories out of about 1,100 into web text. It made the product unsure what it was. Where a story is online, a link to theatlantic.com takes its place.',
  'Page width as a separate view. Scroll is already page-width reading; in Spread, width is what zoom is for.',
  'Zoom, view, and full screen inside Settings. View and zoom moved to the bar. Full screen stayed behind as a single button.',
  'The page folio in the desktop top bar, the bottom-edge reveal in Focus, install-to-home-screen instructions, and “always show controls” on phones. Each was a control that could not be defended in one sentence.',
];
const keys: [string[], string][] = [
  [['←', '→'], 'Turn the page'],
  [['C'], 'Contents'],
  [['F'], 'Focus: hide the chrome'],
  [['B'], 'Save this page'],
  [['/'], 'Search the issue'],
  [['Esc'], 'Back'],
];
export default function About({ onBack }: { onBack: () => void }) {
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    back.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);
  return (
    <article className="about-page" aria-labelledby="about-title">
      <button ref={back} className="about-back" onClick={onBack}>
        <ArrowLeft size={16} /> Back to the shelf
      </button>
      <header>
        <p className="about-kicker">About this edition</p>
        <h1 id="about-title">The print edition as an object, online.</h1>
      </header>
      <section aria-label="What this is">
        <p>
          Today The Atlantic’s print issue lives online as a PDF download and
          whatever viewer your browser happens to open it in. This is a
          proposal for what it could be instead: the issue itself, cover to
          back cover, with its spreads, its turns, and the place you left off.
          It is not a replacement for reading on theatlantic.com. It is for
          people who want the magazine.
        </p>
        <p>
          The Print Edition is an independent concept built from The
          Atlantic’s own materials. It is not a product of The Atlantic, and
          it makes no claim about how the magazine’s production systems work
          or what they ship.
        </p>
      </section>
      <section aria-labelledby="about-principles">
        <h2 id="about-principles">How it thinks</h2>
        <ol className="about-principles">
          {principles.map((item) => (
            <li key={item.lead}>
              <span>
                <em>{item.lead}</em> {item.body}
              </span>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="about-removed">
        <h2 id="about-removed">What we removed, and why</h2>
        <ul className="about-removed">
          {removed.map((item) => (
            <li key={item}>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="about-provenance">
        <h2 id="about-provenance">Provenance and rights</h2>
        <p>
          Covers and editorial material are © The Atlantic. Cover images come
          from the magazine’s public back-issues index and image CDN; the
          complete issues are The Atlantic’s own PDFs from the subscriber
          library, prepared for this user-authorized demonstration. The
          typography, Atlantic Condensed, Adobe Garamond, and Graphik, loads
          from The Atlantic’s font URLs, and the visual system adapts the
          magazine’s web design kit. None of this is a rights clearance.
        </p>
        <p>
          Your reading state, the place in each issue, saved pages, and the
          theme, lives only in this browser’s local storage. Nothing is sent
          anywhere.
        </p>
      </section>
      <section aria-labelledby="about-keys">
        <h2 id="about-keys">Keyboard</h2>
        <dl className="about-keys">
          {keys.map(([combo, action]) => (
            <div key={action}>
              <dt>
                {combo.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
      </section>
    </article>
  );
}
