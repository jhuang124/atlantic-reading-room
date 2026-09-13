import { useEffect, useState } from 'react';

/** One button: full screen. Focus (F) is a different action and lives in the
 * bar; install instructions left the reader in V4. */
export default function BrowserReadingOptions({
  onEnter,
}: {
  onEnter: () => void;
}) {
  const [full, setFull] = useState(!!document.fullscreenElement);
  const [error, setError] = useState('');
  useEffect(() => {
    const update = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  if (!document.fullscreenEnabled) return null;
  const toggle = async () => {
    setError('');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      onEnter();
    } catch {
      setError('Full screen is unavailable in this browser.');
    }
  };
  return (
    <fieldset className="browser-reading-options">
      <legend>Screen</legend>
      <button onClick={toggle}>
        {full ? 'Exit full screen' : 'Full screen'}
      </button>
      {error && <output>{error}</output>}
    </fieldset>
  );
}
