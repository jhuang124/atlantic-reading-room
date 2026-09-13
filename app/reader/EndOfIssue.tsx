import { ArrowRight } from 'lucide-react';
import type { ReadableIssue } from './catalog';

/** The quiet card at the back cover: the issue is finished; here is the next
 * one, or the way back to the shelf. Mounted by the Reader only after the
 * reader arrives at the end by reading, never on a restored place. */
export default function EndOfIssue({
  issue,
  next,
  onNext,
  onShelf,
}: {
  issue: ReadableIssue;
  next?: { id: string; issue: string; cover: string };
  onNext: () => void;
  onShelf: () => void;
}) {
  const month = issue.issue.split(' ')[0];
  return (
    <div className="end-of-issue-layer">
      <section
        className="end-of-issue"
        role="dialog"
        aria-label={`End of the ${month} issue`}
      >
        <h2>End of the {month} issue</h2>
        {next && (
          <button className="end-next" onClick={onNext}>
            <img src={next.cover} alt="" />
            <span>
              <small>Next issue</small>
              <strong>
                {next.issue} <ArrowRight size={15} />
              </strong>
            </span>
          </button>
        )}
        <button className="end-shelf" onClick={onShelf}>
          Back to the shelf
        </button>
      </section>
    </div>
  );
}
