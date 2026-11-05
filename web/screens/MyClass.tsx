import { useCallback, useEffect, useId, useState } from 'react';
import type { Api, Page, Row } from '../api';
import { message, query } from '../api';
import { Icon } from '../components/icons';
import { Sheet } from '../components/overlay';
import { BatchSheet, type Candidate } from '../components/batch';
import { clamp } from '../dates';
import { sectionName } from '../components/scope';
import { LearnerFields, blankLearner, learnerProblems, toLearnerProfile, type LearnerDraft } from './LateLearner';
import {
  Badge, Callout, Cell, Select, StatusLine, Task, Unrecorded, gradeName, idle, localToday, type Status,
} from '../components/primitives';

/**
 * An adviser takes learners into a class they advise, and registers a new one
 * into it.
 *
 * Both are new to an adviser (0.90.0) and both reverse the rule that only
 * managers change learner records, so the screen is written to make the narrow
 * shape of the widening visible rather than to hide it:
 *
 * - It always names the class. An adviser with two sections chooses which, and
 *   the list is that class's grade and year — not "the registry".
 * - It says what taking a learner in will do to each one: *give them this class*
 *   when they already hold an enrolment with no class, or *enrol them here* when
 *   they hold none this year.
 * - It does not offer a learner already in somebody's class. Moving a learner
 *   between classes stays the office's, and the API refuses it.
 * - Registering says, before the form, that the registry is searched first and
 *   that a child already on it must be taken in rather than typed again. An
 *   adviser cannot search the registry, so the refusal has to be expected
 *   rather than surprising.
 */

type Section = { id: string; name: string; grade_level: number; academic_year_id: string; start_year: number; status: string; starts_on: string; ends_on: string };
type Pullable = {
  learner_id: string; lrn: string | null; first_name: string; middle_name: string | null; last_name: string;
  name_extension: string | null; sex: 'male' | 'female'; birth_date: string; address: string | null;
  enrollment_id: string | null; enrollment_version: number | null; enrolled_on: string | null; how: 'assign' | 'enrol';
};

const fullName = (p: Pullable) => `${p.last_name}, ${p.first_name}${p.name_extension ? ` ${p.name_extension}` : ''}${p.middle_name ? ` ${p.middle_name}` : ''}`;

export function MyClassSheet({ api, onClose, onDone }: {
  api: Api;
  onClose: (written: number) => void;
  onDone: (text: string) => void;
}) {
  const id = useId();
  const [sections, setSections] = useState<Row[] | null>(null);
  const [sectionId, setSectionId] = useState('');
  const [search, setSearch] = useState('');
  const [asked, setAsked] = useState('');
  const [answer, setAnswer] = useState<{ section: Section; items: Pullable[] } | null>(null);
  const [status, setStatus] = useState<Status>(idle);
  const [on, setOn] = useState('');
  const [registering, setRegistering] = useState(false);
  const [beat, setBeat] = useState(0);
  const again = useCallback(() => setBeat(n => n + 1), []);

  // Only the sections this adviser advises: that is what `/sections` answers
  // for them, by row security rather than by a filter applied here.
  useEffect(() => {
    let live = true;
    void api<Page>(`/sections${query({ limit: 100 })}`)
      .then(page => {
        if (!live) return;
        setSections(page.items);
        setSectionId(current => (page.items.some(s => s.id === current) ? current : String(page.items[0]?.id ?? '')));
      })
      .catch(error => { if (live) { setSections([]); setStatus({ kind: 'error', text: message(error) }); } });
    return () => { live = false; };
  }, [api]);

  useEffect(() => {
    if (!sectionId) { setAnswer(null); return; }
    let live = true;
    setAnswer(null);
    void api<{ section: Section; items: Pullable[] }>(`/sections/${sectionId}/pullable-learners${query({ ...(asked ? { search: asked } : {}), limit: 50 })}`)
      .then(a => { if (live) setAnswer(a); })
      .catch(error => { if (live) setStatus({ kind: 'error', text: message(error) }); });
    return () => { live = false; };
  }, [api, sectionId, asked, beat]);

  // The first day in the class: today, kept inside the school year.
  useEffect(() => {
    if (!answer) return;
    setOn(clamp(localToday(), answer.section.starts_on, answer.section.ends_on));
  }, [answer?.section.id]);

  const reread = async () => {
    const a = await api<{ section: Section; items: Pullable[] }>(`/sections/${sectionId}/pullable-learners${query({ ...(asked ? { search: asked } : {}), limit: 50 })}`);
    setAnswer(a);
  };

  const candidates: Candidate[] | null = answer === null ? null : answer.items.map(p => ({
    key: p.learner_id,
    label: fullName(p),
    chosen: false,
    cells: [
      <Cell key="who" title={fullName(p)} meta={p.lrn ? <span className="mono">LRN {p.lrn}</span> : <Unrecorded label="LRN missing" />} />,
      <span key="born" className="mono">{p.birth_date}</span>,
      p.how === 'assign'
        ? <Badge key="how" tone="info">Give them this class</Badge>
        : <Badge key="how" tone="attention">Enrol them here</Badge>,
    ],
  }));

  return (
    <Sheet
      wide
      title="Take learners into my class"
      note="Learners the office has registered, assigned to a class you advise. No learner record is created or duplicated."
      onClose={() => onClose(0)}
    >
      <StatusLine status={status} />

      <Task title="1. The class" note="One you advise">
        <div className="card-tools">
          <div className="field inline">
            <label className="label" htmlFor={`${id}-section`}>My class</label>
            <Select id={`${id}-section`} value={sectionId} onChange={event => setSectionId(event.target.value)} disabled={!sections?.length}>
              {(sections ?? []).map(s => <option key={String(s.id)} value={String(s.id)}>{sectionName(s)}</option>)}
            </Select>
          </div>
          <div className="field inline">
            <label className="label" htmlFor={`${id}-on`}>First day in the class</label>
            <input id={`${id}-on`} type="date" className="date-input" value={on}
              min={answer?.section.starts_on ?? ''} max={answer?.section.ends_on ?? ''} onChange={event => setOn(event.target.value)} />
          </div>
        </div>
        {sections !== null && !sections.length ? (
          <Callout tone="info" title="You advise no class yet">
            A principal or administrative officer assigns advisers to classes on <b>Staff access</b>. Once a class is yours, its learners appear here.
          </Callout>
        ) : null}
      </Task>

      {sectionId ? (
        <>
          <Task title="2. Who is waiting" note="Registered for this year, at this class’s grade, with no class yet">
            <form
              className="card-tools"
              onSubmit={event => { event.preventDefault(); setAsked(search.trim()); }}
            >
              <div className="field inline">
                <label className="label" htmlFor={`${id}-search`}>Also search the registry by name or LRN</label>
                <input id={`${id}-search`} value={search} maxLength={100} onChange={event => setSearch(event.target.value)} />
                <span className="hint">At least two characters. A search also finds a learner with no enrolment this school year, such as one returning to the school.</span>
              </div>
              <button type="submit" className="btn secondary" disabled={search.trim().length === 1}><Icon name="search" size={15} />Search</button>
              {asked ? <button type="button" className="btn ghost" onClick={() => { setSearch(''); setAsked(''); }}>Clear</button> : null}
            </form>
            <p className="muted">
              A learner already in somebody’s class is not offered here: a principal or administrative officer moves a learner between classes. Taking a learner in
              never makes a second record for them — it is the record the office already holds.
            </p>
          </Task>

          <BatchSheet
            title=""
            note=""
            reasoned={false}
            headers={['Learner', 'Born', 'What happens']}
            candidates={candidates}
            intro={null}
            empty={
              <Callout tone="info" title={asked ? 'Nobody matches that search' : 'Nobody is waiting for this class'}>
                {asked
                  ? 'Try a shorter name, or part of the LRN. Only a learner in no class, or with no enrolment this school year, can be taken in.'
                  : 'Every learner registered at this grade is already in a class. If a learner should be here and is not, ask the office to register them at this grade, or register a new learner below.'}
              </Callout>
            }
            verb={count => (count === 1 ? 'Take 1 learner into my class' : `Take ${count} learners into my class`)}
            past="In my class"
            reread={reread}
            send={async key => {
              const row = answer?.items.find(p => p.learner_id === key);
              await api(`/sections/${sectionId}/pulls`, 'POST', {
                learner_id: key, enrolled_on: on, entry_kind: 'regular',
                ...(row?.enrollment_version !== null && row?.enrollment_version !== undefined ? { version: row.enrollment_version } : {}),
              });
            }}
            onClose={written => {
              if (written) { onDone(`${written === 1 ? 'One learner' : `${written} learners`} taken into the class.`); onClose(written); }
              else onClose(0);
            }}
          />

          <Task title="3. A learner the school has never held" note="Only when they are on no list at all">
            <p className="muted">
              Register a child who is not on the school’s registry yet. The registry is checked first: if a learner with the same name and birth date is already on
              it, this is refused and you take <i>that</i> learner into your class instead — one child has one record, for their whole time at the school.
            </p>
            <p className="card-note">
              <button type="button" className="btn secondary" onClick={() => setRegistering(true)}>
                <Icon name="plus" size={15} />Register a new learner into my class
              </button>
            </p>
          </Task>
        </>
      ) : null}

      {registering && answer ? (
        <RegisterIntoClass
          api={api}
          section={answer.section}
          on={on}
          onClose={() => setRegistering(false)}
          onDone={text => { setRegistering(false); again(); onDone(text); }}
        />
      ) : null}
    </Sheet>
  );
}

/** One new learner, straight into the adviser's own class. */
function RegisterIntoClass({ api, section, on, onClose, onDone }: {
  api: Api; section: Section; on: string; onClose: () => void; onDone: (text: string) => void;
}) {
  const [draft, setDraft] = useState<LearnerDraft>(blankLearner);
  const [bad, setBad] = useState<[keyof LearnerDraft, string][]>([]);
  const [status, setStatus] = useState<Status>(idle);
  const [busy, setBusy] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const problems = learnerProblems(draft);
    setBad(problems);
    if (problems.length) { setStatus({ kind: 'error', text: 'Check the fields marked below.' }); return; }
    setBusy(true);
    setStatus({ kind: 'busy', text: 'Registering…' });
    try {
      await api(`/sections/${section.id}/learners`, 'POST', { ...toLearnerProfile(draft), enrolled_on: on, entry_kind: 'regular' });
      onDone(`${draft.first_name.trim()} ${draft.last_name.trim()} registered into ${gradeName(section.grade_level)} · ${section.name}.`);
    } catch (error) { setStatus({ kind: 'error', text: message(error) }); }
    finally { setBusy(false); }
  };

  return (
    <Sheet
      title={`Register a learner into ${gradeName(section.grade_level)} · ${section.name}`}
      note="A child the school has never held a record for. One record per child, for their whole time at the school."
      onClose={onClose}
    >
      <StatusLine status={status} />
      <Callout tone="attention" title="Check they are not already on the registry">
        If a learner with the same name and birth date is already on the school’s registry, this is refused — take that learner into your class instead. Ask the
        office if it is a different child with the same name.
      </Callout>
      <form noValidate onSubmit={save}>
        <LearnerFields draft={draft} set={setDraft} bad={bad} />
        <p className="card-note">They are enrolled into this class from <span className="mono">{on}</span>.</p>
        <div className="form-actions">
          <button type="submit" className="btn" disabled={busy} aria-busy={busy}>{busy ? 'Registering…' : 'Register into my class'}</button>
          <button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Sheet>
  );
}
