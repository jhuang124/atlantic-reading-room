import { useEffect, useState } from 'react';

export default function BrowserReadingOptions({
  onEnter,
  installHelp = true,
}: {
  onEnter: () => void;
  /** Phones get the Add to Home Screen note; desktops only need full screen. */
  installHelp?: boolean;
}) {
  const [full, setFull] = useState(!!document.fullscreenElement);
  const [error, setError] = useState('');
  const standalone =
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone;
  useEffect(() => {
    const update = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  if (standalone || (!installHelp && !document.fullscreenEnabled)) return null;
  const toggle = async () => {
    setError('');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      onEnter();
    } catch {
      setError(
        'Full screen is unavailable here. You can still open this reader from your Home Screen.',
      );
    }
  };
  return (
    <fieldset className="browser-reading-options">
      <legend>Screen</legend>
      {document.fullscreenEnabled && (
        <button onClick={toggle}>
          {full ? 'Exit full screen' : 'Full screen'}
        </button>
      )}
      {installHelp && (
        <details>
          <summary>Read without browser bars</summary>
          <p>
            In Safari, open Share, then Add to Home Screen. In Chrome, use the
            browser menu and choose Add to Home Screen or Install app. Open the
            new icon to read without the browser bars.
          </p>
        </details>
      )}
      {error && <output>{error}</output>}
    </fieldset>
  );
}
