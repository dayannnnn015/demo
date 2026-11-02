import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Prints something that lives inside the app, such as a sheet or a report
 * card, on a page of its own. The print stylesheet hides the app, so while
 * `printing` is set the content is drawn once more into a root beside it, the
 * body is marked, the browser prints, and both are taken away again. `landscape`
 * puts the copy on a wide page, for forms like SF4 that are printed that way;
 * `long` on long bond paper upright, as the SF10 is.
 */
export function PrintCopy({ printing, onPrinted, landscape, long, children }: {
  printing: boolean; onPrinted: () => void; landscape?: boolean; long?: boolean; children: ReactNode;
}) {
  useEffect(() => {
    if (!printing) return;
    document.body.classList.add('printing-sheet');
    try { window.print?.(); } finally {
      document.body.classList.remove('printing-sheet');
      onPrinted();
    }
  }, [printing]);
  return printing ? createPortal(<div className={`print-root${landscape ? ' landscape' : long ? ' long' : ''}`}>{children}</div>, document.body) : null;
}
