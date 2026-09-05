import { useEffect, type RefObject } from 'react';

/** Follow the space actually available above the mobile browser/keyboard.
 * Native browser magnification owns its viewport; never counter-scale it. */
export default function useReaderViewport(
  root: RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    const element = root.current,
      visual = window.visualViewport;
    if (!enabled || !element || !visual) return;
    const update = () => {
      if (visual.scale !== 1) return;
      element.style.setProperty(
        '--reader-viewport-height',
        `${visual.height}px`,
      );
      element.style.setProperty(
        '--reader-viewport-top',
        `${visual.offsetTop}px`,
      );
    };
    update();
    visual.addEventListener('resize', update);
    visual.addEventListener('scroll', update);
    return () => {
      visual.removeEventListener('resize', update);
      visual.removeEventListener('scroll', update);
      element.style.removeProperty('--reader-viewport-height');
      element.style.removeProperty('--reader-viewport-top');
    };
  }, [root, enabled]);
}
