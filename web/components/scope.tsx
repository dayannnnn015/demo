import { useEffect, useId, useState } from 'react';
import type { Api, Page, Row } from '../api';
import { query } from '../api';
import { Select, gradeName, sentence, yearName } from './primitives';

/**
 * The school year and section every attendance screen is filed under.
 *
 * All three attendance screens read one section on one date or range, so they
 * all begin with the same two choices and would otherwise hold three copies of
 * the same fetch. A teacher's `/sections` already returns only the sections
 * they currently advise — that is the row policy, not a filter applied here —
 * so the same picker serves both roles and an adviser with nothing to mark
 * gets an honest empty list rather than somebody else's class.
 */
export type Scope = {
  years: Row[] | null;
  yearId: string;
  setYearId: (id: string) => void;
  year: Row | undefined;
  sections: Row[] | null;
  sectionId: string;
  setSectionId: (id: string) => void;
  section: Row | undefined;
};

export const sectionName = (section: Row | undefined) =>
  section ? `${gradeName(section.grade_level)} · ${String(section.name)}` : 'Unavailable';

export function useScope(api: Api, token: number): Scope {
  const [years, setYears] = useState<Row[] | null>(null);
  const [yearId, setYearId] = useState('');
  const [sections, setSections] = useState<Row[] | null>(null);
  const [sectionId, setSectionId] = useState('');

  useEffect(() => {
    void api<Page>('/academic-years').then(page => {
      setYears(page.items);
      // Open on the year the school is actually running, not the first row.
      setYearId(current => (page.items.some(y => y.id === current)
        ? current
        : String((page.items.find(y => y.status === 'active') ?? page.items[0])?.id ?? '')));
    }).catch(() => setYears([]));
  }, [api, token]);

  useEffect(() => {
    if (!yearId) { setSections(null); setSectionId(''); return; }
    setSections(null);
    void api<Page>(`/sections${query({ academic_year_id: yearId, limit: 100 })}`)
      .then(page => {
        setSections(page.items);
        // A section belongs to one year, so a year change drops a section that
        // is not in the new one rather than carrying a dead id into a fetch.
        setSectionId(current => (page.items.some(s => s.id === current) ? current : String(page.items[0]?.id ?? '')));
      })
      .catch(() => { setSections([]); setSectionId(''); });
  }, [api, yearId, token]);

  return {
    years, yearId, setYearId, year: years?.find(y => y.id === yearId),
    sections, sectionId, setSectionId, section: sections?.find(s => s.id === sectionId),
  };
}

export function ScopePickers({ scope }: { scope: Scope }) {
  const id = useId();
  return (
    <>
      <div className="field inline">
        <label className="label" htmlFor={`${id}-year`}>School year</label>
        <Select id={`${id}-year`} value={scope.yearId} onChange={event => scope.setYearId(event.target.value)}>
          {(scope.years ?? []).map(y => (
            <option key={String(y.id)} value={String(y.id)}>{yearName(y)} — {sentence(String(y.status))}</option>
          ))}
        </Select>
      </div>
      <div className="field inline">
        <label className="label" htmlFor={`${id}-section`}>Section</label>
        <Select id={`${id}-section`} value={scope.sectionId} onChange={event => scope.setSectionId(event.target.value)} disabled={!scope.sections?.length}>
          {(scope.sections ?? []).map(s => (
            <option key={String(s.id)} value={String(s.id)}>{sectionName(s)}</option>
          ))}
        </Select>
      </div>
    </>
  );
}
