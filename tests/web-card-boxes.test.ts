import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The Grade 1 card's narrative boxes keep a stated height.
 *
 * This is a guard, not the verification. Box geometry cannot be checked in
 * happy-dom, which computes no layout, so the real measurement is
 * `.local/sf9-print/boxes.tsx` — it renders the card in real Chrome with the
 * print stylesheet emulated at A4-less-6mm and reads the boxes' own rects. On
 * 2026-11-05 it reported 23mm for all six boxes and one sheet across short,
 * long and empty remarks.
 *
 * What this file is for is the thing that would quietly undo it: someone
 * tidying the stylesheet back to a content-sized box. Two attempts were
 * measured and rejected on the way here — `min-height` (the original fault,
 * 248px and 275px boxes for a long remark, and a second sheet) and an equal
 * *share* of the column (equal to each other, but 98px against 90px, because a
 * grid row takes its height from its items' max-content). Only an absolute
 * height held in all three cases.
 */

const css = readFileSync('web/styles/app.css', 'utf8');
const rule = (selector: string) => {
  const at = css.indexOf(selector + ' {');
  if (at === -1) return null;
  return css.slice(at, css.indexOf('}', at) + 1);
};

describe('the Grade 1 report card’s remark boxes', () => {
  it('states an absolute height, so the box cannot follow its content', () => {
    const box = rule('.paper.sf9-grade1 .card-comment');
    expect(box).toBeTruthy();
    // An absolute unit: a share of the page would move with the content beside it.
    expect(box).toMatch(/height:\s*\d+(\.\d+)?(mm|pt|in)\s*;/);
    // Not a floor that content can push past, which is what it used to be.
    expect(box).not.toMatch(/min-height:\s*\d/);
    // And a remark longer than the box stays inside its border.
    expect(box).toMatch(/overflow:\s*hidden/);
  });

  it('does not let the shared print floor put the box back on its content', () => {
    // `.print-root .card-comment { min-height: 2.2rem }` applies to every card,
    // so this one has to opt out or the floor becomes the height again.
    expect(css).toMatch(/\.print-root\.sf9-g1 \.card-comment \{[^}]*min-height:\s*0/);
  });

  it('spreads the three terms down the column instead of stacking them at the top', () => {
    const column = rule('.paper.sf9-grade1 .card-columns > div:first-child');
    expect(column).toBeTruthy();
    expect(column).toMatch(/justify-content:\s*space-between/);
    // A margin under every term is a gap under the last one too, which is the
    // unused space at the bottom of the page this replaced.
    expect(rule('.paper.sf9-grade1 .card-term')).toMatch(/margin-bottom:\s*0/);
  });

  it('leaves the Grades 2-3 and 4-6 cards alone', () => {
    // They are a different layout on landscape paper, tuned in their own print
    // pass. Every rule added here is scoped to the Grade 1 card.
    for (const selector of ['.paper.sf9-grade1 .card-comment', '.paper.sf9-grade1 .card-term']) {
      expect(rule(selector)).toBeTruthy();
    }
    expect(css).not.toMatch(/\.paper\.sf9-grades2_3 \.card-comment \{[^}]*height:\s*23mm/);
    expect(css).not.toMatch(/\.paper\.sf9-grades4_6 \.card-comment \{[^}]*height:\s*23mm/);
  });
});
