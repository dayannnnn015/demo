import { useEffect, useState, type ReactNode } from 'react';
import type { Api, Row } from '../api';
import { ApiError, message } from '../api';
import { Icon } from '../components/icons';
import { Confirm, Sheet } from '../components/overlay';
import { PrintCopy } from '../components/print';
import { SeededNotice } from '../components/seeded';
import { Badge, Callout, FormSheet, StatusLine, TableSkeleton, idle, learnerName, localToday, type Status, ScrollArea } from '../components/primitives';
import { Affects } from '../components/affects';
import { descriptiveGrading } from '../deped';
import { IssueFlow, issuedLine } from '../forms/shared';
import { Sf9Sheet, type CardEdit } from '../forms/sf9';
import { Sf10Sheet } from '../forms/sf10';
import { fingerprint, type Issuance, type Sf10Form, type Sf9Form } from '../forms/types';
import { CardReview, cardBoxes, cardParts, useCardDraft, type CardRecords } from './CardEditor';
import { gradeProblem } from './ReportCards';
import { profileFields } from '../record-fields';

// The SF9 and SF10 open in a view of their own that takes the working area
// beside the rail (the group leader's note of 12 October), read when opened —
// the read is in the privacy log — and shown as they print. Issuing records a
// fingerprint of exactly what the form said; a later one with different
// content is a reasoned correction of it.

const footerFor = (label: string) => (issuance: Issuance | null) =>
  issuance ? issuedLine(label, issuance) : `Printed ${localToday()} from EDUNEXUS. Not issued: this copy is not recorded as an issued ${label}.`;
const issueCost = (label: string) => `This records the ${label} exactly as it stands, under your name, and prints it. Parents keep what is printed, so check the grades against the ECR first.`;
const issuedText = (label: string, issuance: Issuance) =>
  issuance.reprint ? `${label} no. ${issuance.serial} printed again; nothing had changed.` : `${label} issued as no. ${issuance.serial}.`;
const IssuedBadge = ({ issuance }: { issuance?: Issuance | null | undefined }) =>
  (issuance ? <Badge tone="info">Issued as no. {issuance.serial} · {fingerprint(issuance.data_hash)}</Badge> : null);

/**
 * A learner's SF9, typed where it prints. "Type on the card" turns each box
 * the adviser fills — every term's grade, the subject averages and remarks,
 * the general average, the observed values and the comments or narratives —
 * into an input in its own cell; the changed boxes are reviewed together and
 * recorded in one request through the same writer as Promotion → Report card,
 * so every check, version and journal entry applies. Attendance is not typed:
 * it is counted from the register by the school's rule, so the card always
 * agrees with the SF2, and the view says where to change it.
 */
export function Sf9Dialog({ api, me, learner, enrollment, onClose }: { api: Api; me: Row; learner: Row; enrollment: Row; onClose: () => void }) {
  const url = `/enrollments/${String(enrollment.id)}/forms/sf9`;
  const [form, setForm] = useState<Sf9Form | null>(null);
  const [status, setStatus] = useState<Status>(idle);
  const [issuing, setIssuing] = useState(false);
  const [printing, setPrinting] = useState<Issuance | null | false>(false);
  const [records, setRecords] = useState<CardRecords | null>(null);
  const [typing, setTyping] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [leaving, setLeaving] = useState<'close' | 'stop' | null>(null);
  const [tick, setTick] = useState(0);
  const draft = useCardDraft(typing ? records?.learner : undefined);

  useEffect(() => { void api<Sf9Form>(url).then(setForm).catch(error => setStatus({ text: message(error), kind: 'error' })); }, [api, url, tick]);

  const readCard = () => api<CardRecords>(`/enrollments/${String(enrollment.id)}/report-card`).then(card => { setRecords(card); return card; });
  const startTyping = async () => {
    setStatus({ kind: 'busy', text: 'Opening the card for typing…' });
    try {
      const card = await readCard();
      if (card.school_year.status === 'closed') { setStatus({ kind: 'error', text: 'This school year is closed, so its report cards are read only.' }); return; }
      draft.discard();
      setTyping(true);
      setStatus(idle);
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof ApiError && error.status === 404
        ? 'This card cannot be typed here: an adviser types the cards of the section they advise now, in a school year that is not closed.'
        : message(error) });
    }
  };
  // Recorded or refused, the card is read again and the draft dropped: what is shown is what is recorded.
  const reread = () => { draft.discard(); refresh(); };
  // After a conflict the card is read again and what was typed stays, over what is on file now (testing finding F28).
  const refresh = () => { setTick(t => t + 1); void readCard().catch(error => setStatus({ kind: 'error', text: message(error) })); };

  const descriptive = form ? descriptiveGrading(form.enrollment.grade_level, form.school_year.start_year) : false;
  const changed = typing && records ? cardBoxes(records, records.learner, descriptive).filter(b => draft.changedKeys.includes(b.key)) : [];
  const dirty = changed.length > 0;
  const close = () => (dirty ? setLeaving('close') : onClose());
  const teacher = me.role === 'teacher';
  const edit: CardEdit | undefined = typing && records ? {
    value: draft.value, set: draft.set,
    changed: key => draft.changedKeys.includes(key),
    invalid: key => (key.startsWith('g:') || key === 'a:grade') && !!gradeProblem(draft.value(key)),
    ...cardParts(records.section.grade_level, descriptive),
    attendance: (
      <>These boxes are not typed. Each month is counted from the daily register by the school’s attendance rule, so the card always agrees with the SF2. To change one, mark the days on{' '}
        <a href={teacher ? '#/attendance' : '#/sf2'} onClick={event => { if (dirty) { event.preventDefault(); setLeaving('close'); } }}>{teacher ? 'Daily attendance' : 'School Form 2'}</a>.</>
    ),
  } : undefined;

  const actions = form ? (typing ? (
    <>
      <Badge tone={dirty ? 'attention' : 'neutral'}>{dirty ? `${changed.length} ${changed.length === 1 ? 'box' : 'boxes'} changed` : 'Typing on the card'}</Badge>
      <button type="button" className="btn" disabled={!dirty || draft.problems.length > 0} onClick={() => setReviewing(true)}>Review and record</button>
      {dirty ? <button type="button" className="btn ghost" onClick={draft.discard}>Discard changes</button> : null}
      <button type="button" className="btn secondary" onClick={() => (dirty ? setLeaving('stop') : setTyping(false))}>Done typing</button>
    </>
  ) : (
    <>
      <IssuedBadge issuance={form.last_issuance} />
      <button type="button" className="btn secondary" onClick={() => void startTyping()}><Icon name="scores" size={15} />Type on the card</button>
      <button type="button" className="btn secondary" onClick={() => setPrinting(null)}><Icon name="print" size={15} />Print</button>
      <button type="button" className="btn" onClick={() => setIssuing(true)}>Issue this SF9</button>
    </>
  )) : undefined;

  return (
    <Sheet full title={`SF9 · ${learnerName(learner)}`} actions={actions} onClose={close}
      note={typing
        ? 'Type each box as the ECR shows it, then review and record. A blank box stays not recorded; it is never read as zero. Nothing here computes a grade.'
        : 'The report card for this school year, as it prints. Opening it is recorded in the privacy access log.'}>
      <StatusLine status={status} />
      {form ? (
        <>
          {!typing && form.warnings.length ? <Callout tone="attention" title="Before you issue it">{form.warnings.join(' ')}</Callout> : null}
          {typing ? <Affects what="grades">This is the report card itself, the same record as Promotion → Report card. Forms already issued keep what they said.</Affects> : null}
          {typing && draft.problems.length ? <p className="field-error" role="alert">{draft.problems[0]}</p> : null}
          <ScrollArea className="paper-frame" label="The SF9, scrolls sideways"><Sf9Sheet form={form} edit={edit} /></ScrollArea>
          {issuing ? (
            <IssueFlow
              label="SF9" cost={issueCost('SF9')}
              issue={reason => api<{ issuance: Issuance; form: Sf9Form }>(`${url}/issuances`, 'POST', reason ? { reason } : {})}
              onIssued={issuance => { setIssuing(false); setForm({ ...form, last_issuance: issuance }); setPrinting(issuance); setStatus({ text: issuedText('SF9', issuance), kind: 'done' }); }}
              onClose={() => setIssuing(false)}
              setStatus={setStatus}
            />
          ) : null}
          {reviewing && records ? (
            <CardReview learner={records.learner} rows={changed.map(b => ({ box: b, before: draft.stored[b.key] ?? '', after: draft.value(b.key).trim() }))}
              onClose={() => setReviewing(false)}
              submit={reason => api(`/enrollments/${String(enrollment.id)}/report-card`, 'POST', { ...draft.body(), reason })}
              onDone={() => { setReviewing(false); setStatus({ kind: 'done', text: `Recorded on ${learnerName(learner)}’s card: ${changed.length} ${changed.length === 1 ? 'box' : 'boxes'}.` }); reread(); }}
              onConflict={refresh} />
          ) : null}
          {leaving ? (
            <Confirm title="Leave this card without recording it?" tone="plain" confirmLabel="Leave without recording"
              body={`${changed.length === 1 ? '1 box' : `${changed.length} boxes`} on ${learnerName(learner)}’s card changed and ${changed.length === 1 ? 'is' : 'are'} not recorded yet. Leaving discards ${changed.length === 1 ? 'it' : 'them'}.`}
              onClose={() => setLeaving(null)}
              onConfirm={() => { const what = leaving; setLeaving(null); draft.discard(); if (what === 'close') onClose(); else setTyping(false); }} />
          ) : null}
          <PrintCopy printing={printing !== false} onPrinted={() => setPrinting(false)} landscape={Number(enrollment.grade_level) !== 1} long={Number(enrollment.grade_level) === 1}>
            <SeededNotice me={me} />
            <Sf9Sheet form={form} footer={footerFor('SF9')(printing || null)} />
          </PrintCopy>
        </>
      ) : !status.text ? <TableSkeleton columns={4} /> : null}
    </Sheet>
  );
}

/** The permanent record in the same view: every graded school year the caller may read, printed or issued. */
function FormDialog<F extends Sf10Form>({ api, me, title, note, url, label, render, onClose, learnerId }: {
  api: Api; me: Row; title: string; note: string; url: string; label: 'SF10';
  render: (form: F, footer?: string) => ReactNode; onClose: () => void;
  /** Whose details the form prints; a manager corrects them here, on the form, with what else they change said first. */
  learnerId?: string;
}) {
  const [form, setForm] = useState<F | null>(null);
  const [status, setStatus] = useState<Status>(idle);
  const [issuing, setIssuing] = useState(false);
  const [printing, setPrinting] = useState<Issuance | null | false>(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [tick, setTick] = useState(0);
  const manager = me.role === 'principal' || me.role === 'administrative_officer';
  useEffect(() => { void api<F>(url).then(setForm).catch(error => setStatus({ text: message(error), kind: 'error' })); }, [api, url, tick]);
  // Read fresh when opened, so the save goes against the version on file now.
  const editDetails = async () => {
    try { setEditing(await api<Row>(`/learners/${learnerId}`)); } catch (error) { setStatus({ text: message(error), kind: 'error' }); }
  };
  const actions = form ? (
    <>
      <IssuedBadge issuance={form.last_issuance} />
      {manager && learnerId ? <button type="button" className="btn secondary" onClick={() => void editDetails()}><Icon name="learners" size={15} />Edit learner details</button> : null}
      <button type="button" className="btn secondary" onClick={() => setPrinting(null)}><Icon name="print" size={15} />Print</button>
      <button type="button" className="btn" onClick={() => setIssuing(true)}>Issue this {label}</button>
    </>
  ) : undefined;

  return (
    <Sheet full title={title} note={note} actions={actions} onClose={onClose}>
      <StatusLine status={status} />
      {form ? (
        <>
          {!form.blocks.length ? <Callout tone="attention" title="Before you issue it">No graded school year is on record for this learner yet.</Callout> : null}
          <ScrollArea className="paper-frame" label="The form, scrolls sideways">{render(form)}</ScrollArea>
          {issuing ? (
            <IssueFlow
              label={label} cost={issueCost(label)}
              issue={reason => api<{ issuance: Issuance; form: F }>(`${url}/issuances`, 'POST', reason ? { reason } : {})}
              onIssued={issuance => { setIssuing(false); setForm({ ...form, last_issuance: issuance }); setPrinting(issuance); setStatus({ text: issuedText(label, issuance), kind: 'done' }); }}
              onClose={() => setIssuing(false)}
              setStatus={setStatus}
            />
          ) : null}
          {editing ? (
            <FormSheet title="Edit learner details" note="Correct the details exactly as the birth certificate or PSA record shows them. An assigned LRN is not changed here."
              warning={<Affects what="learner" />} submitLabel="Save details" fields={profileFields} initial={editing}
              onSubmit={data => api(`/learners/${learnerId}`, 'PATCH', { ...data, version: editing.version })}
              onSaved={() => { setEditing(null); setTick(t => t + 1); setStatus({ text: 'Learner details saved. The SF10 now shows them.', kind: 'done' }); }}
              onClose={() => setEditing(null)} />
          ) : null}
          <PrintCopy printing={printing !== false} onPrinted={() => setPrinting(false)} landscape={false} long>
            <SeededNotice me={me} />
            {render(form, footerFor(label)(printing || null))}
          </PrintCopy>
        </>
      ) : !status.text ? <TableSkeleton columns={4} /> : null}
    </Sheet>
  );
}

export function Sf10Dialog({ api, me, learner, onClose }: { api: Api; me: Row; learner: Row; onClose: () => void }) {
  return (
    <FormDialog<Sf10Form> api={api} me={me} label="SF10" title={`SF10 · ${learnerName(learner)}`}
      note="The permanent record: every graded school year you may read. Opening it is recorded in the privacy access log."
      url={`/learners/${String(learner.id)}/forms/sf10`} learnerId={String(learner.id)}
      render={(form, footer) => <Sf10Sheet form={form} footer={footer} />} onClose={onClose} />
  );
}
