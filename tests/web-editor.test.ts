// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { createElement, useEffect, useState } from 'react';
import { byLabel, byText, click, fill, mount, settle } from './helpers/dom';
import { Editor, type Field } from '../web/components/primitives';

/**
 * The shared form every screen edits through. Screens build `fields` and
 * `initial` inline, so both change identity on every render of the parent.
 * Until 0.33.0 the form reset on identity, and a fetch landing while someone
 * typed wiped what they had typed.
 */
describe('the shared editor', () => {
  let unmount: (() => Promise<void>) | null = null;
  afterEach(async () => { await unmount?.(); unmount = null; document.body.innerHTML = ''; });

  function Parent({ onSubmit, version = 1 }: { onSubmit: (values: Record<string, unknown>) => Promise<unknown>; version?: number }) {
    const [tick, setTick] = useState(0);
    // An unrelated state change in the parent, as a fetch completing would cause.
    useEffect(() => { const timer = setInterval(() => setTick(t => t + 1), 5); return () => clearInterval(timer); }, []);
    const fields: Field[] = [
      { key: 'name', label: 'Name' },
      { key: 'grades', label: 'Applies to', type: 'checkboxes', options: [['0', 'Kindergarten'], ['1', 'Grade 1'], ['2', 'Grade 2']] },
    ];
    return createElement('div', { 'data-tick': tick },
      createElement(Editor, { fields, initial: { name: 'Original', grades: [2], version }, setStatus: () => {}, onSubmit }));
  }

  it('keeps what is being typed when the parent re-renders', async () => {
    let sent: Record<string, unknown> | null = null;
    const view = await mount(createElement(Parent, { onSubmit: async values => { sent = values; } }));
    unmount = view.unmount;
    await fill(byLabel(view.host, 'Name'), 'Typed by hand');
    await click(byText(view.host, 'Kindergarten', 'label')!.querySelector('input'));
    for (let i = 0; i < 5; i++) await settle();
    expect(byLabel<HTMLInputElement>(view.host, 'Name')!.value).toBe('Typed by hand');
    await click(byText(view.host, 'Save changes'));
    // A set is submitted as option keys in option order, whatever order they were ticked in.
    expect(sent).toEqual({ name: 'Typed by hand', grades: ['0', '2'] });
  });

  it('still resets when the record it describes changes', async () => {
    const view = await mount(createElement(Parent, { onSubmit: async () => {} }));
    unmount = view.unmount;
    await fill(byLabel(view.host, 'Name'), 'Unsaved');
    await view.rerender(createElement(Parent, { onSubmit: async () => {}, version: 2 }));
    await settle();
    expect(byLabel<HTMLInputElement>(view.host, 'Name')!.value).toBe('Original');
  });
});
