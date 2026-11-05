import { useEffect, useState } from 'react';
import type { Api, Page, Row } from '../api';
import { message, query } from '../api';
import { Icon } from '../components/icons';
import { Affects } from '../components/affects';
import { profileFields } from '../record-fields';
import { IdentityHistory, LrnCorrection, LrnHistory, ReviewActions } from './Reviews';
import {
  Badge, Callout, Editor, StatusLine, Table, Task, Unrecorded,
  gradeName, idle, sentence, shown, value, type Status,
} from '../components/primitives';

/**
 * Where a learner sits in the active school year, as `GET /learners` reports it
 * beside each row. The registry owns the shape; this screen only reads it.
 */
type Placement = { enrollment_id: string; academic_year_id: string; grade_level: number; section_id: string | null; section_name: string | null; status: string };

type Tab = 'profile' | 'history' | 'enrollment';
const tabs: [Tab, string][] = [['profile', 'Learner profile'], ['history', 'Academic history'], ['enrollment', 'Enrollment']];

/**
 * One learner, opened from the registry, in three parts rather than one column.
 *
 * The parts are the three different questions a staff member opens a learner to
 * answer, and they are deliberately not the same record: the **profile** is the
 * one permanent identity row in `learners`, the **academic history** is the
 * previous school years transcribed from the school's own documents, and the
 * **enrollment** is the annual timeline in `enrollments`. They used to be one
 * panel, which made whichever was being looked for the hardest to find and
 * invited the reading that correcting a name was correcting a year.
 *
 * Two things it does not do. It **shows no field the registry does not already
 * hold** — the class-list import collects `lrn, first_name, middle_name,
 * last_name, name_extension, birth_date, sex, address` and nothing else, so
 * there is no parent, guardian, contact number or demographic breakdown to show,
 * and none is invented here; which further fields may exist at all is behind the
 * learner-fields gate. And it **transcribes no history of its own**: Academic
 * history hands the learner to the screen that already does that, as
 * `#/prior-records?learner=<id>`, where only the id travels.
 */
export function LearnerDetail({ api, learner, manager, canEncodeHistory, setStatus, reload, yearLabel, sectionLabel, onIdentity, onView, onSf9 }: {
  api: Api; learner: Row; manager: boolean; canEncodeHistory: boolean;
  setStatus: (s: Status) => void; reload: () => void;
  yearLabel: (id: unknown) => string; sectionLabel: (id: unknown) => string;
  onIdentity: () => void; onView: (enrollment: Row) => void; onSf9: (enrollment: Row) => void;
}) {
  const [tab, setTab] = useState<Tab>('profile');
  const id = String(learner.id);
  const placement = (learner.placement as Placement | null) ?? null;

  return (
    <>
      <div className="segmented" role="tablist" aria-label="What to read about this learner">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : undefined} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === 'profile' ? (
        <>
          <h3>Personal information</h3>
          <dl className="facts">
            {/* An LRN the school has not been issued yet is a gap in the record, not a value someone left out. */}
            <div><dt>Learner reference number</dt><dd>{learner.lrn == null ? <Unrecorded label="LRN missing" /> : <span className="mono">{value(learner, 'lrn')}</span>}</dd></div>
            <div><dt>Last name</dt><dd>{shown(learner, 'last_name')}</dd></div>
            <div><dt>First name</dt><dd>{shown(learner, 'first_name')}</dd></div>
            <div><dt>Middle name</dt><dd>{shown(learner, 'middle_name', 'None recorded')}</dd></div>
            <div><dt>Extension</dt><dd>{shown(learner, 'name_extension', 'None')}</dd></div>
            <div><dt>Birth date</dt><dd><span className="mono">{value(learner, 'birth_date')}</span></dd></div>
            <div><dt>Sex as recorded on school forms</dt><dd>{sentence(value(learner, 'sex'))}</dd></div>
          </dl>

          <h3>Address</h3>
          <dl className="facts">
            <div><dt>Address</dt><dd>{shown(learner, 'address', 'No address recorded')}</dd></div>
          </dl>
          <p className="muted">
            One line, as the school’s own learner information writes it, and the only learner field EDUNEXUS holds beyond the name, LRN, birth date and sex.
            It is printed on no DepEd form, because none of the forms the school has supplied has a box for it.
          </p>

          <Callout tone="plain" title="What this record does not hold">
            No parent or guardian name, relationship or contact number, and no mother tongue, religion or indigenous group. These are not blank fields waiting to be
            filled in: EDUNEXUS does not collect them, the class-list import has no column for them, and which facts about a child and their family the school may
            keep is the school’s own answer to give, in the reviewed field list it still owes. Nothing here guesses at one.
          </Callout>

          {manager ? (
            <>
              <Task title="Correct the details" note="Spelling, birth date, extension, address">
                <p className="muted">
                  The same record the class-list import writes and every form reads, corrected in place: there is no second copy of a learner, so what is saved here
                  is what the registry, the register, the class list and the forms show from their next read. An assigned LRN is never changed here; correcting one
                  is the separate reviewed workflow below.
                </p>
                <Editor fields={profileFields} initial={learner} setStatus={setStatus} onSaved={reload} warning={<Affects what="learner" />}
                  onSubmit={data => api(`/learners/${id}`, 'PATCH', { ...data, version: learner.version })} />
              </Task>
              {learner.lrn == null ? (
                <Task title="Fill the official LRN" note="Recorded once, and never cleared">
                  <p className="muted">EDUNEXUS never invents an LRN. Enter it only when the school has been issued one.</p>
                  <Editor submitLabel="Assign LRN" setStatus={setStatus} onSaved={reload} warning={<Affects what="lrn" />}
                    fields={[{ key: 'lrn', label: 'Learner Reference Number', pattern: '[0-9 -]{12,20}', maxLength: 20, hint: 'Exactly twelve digits, leading zeroes included.' }]}
                    onSubmit={data => api(`/learners/${id}/lrn`, 'PATCH', { ...data, version: learner.version })} />
                </Task>
              ) : (
                <Task title="Correct the assigned LRN" note="Reviewed, and the old number kept">
                  <LrnCorrection api={api} learner={learner} setStatus={setStatus} onDone={reload} />
                  <h3>Earlier corrections</h3>
                  <LrnHistory api={api} learnerId={id} />
                </Task>
              )}
              <Task title="Identity links" note="Duplicate records of the same child">
                <p className="muted">When two registry entries are the same child, link the duplicate to the record that is kept. Both stay on file.</p>
                <ReviewActions>
                  <button type="button" className="btn secondary" onClick={onIdentity}>This is the same child as another record</button>
                </ReviewActions>
                <IdentityHistory api={api} learnerId={id} />
              </Task>
              <p className="card-note">
                <a href={`#/access?record=${id}`}>Who has opened this record</a> — the privacy access log, narrowed to this learner, including every read of their enrollments.
              </p>
            </>
          ) : (
            <Callout tone="info" title="Corrections stay with the office">
              You read the learners in the classes you advise, and the API refuses a profile correction from an adviser however this screen is reached. Correcting a
              profile, assigning an LRN or linking a duplicate record is a principal’s or an administrative officer’s, so that one spelling of a name is the school’s.
              Ask the office, naming what is wrong and what it should say.
            </Callout>
          )}
        </>
      ) : null}

      {tab === 'history' ? (
        <>
          <h3>Academic history</h3>
          <p className="muted">
            The school years this learner finished <b>before</b> EDUNEXUS, transcribed one year at a time from the school’s own documents, and the credential
            presented for Grade 1. They are on <b>Academic history</b> in the navigation rail, which is the one place they are typed in and read.
          </p>
          {/*
            No link, and that is the decision rather than an omission. The
            shortcut *Academic history before EDUNEXUS* lived in this panel and
            was taken out in 0.90.2, because the rail already carries the
            screen; `tests/web-registry-scope.test.ts` holds that. So this tab
            says where the records are and what they are, and stays a signpost:
            putting the door back here is the user's decision to make, not a
            consequence of reorganising the panel.
          */}
          <Callout tone="info" title="Why it is a screen of its own">
            An encoded school year is a copy of a document, not an enrolment. It reaches the learner’s SF10 as one scholastic block and nothing else: no register,
            no SF2, no SF4, no SF9, and nobody’s current grade or section. The grades EDUNEXUS recorded itself are on Promotion → Report card rather than here, and
            nothing on either screen computes an average. That is also why this tab holds no copy of them: there is one set of historical records per learner, and
            the screen that writes them is the screen that shows them.
          </Callout>
          {canEncodeHistory ? null : (
            <p className="muted">
              Every class you advise is Kindergarten or Grade 1, so there is no previous school year to encode for anyone in them, and Academic history is not in
              your navigation: an SF10 scholastic block begins at Grade 1, and Kindergarten is the credential presented for it rather than a block of its own.
            </p>
          )}
        </>
      ) : null}

      {tab === 'enrollment' ? (
        <>
          <h3>This school year</h3>
          {placement ? (
            <dl className="facts">
              <div><dt>School year</dt><dd>{yearLabel(placement.academic_year_id)}</dd></div>
              <div><dt>Grade level</dt><dd>{gradeName(placement.grade_level)}</dd></div>
              {/* Three different things, and the interface says which: in a class,
                  enrolled at a grade with no class yet, or not enrolled at all. */}
              <div><dt>Section</dt><dd>{placement.section_name ?? <Badge tone="attention">No section yet</Badge>}</dd></div>
              <div><dt>Status</dt><dd>{sentence(placement.status)}</dd></div>
            </dl>
          ) : (
            <p><Unrecorded label="Not enrolled in the active school year" /></p>
          )}
          <EnrollmentHistory api={api} learnerId={id} manager={manager} yearLabel={yearLabel} sectionLabel={sectionLabel} onView={onView} onSf9={onSf9} />
        </>
      ) : null}
    </>
  );
}

/**
 * A learner's enrolment history, read when their row is opened.
 *
 * It used to sit behind a folded panel and a "Load enrollment records" button:
 * every enrolment returned is named in the privacy audit, so the registry must
 * not fetch them for a list nobody asked for. Opening one learner's record *is*
 * that asking — it is deliberate, it is one learner, and the access row it
 * writes says exactly that. The list itself still never loads them, which is
 * the rule that mattered; the two clicks in front of it were not.
 */
export function EnrollmentHistory({ api, learnerId, manager, yearLabel, sectionLabel, onView, onSf9 }: {
  api: Api; learnerId: string; manager: boolean;
  yearLabel: (id: unknown) => string; sectionLabel: (id: unknown) => string;
  onView: (enrollment: Row) => void; onSf9: (enrollment: Row) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [status, setStatus] = useState<Status>(idle);
  useEffect(() => {
    let live = true;
    setRows(null);
    void api<Page>(`/enrollments${query({ learner_id: learnerId, limit: 100, record_state: manager ? 'all' : undefined })}`)
      .then(result => { if (live) setRows(result.items); })
      .catch(error => { if (live) { setRows([]); setStatus({ kind: 'error', text: message(error) }); } });
    return () => { live = false; };
  }, [api, learnerId, manager]);
  return (
    <>
      <h3>School years</h3>
      <p className="muted">Every year this learner has been enrolled. Reading them is recorded in the privacy access log.</p>
      <StatusLine status={status} />
      <Table
        loading={rows === null}
        rows={rows ?? []}
        rowKey={r => String(r.id)}
        empty={<p className="muted">This learner has no enrollment records yet.</p>}
        columns={[
          { header: 'School year', cell: r => yearLabel(r.academic_year_id) },
          { header: 'Grade', cell: r => gradeName(r.grade_level) },
          { header: 'Section', cell: r => sectionLabel(r.section_id) },
          { header: 'Status', cell: r => sentence(value(r, 'status')) },
          { header: 'Enrolled', cell: r => <span className="mono">{value(r, 'enrolled_on')}</span> },
          { header: 'Latest change', cell: r => `${value(r, 'effective_on')} · ${sentence(value(r, 'last_reason'))}` },
          { header: 'Record', cell: r => (r.record_state === 'voided' ? <Badge tone="stopped">Voided</Badge> : <Badge tone="good">Valid</Badge>) },
          {
            header: 'Attendance',
            // The SF9 here is this year's card, not the current one the registry
            // row opens, and it is the only way to reach a past year's.
            cell: r => (r.record_state === 'voided' ? <span className="muted">Not shown for a voided record</span>
              : <span className="row-actions">
                  <button type="button" className="btn ghost small" onClick={() => onView(r)}>View the year</button>
                  <button type="button" className="btn secondary small form-open" onClick={() => onSf9(r)}><Icon name="form" size={14} />SF9</button>
                </span>),
          },
        ]}
      />
    </>
  );
}
