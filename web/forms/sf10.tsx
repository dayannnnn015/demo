import type { ReactNode } from 'react';
import { remarkWord, schoolYearLabel, shownGrade, type Sf10Form } from './types';

// The SF10-ES in the layout of DepEd's permanent-record workbook (the 2025
// revision the school supplied): the learner, eligibility for Grade 1, one
// scholastic block per graded school year, and the certification boxes. What
// EDUNEXUS does not hold — the eligibility credential, remedial classes, a
// signature — is left as the form's own blank lines.

type Block = Sf10Form['blocks'][number];

function Scholastic({ form, block }: { form: Sf10Form; block: Block | null }) {
  const s = form.school;
  const periods = block?.periods.length ? block.periods : [1, 2, 3, 4].map(n => ({ id: `q${n}`, ordinal: n, name: String(n) }));
  return (
    <div className="sf10-block">
      <table className="paper-grid sf10-head">
        <tbody>
          <tr><th>School:</th><td>{block ? s.name : ''}</td><th>School ID:</th><td>{block ? s.school_code ?? '' : ''}</td></tr>
          <tr><th>District:</th><td>{block ? s.district ?? '' : ''}</td><th>Division:</th><td>{block ? s.division ?? '' : ''}</td></tr>
          <tr><th>Region:</th><td>{block ? s.region ?? '' : ''}</td><th>School Year:</th><td>{block ? schoolYearLabel(block.school_year.start_year) : ''}</td></tr>
          <tr><th>Classified as Grade:</th><td>{block?.grade_level ?? ''}</td><th>Section:</th><td>{block?.section_name ?? ''}</td></tr>
          <tr><th>Name of Adviser/Teacher:</th><td>{block?.adviser_name ?? ''}</td><th>Signature:</th><td /></tr>
        </tbody>
      </table>
      <table className="paper-grid sf10-grades">
        <thead>
          <tr><th rowSpan={2}>Learning Areas</th><th colSpan={periods.length}>Quarterly Rating</th><th rowSpan={2}>Final Rating</th><th rowSpan={2}>Remarks</th></tr>
          <tr>{periods.map(p => <th key={p.id}>{p.ordinal}</th>)}</tr>
        </thead>
        <tbody>
          {(block?.subjects ?? []).map(subject => (
            <tr key={subject.offering_id}>
              <td>{subject.name}</td>
              {periods.map(p => <td key={p.id} className="numeric">{shownGrade(subject.terms[p.id])}</td>)}
              <td className="numeric">{shownGrade(subject.final)}</td><td className="numeric">{remarkWord(subject.remark).toUpperCase()}</td>
            </tr>
          ))}
          {block ? null : [0, 1, 2, 3, 4].map(i => <tr key={i}><td>&nbsp;</td>{periods.map(p => <td key={p.id} />)}<td /><td /></tr>)}
          <tr className="card-average"><td><b>General Average</b></td>{periods.map(p => <td key={p.id} />)}<td className="numeric"><b>{shownGrade(block?.general_average.value)}</b></td>
            <td className="numeric">{remarkWord(block?.general_average.remark ?? null).toUpperCase()}</td></tr>
        </tbody>
      </table>
      <table className="paper-grid sf10-remedial">
        <thead>
          <tr><th>Remedial Classes</th><th colSpan={4}>Conducted from: ____________ to ____________</th></tr>
          <tr><th>Learning Areas</th><th>Final Rating</th><th>Remedial Class Mark</th><th>Recomputed Final Grade</th><th>Remarks</th></tr>
        </thead>
        <tbody>{[0, 1].map(i => <tr key={i}><td>&nbsp;</td><td /><td /><td /><td /></tr>)}</tbody>
      </table>
    </div>
  );
}

function Certification({ form }: { form: Sf10Form }) {
  const l = form.learner;
  const name = `${l.first_name}${l.middle_name ? ` ${l.middle_name}` : ''} ${l.last_name}${l.name_extension ? ` ${l.name_extension}` : ''}`;
  return (
    <div className="sf10-certification">
      <h4>CERTIFICATION</h4>
      <p>I CERTIFY that this is a true record of <b>{name.toUpperCase()}</b> with LRN <b>{l.lrn ?? '____________'}</b> and that he/she is eligible for admission to Grade <b>{form.eligible_grade ?? '______'}</b>.</p>
      <p>School Name: <b>{form.school.name}</b> &nbsp; School ID: <b>{form.school.school_code ?? ''}</b> &nbsp; Division: <b>{form.school.division ?? ''}</b> &nbsp; Last School Year Attended: <b>{form.last_school_year ? schoolYearLabel(form.last_school_year) : ''}</b></p>
      <div className="card-signatures">
        <div className="card-signature"><b>&nbsp;</b><span>Date</span></div>
        <div className="card-signature"><b>{form.school.school_head_name?.toUpperCase() ?? ''}</b><span>Signature of Principal/School Head over Printed Name</span></div>
        <div className="card-signature"><b>&nbsp;</b><span>(Affix School Seal here)</span></div>
      </div>
    </div>
  );
}

export function Sf10Sheet({ form, footer }: { form: Sf10Form; footer?: ReactNode }) {
  const l = form.learner;
  // The workbook prints eight blocks across front and back; a learner's record fills them in order.
  const blocks: (Block | null)[] = [...form.blocks, ...Array.from({ length: Math.max(0, (form.blocks.length <= 4 ? 4 : 8) - form.blocks.length) }, () => null)];
  return (
    <div className="paper sf10">
      <div className="card-page portrait">
        <div className="sf10-title">
          <span className="card-small">SF10-ES</span>
          <p>Republic of the Philippines</p>
          <p>Department of Education</p>
          <h3>Learner Permanent Academic Record for Elementary School (SF10-ES)</h3>
          <p>(Formerly Form 137)</p>
        </div>
        <h4 className="sf10-band">LEARNER’S PERSONAL INFORMATION</h4>
        <table className="paper-grid sf10-head">
          <tbody>
            <tr><th>LAST NAME:</th><td>{l.last_name.toUpperCase()}</td><th>FIRST NAME:</th><td>{l.first_name.toUpperCase()}</td><th>NAME EXTN. (Jr,I,II)</th><td>{l.name_extension ?? ''}</td><th>MIDDLE NAME:</th><td>{(l.middle_name ?? '').toUpperCase()}</td></tr>
            <tr><th>Learner Reference Number (LRN):</th><td colSpan={2}>{l.lrn ?? ''}</td><th>Birthdate (mm/dd/yyyy):</th><td colSpan={2}>{l.birth_date ? `${l.birth_date.slice(5, 7)}/${l.birth_date.slice(8, 10)}/${l.birth_date.slice(0, 4)}` : ''}</td><th>Sex:</th><td>{l.sex === 'male' ? 'MALE' : 'FEMALE'}</td></tr>
          </tbody>
        </table>
        <h4 className="sf10-band">ELIGIBILITY FOR ELEMENTARY SCHOOL ENROLLMENT</h4>
        <p className="sf10-eligibility">Credential Presented for Grade 1: ☐ Kinder Progress Report &nbsp; ☐ ECCD Checklist &nbsp; ☐ Kindergarten Certificate of Completion</p>
        <p className="sf10-eligibility">Name of School: ______________________ &nbsp; School ID: __________ &nbsp; Address of School: ______________________</p>
        <p className="sf10-eligibility">Other Credential Presented: ☐ PEPT Passer Rating: ______ &nbsp; Date of Examination/Assessment (mm/dd/yyyy): __________ &nbsp; ☐ Others (Pls. Specify): ____________</p>
        <p className="sf10-eligibility">Name and Address of Testing Center: ______________________________ &nbsp; Remark: ____________</p>
        <h4 className="sf10-band">SCHOLASTIC RECORD</h4>
        <div className="sf10-blocks">{blocks.slice(0, 4).map((b, i) => <Scholastic key={b?.enrollment_id ?? `empty${i}`} form={form} block={b} />)}</div>
        <p className="card-small">Revised 2025 based on DepEd Order No. 10, s. 2024</p>
      </div>
      <div className="card-page portrait">
        {blocks.length > 4 ? <div className="sf10-blocks">{blocks.slice(4).map((b, i) => <Scholastic key={b?.enrollment_id ?? `empty${i + 4}`} form={form} block={b} />)}</div> : null}
        <h4 className="sf10-band">For Transfer Out /Elementary School Completer Only</h4>
        <Certification form={form} />
        {footer ? <p className="print-foot">{footer}</p> : null}
      </div>
    </div>
  );
}
