import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The public front page's inner tabs, and the empty panel they used to carry.
 *
 * Reported 2026-11-09: switching from Home to Announcements, Calendar,
 * Questions or About showed a blank dark band above the heading. The cause was
 * not a spacing value — `.valley`, the SVG backdrop those pages share, had **no
 * positioning rule at all**, so it laid out inline at the SVG's own size and
 * pushed the heading down. Home never showed it because Home does not use
 * `Valley`; it uses `.hero-art img`, which has always been positioned.
 *
 * Both halves are pinned because either alone brings the band back: without the
 * positioning the SVG returns to the flow, and without trimming the padding the
 * gap it was leaving for the art stays behind.
 */

const css = readFileSync('web/styles/site.css', 'utf8');
const rule = (selector: string) => {
  const found = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css);
  if (!found) throw new Error(`no rule for ${selector}`);
  return found[1]!;
};

describe('the inner pages draw their backdrop behind the words', () => {
  it('takes the valley out of the flow, as the home page does with its illustration', () => {
    const valley = rule('.page-head .valley');
    expect(valley).toContain('position: absolute');
    expect(valley).toContain('inset: 0');
    // Behind the heading rather than over it; `.page-head` sets `isolation: isolate`
    // so this negative layer cannot escape the band.
    expect(valley).toContain('z-index: -1');
    // It has to fill the band: an absolutely positioned SVG with no size collapses.
    expect(valley).toContain('width: 100%');
    expect(valley).toContain('height: 100%');
  });

  it('is positioned the same way Home positions its own art', () => {
    // The fix is not a new idea; it is the rule Home already had. If these two
    // ever disagree again, one of the two backdrops is broken.
    const home = rule('.hero-art img');
    for (const property of ['position: absolute', 'inset: 0', 'z-index: -1']) {
      expect(home, `Home lost ${property}`).toContain(property);
      expect(rule('.page-head .valley'), `the inner pages lost ${property}`).toContain(property);
    }
  });

  it('no longer holds a gap for art that is not in the flow', () => {
    const inner = rule('.page-head-inner');
    expect(inner).toContain('padding-block:');
    // It was clamp(48px, 8vw, 88px) clamp(110px, 14vw, 170px) — the second value
    // mirrored the Home hero, where the illustration really does sit. Anything
    // that tall here is the empty band coming back.
    expect(inner).not.toMatch(/clamp\(\s*1[1-9]\d\s*px/);
    expect(inner).not.toMatch(/\b1[2-9]\dpx\b/);
  });

  it('leaves the home page’s own hero alone', () => {
    // Home's bottom padding is load-bearing: the hillside is drawn there and the
    // words have to clear it. This change must not have touched it.
    expect(rule('.hero-inner')).toContain('clamp(220px, 30vh, 320px)');
  });
});
