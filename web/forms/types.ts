// The shapes the form endpoints answer with. The API computes every figure;
// the workspace only lays them out, so nothing here does arithmetic beyond
// formatting a number for the page.

export type Trio = { male: number; female: number; total: number };
export type MaybeTrio = { male: number | null; female: number | null; total: number | null };
export type FormSchool = {
  name: string; school_code: string | null; address: string; region: string | null; division: string | null; district: string | null;
  school_head_name: string | null; school_head_position: string | null;
};
export type DayRule = { mixed_day: 'tardy' | 'absent' | 'half_day'; single_session_day: 'counts' | 'not_counted'; version: number };
export type Issuance = {
  id: string; serial: number; form: 'sf2' | 'sf4' | 'sf9' | 'sf10'; data_hash: string; day_rule_version: number | null;
  supersedes_id: string | null; reason: string | null; issued_at: string; reprint?: boolean;
};
export type Session = 'present' | 'absent' | null;
export type Sf2Cell = 'out' | 'no_class' | { mark: 'present' | 'absent' | 'late' | 'cutting' | 'half' | 'unmarked' | 'waiting' | 'pending'; present: number; absent: number; tardy: number; am: Session; pm: Session };
export type Sf2Form = {
  form: 'sf2'; school: FormSchool; section: { id: string; grade_level: number; name: string; adviser_name: string | null };
  school_year: { id: string; start_year: number }; month_on: string; from: string; to: string; cutoff: string;
  month_status: 'draft' | 'submitted' | 'locked'; rule: DayRule | null;
  columns: { day_on: string; date: number; weekday: string; kind: 'class' | 'no_class' | 'unconfigured' | 'alternative_delivery' }[];
  learners: { no: number; enrollment_id: string; name: string; sex: 'male' | 'female'; lrn: string | null; days: Record<string, Sf2Cell>;
    absent: number | null; present: number | null; tardy: number | null; absent_five_consecutive: boolean | null; registered_at_end: boolean; remarks: string[] }[];
  daily: { day_on: string; male: number | null; female: number | null; total: number | null }[];
  summary: {
    days_of_classes: number; enrolment_at_cutoff: Trio; late_enrolment: Trio; registered: Trio; percentage_of_enrolment: MaybeTrio;
    average_daily_attendance: Trio | null; percentage_of_attendance: MaybeTrio | null; absent_five_consecutive: Trio | null;
    dropped_out: Trio; transferred_out: Trio; transferred_in: Trio;
  };
  completeness: { complete: boolean; rule_recorded: boolean; unmarked_sessions: number; pending_days: number; unconfigured_days: number; alternative_delivery_days: number };
  /** Only while days of classes are still to come: every total on the form is then counted to this date, not for the month. */
  to_date?: { as_of: string; days_held: number };
  last_issuance?: Issuance | null;
};
type Spans = { a: Trio; b: Trio; ab: Trio };
export type Sf4Row = { registered: Trio; average_daily_attendance: Trio | null; percentage: MaybeTrio | null; dropout: Spans; transferred_out: Spans; transferred_in: Spans; death: Spans; withdrawal: Spans };
export type Sf4Form = {
  form: 'sf4'; school: FormSchool; school_year: { id: string; start_year: number }; month_on: string; from: string; to: string; rule: DayRule | null;
  sections: (Sf4Row & { section_id: string; grade_level: number; name: string; adviser_name: string | null; adviser_position: string | null; adviser_specialization: string | null;
    month_status: 'draft' | 'submitted' | 'locked'; days_of_classes: number | null;
    completeness: { complete: boolean; unmarked_learner_days: number; pending_days: number; unconfigured_days: number; alternative_delivery_days: number } })[];
  grades: (Sf4Row & { grade_level: number })[];
  school_total: Sf4Row;
  other_staff: { name: string; role: string; position: string | null; specialization: string | null }[];
  completeness: { complete: boolean; rule_recorded: boolean; incomplete_sections: number; not_submitted: number };
  last_issuance?: Issuance | null;
};

/** Two decimal places, as the school's own SF4 workbook formats its averages and percentages. */
export const two = (n: number | null | undefined) => (n === null || n === undefined ? '' : n.toFixed(2));
export const percent = (n: number | null | undefined) => (n === null || n === undefined ? '' : `${n.toFixed(2)}%`);
/** A count that may be a half day: whole numbers plainly, halves as .5. */
export const days = (n: number | null | undefined) => (n === null || n === undefined ? '' : Number.isInteger(n) ? String(n) : n.toFixed(1));
export const levelName = (grade: number) => (grade === 0 ? 'Kinder' : `Grade ${grade}`);
export const fingerprint = (hash: string) => hash.slice(0, 12);
export const schoolYearLabel = (start: number) => `${start} - ${start + 1}`;

export const ruleWords: Record<DayRule['mixed_day'], string> = {
  tardy: 'present for one session and absent for the other is marked tardy (half-shaded) and counted present',
  absent: 'absent for either session is marked absent for the day',
  half_day: 'present for one session and absent for the other counts as half a day present',
};

export type CardLearner = { id: string; first_name: string; middle_name: string | null; last_name: string; name_extension: string | null; sex: 'male' | 'female'; lrn: string | null; birth_date: string | null };
export type Age = { years: number; months: number } | null;
export type CardPeriod = { id: string; ordinal: number; name: string };
export type CardSubject = { offering_id: string; code: string; name: string; terms: Record<string, number | null>; final: number | null; remark: 'passed' | 'failed' | null };
export type CardAverage = { value: number | null; remark: 'passed' | 'failed' | null };
export type Outcome = { action: 'promoted' | 'conditionally_promoted' | 'retained' | 'remedial' | null; eligible_grade: number | null };
export type Sf9Form = {
  form: 'sf9'; layout: 'grade1' | 'grades2_3' | 'grades4_6'; school: FormSchool;
  school_year: { id: string; start_year: number; starts_on: string; ends_on: string };
  learner: CardLearner & { age_at_start: Age; age_at_end: Age };
  enrollment: { id: string; grade_level: number; section_name: string; adviser_name: string | null };
  periods: CardPeriod[]; rule: DayRule | null;
  attendance: { rows: { label: string; term: string | null; from: string; to: string; class_days: number | null; present: number | null; absent: number | null; tardy: number | null; known: boolean; to_date?: string }[];
    total: { class_days: number | null; present: number | null; absent: number | null; tardy: number | null; to_date?: string } };
  subjects: CardSubject[]; general_average: CardAverage; outcome: Outcome; values: Record<string, Record<string, string>>;
  notes: Record<string, { can_do: string | null; to_improve: string | null; comment: string | null }>; warnings: string[];
  last_issuance?: Issuance | null;
};
export type Sf10Form = {
  form: 'sf10'; school: FormSchool; learner: CardLearner;
  blocks: { enrollment_id: string; grade_level: number; section_name: string; adviser_name: string | null; school_year: { id: string; start_year: number };
    periods: CardPeriod[]; subjects: CardSubject[]; general_average: CardAverage; outcome: Outcome }[];
  last_school_year: number | null; eligible_grade: number | null; kindergarten_here: boolean;
  last_issuance?: Issuance | null;
};

/** A grade exactly as it was entered: 89, 88.5 or 88.25, never rounded for the page. */
export const shownGrade = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));
export const remarkWord = (r: 'passed' | 'failed' | null) => (r === 'passed' ? 'Passed' : r === 'failed' ? 'Failed' : '');
/** Surname, given name and extension, then middle name, as the cards' Name line reads. */
export const cardName = (l: CardLearner) => `${l.last_name}, ${l.first_name}${l.name_extension ? ` ${l.name_extension}` : ''}${l.middle_name ? ` ${l.middle_name}` : ''}`;
