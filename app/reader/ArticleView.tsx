'use client';
import { useEffect, useRef, useState } from 'react';
import type { ArticleEdition } from './articles';
import { scrollPort } from './scroll-port';
export default function ArticleView({
  id,
  fontSize,
  initialTop = 0,
  documentScroll = false,
  onScroll,
  onPrint,
  onReady,
}: {
  id: string;
  fontSize: number;
  initialTop?: number;
  documentScroll?: boolean;
  onScroll: (top: number) => void;
  onPrint: (page?: number) => void;
  onReady?: () => void;
}) {
  const [article, setArticle] = useState<ArticleEdition | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady);
  ready.current = onReady;
  useEffect(() => {
    const abort = new AbortController();
    setFailed(false);
    fetch(`reader-assets/articles/${id}.json`, { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((data) => {
        if (
          !data ||
          typeof data !== 'object' ||
          !('sections' in data) ||
          !Array.isArray(data.sections)
        )
          throw Error();
        setArticle(data as ArticleEdition);
      })
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true);
      });
    return () => abort.abort();
  }, [id, retry]);
  useEffect(() => {
    if (article && root.current) {
      scrollPort(root.current, documentScroll).to({ top: initialTop });
      ready.current?.();
    }
  }, [article]);
  const report = useRef(onScroll);
  report.current = onScroll;
  useEffect(() => {
    const el = root.current;
    if (!el || !documentScroll) return;
    const port = scrollPort(el, true);
    const update = () => report.current(port.read().top);
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [documentScroll]);
  return (
    <div
      className="article-scroll"
      ref={root}
      onScroll={(e) => {
        if (!documentScroll) onScroll(e.currentTarget.scrollTop);
      }}
      tabIndex={0}
      aria-label="Article text"
    >
      {article ? (
        <article style={{ fontSize }}>
          <h1>{article.title}</h1>
          <p className="article-byline">By {article.author}</p>
          {article.sections.map((section) => (
            <section
              key={section.page}
              aria-label={`Print page ${section.page - 2}`}
            >
              {section.paragraphs.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </section>
          ))}
          <footer>
            <button onClick={() => onPrint()}>
              Return to the print edition
            </button>
          </footer>
        </article>
      ) : (
        <div className="article-message" role="status">
          <p>
            {failed ? 'This article couldn’t be loaded.' : 'Loading article…'}
          </p>
          {failed && (
            <>
              <button onClick={() => setRetry((n) => n + 1)}>Try again</button>
              <button onClick={() => onPrint()}>Read in print</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
